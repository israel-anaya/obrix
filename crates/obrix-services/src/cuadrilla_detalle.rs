//! Administra la composición (`cuadrilla_detalle`) de una `cuadrilla` —
//! integrantes (`categoria_fasar`) y herramienta (`herramienta`), en una
//! matriz plana no recursiva **compartida entre regiones** (ver diccionario
//! de datos). `cantidad` vive aquí (definición del equipo); `costo`/`importe`
//! los administra el recálculo de cada `cuadrilla_costo`. Cada alta/baja o
//! cambio de cantidad crea/borra/recalcula la fila espejo en **cada**
//! valuación existente de la cuadrilla (nacional y regionales).

use obrix_db::PortafolioRepository;
use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
use obrix_db::entities::{
    categoria_fasar, cuadrilla, cuadrilla_costo, cuadrilla_costo_detalle, cuadrilla_detalle,
    herramienta, insumo,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseTransaction, EntityTrait, QueryFilter,
    QueryOrder, TransactionTrait,
};

use crate::cuadrilla::{CuadrillaCompleto, combinar as combinar_cuadrilla};
use crate::cuadrilla_costo::CuadrillaCostoService;
use crate::{ServiceError, nuevo_id};

#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DireccionMovimiento {
    Arriba,
    Abajo,
}

#[derive(serde::Deserialize)]
pub struct CuadrillaDetalleData {
    pub detalle_insumo_id: String,
    /// Jornales/integrantes si `detalle_insumo_id` resuelve a `categoria_fasar`;
    /// porcentaje 0-100 (no fracción) si resuelve a `herramienta`. Queda en
    /// la receta, igual en todas las regiones.
    pub cantidad: Decimal,
}

#[derive(serde::Deserialize)]
pub struct CuadrillaDetalleEditarData {
    pub detalle_insumo_id: String,
    pub cantidad: Decimal,
}

pub struct CuadrillaDetalleService;

