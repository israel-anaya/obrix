//! Renglones numéricos (`cantidad`) de una valuación (`cuadrilla_costo`) —
//! `cantidad` es el único campo capturable (ver diccionario de datos);
//! `costo`/`importe` los deriva `CuadrillaCostoService::recalcular_valuacion`.
//! Las filas nacen/mueren junto con la receta (`CuadrillaDetalleService`) o
//! junto con una valuación regional (`CuadrillaCostoService::crear_regional`/
//! `eliminar_regional`) — este servicio solo edita `cantidad` en filas que ya
//! existen.

use obrix_db::entities::cuadrilla_costo::Model as CuadrillaCostoModel;
use obrix_db::entities::cuadrilla_costo_detalle;
use obrix_db::PortafolioRepository;
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait};

use crate::cuadrilla_costo::CuadrillaCostoService;
use crate::ServiceError;

#[derive(serde::Deserialize)]
pub struct CuadrillaCostoDetalleData {
    pub cantidad: Decimal,
}

pub struct CuadrillaCostoDetalleService;

impl CuadrillaCostoDetalleService {
    pub async fn listar_por_costo(
        repo: &dyn PortafolioRepository,
        cuadrilla_costo_id: &str,
    ) -> Result<Vec<cuadrilla_costo_detalle::Model>, ServiceError> {
        Ok(cuadrilla_costo_detalle::Entity::find()
            .filter(cuadrilla_costo_detalle::Column::CuadrillaCostoId.eq(cuadrilla_costo_id))
            .filter(cuadrilla_costo_detalle::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: CuadrillaCostoDetalleData,
        actualizado_por: Option<String>,
    ) -> Result<CuadrillaCostoModel, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = cuadrilla_costo_detalle::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_costo_detalle {id}")))?;
        let cuadrilla_costo_id = existente.cuadrilla_costo_id.clone();

        let mut am: cuadrilla_costo_detalle::ActiveModel = existente.into();
        am.cantidad = Set(datos.cantidad);
        am.updated_at = Set(Some(crate::ahora()));
        am.updated_by = Set(actualizado_por);
        am.update(&txn).await?;

        let resultado = CuadrillaCostoService::recalcular_valuacion(&txn, &cuadrilla_costo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::categoria_fasar::{CategoriaFasarData, CategoriaFasarService};
    use crate::cuadrilla::{CuadrillaData, CuadrillaService};
    use crate::cuadrilla_detalle::{CuadrillaDetalleData, CuadrillaDetalleService};
    use crate::factor_salario_real::{FactorSalarioRealData, FactorSalarioRealService};
    use crate::salario_categoria_fasar::{SalarioCategoriaFasarData, SalarioCategoriaFasarService};
    use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
    use obrix_db::PortafolioSqliteRepository;
    use sea_orm::ActiveModelTrait;
    use std::path::Path;
    use std::str::FromStr;

    async fn portafolio_con_fixtures() -> PortafolioSqliteRepository {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-15T00:00:00Z".to_string();

        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set("a@a.com".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(now.clone()),
            created_by: Set(None),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        moneda::ActiveModel {
            id: Set("mon-1".into()),
            codigo: Set("MXN".into()),
            nombre: Set("Peso mexicano".into()),
            simbolo: Set("$".into()),
            decimales: Set(2),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        organizacion::ActiveModel {
            id: Set("org-1".into()),
            razon_social: Set("Org".into()),
            rfc: Set("XAXX010101000".into()),
            tipo: Set(organizacion::TipoOrganizacion::Despacho),
            moneda_default_id: Set("mon-1".into()),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        for (id, simbolo, descripcion) in [("um-jor", "jor", "Jornal"), ("um-cuad", "cuad", "Cuadrilla")] {
            unidad_medida::ActiveModel {
                id: Set(id.into()),
                simbolo: Set(simbolo.into()),
                simbolo_impresion: Set(simbolo.into()),
                variantes: Set("".into()),
                clave_sat: Set(None),
                descripcion: Set(descripcion.into()),
                tipo_magnitud: Set(unidad_medida::TipoMagnitud::Otro),
                created_at: Set(now.clone()),
                created_by: Set("usr-1".into()),
                updated_at: Set(None),
                updated_by: Set(None),
                deleted: Set(false),
                deleted_at: Set(None),
                deleted_by: Set(None),
            }
            .insert(portafolio.conexion())
            .await
            .unwrap();
        }

        portafolio
    }

    #[tokio::test]
    async fn actualizar_cantidad_recalcula_la_valuacion() {
        let portafolio = portafolio_con_fixtures().await;

        let fsr = FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            FactorSalarioRealData {
                nombre: "FSR nacional".into(),
                region_id: None,
                modelo_calculo_json: String::new(),
                parametros_json: String::new(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear FSR")
        .id;

        let oficial = CategoriaFasarService::crear(
            &portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial albañil".into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria_fasar")
        .id;

        SalarioCategoriaFasarService::crear(
            &portafolio,
            &oficial,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str("700").unwrap(),
                factor_salario_real_id: fsr,
                factor_salario_real: Decimal::ONE,
                salario_real_diario: Decimal::from_str("700").unwrap(),
                region_id: None,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("registrar salario");

        let cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla de albañilería tipo A".into(),
                unidad_id: "um-cuad".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla");

        let tras_crear = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData { detalle_insumo_id: oficial, cantidad_nacional: Decimal::ONE },
            "usr-1".into(),
        )
        .await
        .expect("agregar oficial");
        let nacional_id = tras_crear.costo_nacional.as_ref().unwrap().id.clone();
        assert_eq!(tras_crear.costo_nacional.as_ref().unwrap().sub_total_mano_obra, Decimal::from(700));

        let detalle = CuadrillaCostoDetalleService::listar_por_costo(&portafolio, &nacional_id)
            .await
            .expect("listar detalles de la valuación nacional");
        assert_eq!(detalle.len(), 1);

        let actualizada = CuadrillaCostoDetalleService::actualizar(
            &portafolio,
            detalle[0].id.clone(),
            CuadrillaCostoDetalleData { cantidad: Decimal::from(3) },
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar cantidad");
        // 3 × 700 = 2100.
        assert_eq!(actualizada.sub_total_mano_obra, Decimal::from(2100));
        assert_eq!(actualizada.costo_total, Decimal::from(2100));
    }
}