impl CuadrillaDetalleService {
    pub async fn listar_por_cuadrilla(
        repo: &dyn PortafolioRepository,
        cuadrilla_insumo_id: &str,
    ) -> Result<Vec<cuadrilla_detalle::Model>, ServiceError> {
        Ok(cuadrilla_detalle::Entity::find()
            .filter(cuadrilla_detalle::Column::CuadrillaInsumoId.eq(cuadrilla_insumo_id))
            .filter(cuadrilla_detalle::Column::Deleted.eq(false))
            .order_by_asc(cuadrilla_detalle::Column::Orden)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        cuadrilla_insumo_id: &str,
        datos: CuadrillaDetalleData,
        creado_por: String,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let tipo = Self::resolver_tipo(&txn, &datos.detalle_insumo_id).await?;
        Self::validar_referencia(&txn, cuadrilla_insumo_id, &datos.detalle_insumo_id).await?;
        let orden = Self::siguiente_orden(&txn, cuadrilla_insumo_id, &tipo).await?;
        let ahora = crate::ahora();

        let nuevo_detalle = cuadrilla_detalle::ActiveModel {
            id: Set(nuevo_id()),
            cuadrilla_insumo_id: Set(cuadrilla_insumo_id.to_string()),
            detalle_insumo_id: Set(datos.detalle_insumo_id),
            tipo: Set(tipo),
            orden: Set(orden),
            cantidad: Set(datos.cantidad),
            deleted: Set(false),
            created_at: Set(ahora.clone()),
            created_by: Set(creado_por.clone()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(&txn)
        .await?;

        let valuaciones = Self::valuaciones_activas(&txn, cuadrilla_insumo_id).await?;
        for v in &valuaciones {
            cuadrilla_costo_detalle::ActiveModel {
                id: Set(nuevo_id()),
                cuadrilla_costo_id: Set(v.id.clone()),
                cuadrilla_detalle_id: Set(nuevo_detalle.id.clone()),
                costo: Set(Decimal::ZERO),
                importe: Set(Decimal::ZERO),
                fecha_precio: Set(None),
                deleted: Set(false),
                created_at: Set(ahora.clone()),
                created_by: Set(creado_por.clone()),
                updated_at: Set(None),
                updated_by: Set(None),
                deleted_at: Set(None),
                deleted_by: Set(None),
            }
            .insert(&txn)
            .await?;
        }
        for v in &valuaciones {
            CuadrillaCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }

        let resultado = Self::cargar_completo(&txn, cuadrilla_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Cambia a qué insumo apunta el renglón y/o su `cantidad` (de la receta,
    /// no de una valuación). Recalcula todas las valuaciones.
    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: CuadrillaDetalleEditarData,
        actualizado_por: Option<String>,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = cuadrilla_detalle::Entity::find_by_id(&id)
            .filter(cuadrilla_detalle::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?;
        let cuadrilla_insumo_id = existente.cuadrilla_insumo_id.clone();

        let tipo = Self::resolver_tipo(&txn, &datos.detalle_insumo_id).await?;
        Self::validar_referencia(&txn, &cuadrilla_insumo_id, &datos.detalle_insumo_id).await?;

        let mut am: cuadrilla_detalle::ActiveModel = existente.into();
        am.detalle_insumo_id = Set(datos.detalle_insumo_id);
        am.tipo = Set(tipo);
        am.cantidad = Set(datos.cantidad);
        am.updated_at = Set(Some(crate::ahora()));
        am.updated_by = Set(actualizado_por);
        am.update(&txn).await?;

        let valuaciones = Self::valuaciones_activas(&txn, &cuadrilla_insumo_id).await?;
        for v in &valuaciones {
            CuadrillaCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }

        let resultado = Self::cargar_completo(&txn, &cuadrilla_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Borrado lógico del renglón de receta — en cascada se borran (lógico)
    /// sus `cuadrilla_costo_detalle` en **todas** las valuaciones ("al
    /// borrar el renglón, se borran esos detalles de valuación", ver
    /// diccionario de datos), y se recalculan.
    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = cuadrilla_detalle::Entity::find_by_id(&id)
            .filter(cuadrilla_detalle::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?;
        let cuadrilla_insumo_id = existente.cuadrilla_insumo_id.clone();
        let ahora = crate::ahora();

        let detalles_costo = cuadrilla_costo_detalle::Entity::find()
            .filter(cuadrilla_costo_detalle::Column::CuadrillaDetalleId.eq(id.clone()))
            .filter(cuadrilla_costo_detalle::Column::Deleted.eq(false))
            .all(&txn)
            .await?;
        let cuadrilla_costo_ids: Vec<String> = detalles_costo
            .iter()
            .map(|d| d.cuadrilla_costo_id.clone())
            .collect();
        for d in detalles_costo {
            let mut am: cuadrilla_costo_detalle::ActiveModel = d.into();
            am.deleted = Set(true);
            am.deleted_at = Set(Some(ahora.clone()));
            am.deleted_by = Set(Some(eliminado_por.clone()));
            am.update(&txn).await?;
        }

        let mut am: cuadrilla_detalle::ActiveModel = existente.into();
        am.deleted = Set(true);
        am.deleted_at = Set(Some(ahora));
        am.deleted_by = Set(Some(eliminado_por));
        am.update(&txn).await?;

        for cuadrilla_costo_id in cuadrilla_costo_ids {
            CuadrillaCostoService::recalcular_valuacion(&txn, &cuadrilla_costo_id).await?;
        }

        let resultado = Self::cargar_completo(&txn, &cuadrilla_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Intercambia el `orden` de una fila con el de su vecina (dentro del
    /// mismo `tipo` — mano de obra y herramienta se ordenan por separado, ya
    /// que la ficha las muestra en tablas distintas). No hace nada si ya es
    /// la primera/última de su tabla. No dispara recálculo: el orden no
    /// afecta costo/importe.
    pub async fn mover(
        repo: &dyn PortafolioRepository,
        id: String,
        direccion: DireccionMovimiento,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = cuadrilla_detalle::Entity::find_by_id(&id)
            .filter(cuadrilla_detalle::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?;
        let cuadrilla_insumo_id = existente.cuadrilla_insumo_id.clone();

        let misma_tabla = cuadrilla_detalle::Entity::find()
            .filter(cuadrilla_detalle::Column::CuadrillaInsumoId.eq(&cuadrilla_insumo_id))
            .filter(cuadrilla_detalle::Column::Tipo.eq(existente.tipo.clone()))
            .filter(cuadrilla_detalle::Column::Deleted.eq(false))
            .order_by_asc(cuadrilla_detalle::Column::Orden)
            .all(&txn)
            .await?;

        let indice = misma_tabla
            .iter()
            .position(|d| d.id == id)
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?;
        let indice_vecino = match direccion {
            DireccionMovimiento::Arriba => indice.checked_sub(1),
            DireccionMovimiento::Abajo => (indice + 1 < misma_tabla.len()).then_some(indice + 1),
        };

        if let Some(indice_vecino) = indice_vecino {
            let vecino = &misma_tabla[indice_vecino];
            let orden_existente = existente.orden;
            let orden_vecino = vecino.orden;

            let mut am_existente: cuadrilla_detalle::ActiveModel = existente.into();
            am_existente.orden = Set(orden_vecino);
            am_existente.update(&txn).await?;

            let mut am_vecino: cuadrilla_detalle::ActiveModel = vecino.clone().into();
            am_vecino.orden = Set(orden_existente);
            am_vecino.update(&txn).await?;
        }

        let resultado = Self::cargar_completo(&txn, &cuadrilla_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// `categoria_fasar` y `herramienta` son las únicas extensiones válidas
    /// dentro de una cuadrilla — en particular, esto rechaza referenciar otra
    /// `cuadrilla` (que también es `insumo.tipo = mano_obra`, pero no tiene
    /// fila en `categoria_fasar`), preservando la composición plana no
    /// recursiva del diccionario de datos.
    async fn resolver_tipo(
        txn: &DatabaseTransaction,
        detalle_insumo_id: &str,
    ) -> Result<TipoCuadrillaDetalle, ServiceError> {
        if categoria_fasar::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok(TipoCuadrillaDetalle::CategoriaFasar);
        }
        if herramienta::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok(TipoCuadrillaDetalle::EquipoHerramienta);
        }
        Err(ServiceError::Validacion(format!(
            "\"{detalle_insumo_id}\" no es una categoría FASAR ni una herramienta — una cuadrilla no puede contener otra cuadrilla"
        )))
    }

    async fn validar_referencia(
        txn: &DatabaseTransaction,
        cuadrilla_insumo_id: &str,
        detalle_insumo_id: &str,
    ) -> Result<(), ServiceError> {
        if detalle_insumo_id == cuadrilla_insumo_id {
            return Err(ServiceError::Validacion(
                "una cuadrilla no puede referenciarse a sí misma".to_string(),
            ));
        }
        let cuadrilla_ins = insumo::Entity::find_by_id(cuadrilla_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("cuadrilla {cuadrilla_insumo_id}"))
            })?;
        let detalle_ins = insumo::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("insumo {detalle_insumo_id}")))?;
        if cuadrilla_ins.organizacion_id != detalle_ins.organizacion_id {
            return Err(ServiceError::Validacion(
                "el insumo debe pertenecer a la misma organización que la cuadrilla".to_string(),
            ));
        }
        Ok(())
    }

    async fn siguiente_orden(
        txn: &DatabaseTransaction,
        cuadrilla_insumo_id: &str,
        tipo: &TipoCuadrillaDetalle,
    ) -> Result<i32, ServiceError> {
        let maximo = cuadrilla_detalle::Entity::find()
            .filter(cuadrilla_detalle::Column::CuadrillaInsumoId.eq(cuadrilla_insumo_id))
            .filter(cuadrilla_detalle::Column::Tipo.eq(tipo.clone()))
            .filter(cuadrilla_detalle::Column::Deleted.eq(false))
            .order_by_desc(cuadrilla_detalle::Column::Orden)
            .one(txn)
            .await?;
        Ok(maximo.map(|d| d.orden + 1).unwrap_or(0))
    }

    async fn valuaciones_activas(
        txn: &DatabaseTransaction,
        cuadrilla_insumo_id: &str,
    ) -> Result<Vec<cuadrilla_costo::Model>, ServiceError> {
        Ok(cuadrilla_costo::Entity::find()
            .filter(cuadrilla_costo::Column::CuadrillaId.eq(cuadrilla_insumo_id))
            .filter(cuadrilla_costo::Column::Deleted.eq(false))
            .all(txn)
            .await?)
    }

    async fn cargar_completo(
        txn: &DatabaseTransaction,
        cuadrilla_insumo_id: &str,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let cua = cuadrilla::Entity::find_by_id(cuadrilla_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("cuadrilla {cuadrilla_insumo_id}"))
            })?;
        let ins = insumo::Entity::find_by_id(cuadrilla_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("cuadrilla {cuadrilla_insumo_id}"))
            })?;
        let costo_nacional = cuadrilla_costo::Entity::find()
            .filter(cuadrilla_costo::Column::CuadrillaId.eq(cuadrilla_insumo_id))
            .filter(cuadrilla_costo::Column::RegionId.is_null())
            .filter(cuadrilla_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?;
        Ok(combinar_cuadrilla(ins, cua, costo_nacional))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::categoria_fasar::{CategoriaFasarData, CategoriaFasarService};
    use crate::cuadrilla::{CuadrillaData, CuadrillaService};
    use crate::cuadrilla_costo::CuadrillaCostoService;
    use crate::cuadrilla_costo_detalle::CuadrillaCostoDetalleService;
    use crate::factor_salario_real::{FactorSalarioRealData, FactorSalarioRealService};
    use crate::herramienta::{HerramientaData, HerramientaService};
    use crate::salario_categoria_fasar::{SalarioCategoriaFasarData, SalarioCategoriaFasarService};
    use obrix_db::PortafolioSqliteRepository;
    use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
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
            horas_jornada: Set(Decimal::from(8)),
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
            id: Set("org-2".into()),
            razon_social: Set("Otra org".into()),
            rfc: Set("XAXX020202000".into()),
            tipo: Set(organizacion::TipoOrganizacion::Despacho),
            moneda_default_id: Set("mon-1".into()),
            horas_jornada: Set(Decimal::from(8)),
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

        for (id, simbolo, descripcion) in [
            ("um-jor", "jor", "Jornal"),
            ("um-pza", "pza", "Pieza"),
            ("um-cuad", "cuad", "Cuadrilla"),
        ] {
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

    async fn crear_fsr_nacional(portafolio: &PortafolioSqliteRepository) -> String {
        FactorSalarioRealService::crear(
            portafolio,
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
        .expect("crear FSR nacional")
        .id
    }

    async fn crear_categoria_con_salario(
        portafolio: &PortafolioSqliteRepository,
        fsr_id: &str,
        clave: &str,
        descripcion: &str,
        salario_real_diario: &str,
    ) -> String {
        let categoria = CategoriaFasarService::crear(
            portafolio,
            "org-1",
            CategoriaFasarData {
                clave: clave.into(),
                descripcion: descripcion.into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria_fasar");

        SalarioCategoriaFasarService::crear(
            portafolio,
            &categoria.id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str(salario_real_diario).unwrap(),
                factor_salario_real_id: fsr_id.to_string(),
                factor_salario_real: Decimal::ONE,
                salario_real_diario: Decimal::from_str(salario_real_diario).unwrap(),
                region_id: None,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("registrar salario");

        categoria.id
    }

    async fn crear_cuadrilla(
        portafolio: &PortafolioSqliteRepository,
        clave: &str,
    ) -> CuadrillaCompleto {
        CuadrillaService::crear(
            portafolio,
            "org-1",
            CuadrillaData {
                clave: clave.into(),
                descripcion: "Cuadrilla de albañilería tipo A".into(),
                unidad_id: "um-cuad".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla")
    }

    #[tokio::test]
    async fn agregar_integrantes_y_herramienta_calcula_subtotales_nacionales() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr_nacional(&portafolio).await;

        let oficial =
            crear_categoria_con_salario(&portafolio, &fsr, "CAT-1", "Oficial albañil", "700").await;
        let ayudante =
            crear_categoria_con_salario(&portafolio, &fsr, "CAT-2", "Ayudante", "400").await;

        let herramienta = HerramientaService::crear(
            &portafolio,
            "org-1",
            HerramientaData {
                clave: "HER-1".into(),
                descripcion: "Herramienta de mano".into(),
                unidad_id: "um-pza".into(),
                familia_id: None,
                sub_familia_id: None,
                porcentaje_mano_obra: Some(3),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear herramienta");

        let cuadrilla = crear_cuadrilla(&portafolio, "CUA-1").await;

        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: oficial.clone(),
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar oficial");

        let tras_ayudante = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: ayudante.clone(),
                cantidad: Decimal::from(2),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar ayudantes");
        // 1×700 + 2×400 = 1500 — todavía sin herramienta.
        let nacional = tras_ayudante
            .costo_nacional
            .as_ref()
            .expect("valuación nacional");
        assert_eq!(nacional.sub_total_mano_obra, Decimal::from(1500));
        assert_eq!(nacional.sub_total_herramienta, Decimal::ZERO);
        assert_eq!(nacional.costo_total, Decimal::from(1500));

        let detalle_herramienta = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: herramienta.id.clone(),
                cantidad: Decimal::from(3),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar herramienta");
        // 3% de 1500 = 45.
        let nacional = detalle_herramienta
            .costo_nacional
            .as_ref()
            .expect("valuación nacional");
        assert_eq!(nacional.sub_total_mano_obra, Decimal::from(1500));
        assert_eq!(
            nacional.sub_total_herramienta,
            Decimal::from_str("45.00").unwrap()
        );
        assert_eq!(nacional.costo_total, Decimal::from_str("1545.00").unwrap());

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar detalles");
        assert_eq!(detalles.len(), 3);
        let fila_herramienta = detalles
            .iter()
            .find(|d| d.detalle_insumo_id == herramienta.id)
            .expect("fila herramienta");
        assert_eq!(
            fila_herramienta.tipo,
            TipoCuadrillaDetalle::EquipoHerramienta
        );
        // Recién agregada como único renglón de su tipo: orden propio, no
        // continúa el contador de mano de obra.
        assert_eq!(fila_herramienta.orden, 0);

        let costo_detalles =
            crate::cuadrilla_costo_detalle::CuadrillaCostoDetalleService::listar_por_costo(
                &portafolio,
                &nacional.id,
            )
            .await
            .expect("listar cuadrilla_costo_detalle");
        let costo_herramienta = costo_detalles
            .iter()
            .find(|d| d.cuadrilla_detalle_id == fila_herramienta.id)
            .unwrap();
        assert_eq!(
            costo_herramienta.costo,
            Decimal::from(1500),
            "costo de herramienta = sub_total_mano_obra"
        );
        assert_eq!(
            costo_herramienta.importe,
            Decimal::from_str("45.00").unwrap()
        );
        assert_eq!(
            costo_herramienta.fecha_precio, None,
            "herramienta no tiene fecha_precio"
        );

        // Borrar la herramienta deja el costo total igual al de mano de obra.
        let tras_borrar = CuadrillaDetalleService::eliminar(
            &portafolio,
            fila_herramienta.id.clone(),
            "usr-1".into(),
        )
        .await
        .expect("borrar herramienta");
        let nacional = tras_borrar
            .costo_nacional
            .as_ref()
            .expect("valuación nacional");
        assert_eq!(nacional.sub_total_herramienta, Decimal::ZERO);
        assert_eq!(nacional.costo_total, nacional.sub_total_mano_obra);

        let costo_detalles =
            crate::cuadrilla_costo_detalle::CuadrillaCostoDetalleService::listar_por_costo(
                &portafolio,
                &nacional.id,
            )
            .await
            .expect("listar cuadrilla_costo_detalle");
        assert!(
            costo_detalles
                .iter()
                .all(|d| d.cuadrilla_detalle_id != fila_herramienta.id),
            "el detalle de valuación de la herramienta borrada no debe seguir activo"
        );
    }

    #[tokio::test]
    async fn mover_intercambia_orden_con_el_vecino_dentro_del_mismo_tipo() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr_nacional(&portafolio).await;

        let oficial =
            crear_categoria_con_salario(&portafolio, &fsr, "CAT-1", "Oficial albañil", "700").await;
        let ayudante =
            crear_categoria_con_salario(&portafolio, &fsr, "CAT-2", "Ayudante", "400").await;
        let cuadrilla = crear_cuadrilla(&portafolio, "CUA-1").await;

        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: oficial.clone(),
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar oficial");
        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: ayudante.clone(),
                cantidad: Decimal::from(2),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar ayudante");

        let antes = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar antes");
        let fila_ayudante = antes
            .iter()
            .find(|d| d.detalle_insumo_id == ayudante)
            .unwrap()
            .clone();

        CuadrillaDetalleService::mover(
            &portafolio,
            fila_ayudante.id.clone(),
            DireccionMovimiento::Arriba,
        )
        .await
        .expect("mover ayudante hacia arriba");

        let despues = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar despues");
        let integrantes: Vec<&str> = despues
            .iter()
            .map(|d| d.detalle_insumo_id.as_str())
            .collect();
        assert_eq!(
            integrantes,
            vec![ayudante.as_str(), oficial.as_str()],
            "el ayudante debe quedar primero"
        );
    }

    #[tokio::test]
    async fn rechaza_referenciar_otra_cuadrilla() {
        let portafolio = portafolio_con_fixtures().await;

        let cuadrilla = crear_cuadrilla(&portafolio, "CUA-1").await;
        let otra_cuadrilla = crear_cuadrilla(&portafolio, "CUA-2").await;

        let err = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: otra_cuadrilla.id,
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir anidar cuadrillas");
        match err {
            ServiceError::Validacion(mensaje) => {
                assert!(
                    mensaje.contains("no puede contener otra cuadrilla"),
                    "mensaje inesperado: {mensaje}"
                );
            }
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar detalles");
        assert!(
            detalles.is_empty(),
            "no debe quedar una fila a medias tras el rechazo"
        );
    }

    #[tokio::test]
    async fn rechaza_insumo_de_otra_organizacion() {
        let portafolio = portafolio_con_fixtures().await;
        let cuadrilla = crear_cuadrilla(&portafolio, "CUA-1").await;

        let categoria_ajena = CategoriaFasarService::crear(
            &portafolio,
            "org-2",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial de otra org".into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria de otra organizacion");

        let err = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: categoria_ajena.id,
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir mezclar organizaciones");
        match err {
            ServiceError::Validacion(mensaje) => {
                assert!(
                    mensaje.contains("misma organización"),
                    "mensaje inesperado: {mensaje}"
                );
            }
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }
    }

    #[tokio::test]
    async fn agrega_integrante_sin_salario_vigente_con_costo_cero() {
        let portafolio = portafolio_con_fixtures().await;

        let sin_salario = CategoriaFasarService::crear(
            &portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Sin salario registrado".into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria sin salario");

        let cuadrilla = crear_cuadrilla(&portafolio, "CUA-1").await;

        let resultado = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: sin_salario.id,
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect("debe agregar el integrante aunque no tenga salario vigente");

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar detalles");
        assert_eq!(
            detalles.len(),
            1,
            "el renglón de receta debe quedar insertado"
        );

        let nacional = resultado
            .costo_nacional
            .as_ref()
            .expect("valuación nacional");
        assert_eq!(nacional.sub_total_mano_obra, Decimal::ZERO);
        assert_eq!(nacional.costo_total, Decimal::ZERO);

        let costos = CuadrillaCostoDetalleService::listar_por_costo(&portafolio, &nacional.id)
            .await
            .expect("detalles de valuación");
        assert_eq!(costos.len(), 1);
        assert_eq!(detalles[0].cantidad, Decimal::ONE);
        assert_eq!(costos[0].costo, Decimal::ZERO);
        assert_eq!(costos[0].importe, Decimal::ZERO);
        assert!(costos[0].fecha_precio.is_none());
    }

    #[tokio::test]
    async fn eliminar_renglon_borra_sus_cuadrilla_costo_detalle_en_todas_las_regiones() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr_nacional(&portafolio).await;
        let oficial =
            crear_categoria_con_salario(&portafolio, &fsr, "CAT-1", "Oficial albañil", "700").await;
        let cuadrilla = crear_cuadrilla(&portafolio, "CUA-1").await;

        crate::region::RegionService::crear(
            &portafolio,
            crate::region::RegionData {
                nombre: "Norte".into(),
                estado: "Nuevo León".into(),
                factor_ajuste: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear region");
        let region_id = crate::region::RegionService::listar(&portafolio)
            .await
            .unwrap()[0]
            .id
            .clone();

        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: oficial.clone(),
                cantidad: Decimal::from(2),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar oficial");

        let regional = CuadrillaCostoService::crear_regional(
            &portafolio,
            &cuadrilla.id,
            region_id,
            "usr-1".into(),
        )
        .await
        .expect("crear valuación regional");
        assert_eq!(
            regional.sub_total_mano_obra,
            Decimal::from(1400),
            "usa la cantidad de la receta y el salario nacional"
        );

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .unwrap();
        let fila_oficial = detalles
            .iter()
            .find(|d| d.detalle_insumo_id == oficial)
            .unwrap()
            .clone();

        CuadrillaDetalleService::eliminar(&portafolio, fila_oficial.id.clone(), "usr-1".into())
            .await
            .expect("eliminar renglon");

        let costo_detalles_regional =
            crate::cuadrilla_costo_detalle::CuadrillaCostoDetalleService::listar_por_costo(
                &portafolio,
                &regional.id,
            )
            .await
            .expect("listar cuadrilla_costo_detalle regional");
        assert!(
            costo_detalles_regional.is_empty(),
            "el detalle regional también debe borrarse"
        );

        let regional_recalculada =
            CuadrillaCostoService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
                .await
                .unwrap()
                .into_iter()
                .find(|c| c.id == regional.id)
                .unwrap();
        assert_eq!(regional_recalculada.costo_total, Decimal::ZERO);
    }

    #[tokio::test]
    async fn actualizar_cantidad_recalcula_todas_las_valuaciones() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr_nacional(&portafolio).await;
        let oficial =
            crear_categoria_con_salario(&portafolio, &fsr, "CAT-1", "Oficial albañil", "700").await;
        let cuadrilla = crear_cuadrilla(&portafolio, "CUA-1").await;

        crate::region::RegionService::crear(
            &portafolio,
            crate::region::RegionData {
                nombre: "Norte".into(),
                estado: "Nuevo León".into(),
                factor_ajuste: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear region");
        let region_id = crate::region::RegionService::listar(&portafolio)
            .await
            .unwrap()[0]
            .id
            .clone();

        let tras_crear = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: oficial.clone(),
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar oficial");
        assert_eq!(
            tras_crear
                .costo_nacional
                .as_ref()
                .unwrap()
                .sub_total_mano_obra,
            Decimal::from(700)
        );

        let regional = CuadrillaCostoService::crear_regional(
            &portafolio,
            &cuadrilla.id,
            region_id,
            "usr-1".into(),
        )
        .await
        .expect("crear valuación regional");
        assert_eq!(regional.sub_total_mano_obra, Decimal::from(700));

        let fila = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert_eq!(fila.cantidad, Decimal::ONE);

        let actualizada = CuadrillaDetalleService::actualizar(
            &portafolio,
            fila.id.clone(),
            CuadrillaDetalleEditarData {
                detalle_insumo_id: oficial,
                cantidad: Decimal::from(3),
            },
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar cantidad");
        // 3 × 700 = 2100 en nacional y en regional (mismo salario).
        assert_eq!(
            actualizada
                .costo_nacional
                .as_ref()
                .unwrap()
                .sub_total_mano_obra,
            Decimal::from(2100)
        );
        let regional_recalculada =
            CuadrillaCostoService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
                .await
                .unwrap()
                .into_iter()
                .find(|c| c.id == regional.id)
                .unwrap();
        assert_eq!(
            regional_recalculada.sub_total_mano_obra,
            Decimal::from(2100)
        );

        let fila = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        assert_eq!(fila.cantidad, Decimal::from(3));
    }
}
