//! Historial de precios de `material` — nunca se sobrescribe un precio, se
//! agrega una fila nueva con su propia vigencia (ver diccionario de datos).
//! Por ahora solo soporta crear y consultar — la UI para reabrir/corregir
//! una vigencia ya cerrada queda para cuando haya un caso real que lo pida.

use obrix_db::entities::precio_material::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
    TransactionTrait,
};

use crate::{nuevo_id, ServiceError};

#[derive(serde::Deserialize)]
pub struct PrecioMaterialData {
    pub precio: Decimal,
    pub moneda: String,
    pub region_id: Option<String>,
    pub fecha_vigencia_desde: String,
}

pub struct PrecioMaterialService;

impl PrecioMaterialService {
    /// Registra un precio nuevo y, si había uno abierto para la misma llave
    /// `insumo_id`+`region_id`+`moneda`, lo cierra en la misma transacción
    /// fijando su `fecha_vigencia_hasta` a la fecha del precio nuevo — nunca
    /// deben quedar dos filas abiertas para la misma combinación. Distintas
    /// monedas son vigencias independientes: un precio nuevo en USD no debe
    /// cerrar uno abierto en MXN para la misma región.
    pub async fn crear(
        repo: &dyn PortafolioRepository,
        insumo_id: &str,
        datos: PrecioMaterialData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let mut buscar_anterior = Entity::find()
            .filter(Column::InsumoId.eq(insumo_id))
            .filter(Column::Moneda.eq(datos.moneda.clone()))
            .filter(Column::FechaVigenciaHasta.is_null());
        buscar_anterior = match &datos.region_id {
            Some(region_id) => buscar_anterior.filter(Column::RegionId.eq(region_id.clone())),
            None => buscar_anterior.filter(Column::RegionId.is_null()),
        };
        if let Some(anterior) = buscar_anterior.one(&txn).await? {
            let mut anterior: ActiveModel = anterior.into();
            anterior.fecha_vigencia_hasta = Set(Some(datos.fecha_vigencia_desde.clone()));
            anterior.updated_at = Set(Some(crate::ahora()));
            anterior.updated_by = Set(Some(creado_por.clone()));
            anterior.update(&txn).await?;
        }

        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            insumo_id: Set(insumo_id.to_string()),
            region_id: Set(datos.region_id),
            precio: Set(datos.precio),
            moneda: Set(datos.moneda),
            fecha_vigencia_desde: Set(datos.fecha_vigencia_desde),
            fecha_vigencia_hasta: Set(None),
            created_at: Set(crate::ahora()),
            updated_at: Set(None),
            created_by: Set(creado_por),
            updated_by: Set(None),
        }
        .insert(&txn)
        .await?;

        txn.commit().await?;
        Ok(modelo)
    }

    /// Precio nacional vigente en `moneda` (`region_id IS NULL`,
    /// `fecha_vigencia_hasta IS NULL`) — el fallback final de la prioridad de
    /// resolución descrita en el diccionario, acotado a la moneda pedida
    /// (distintas monedas son vigencias independientes, ver diccionario).
    /// Si hay varias filas abiertas (no debería, pero nada lo impide todavía a
    /// nivel de base de datos), toma la de vigencia más reciente.
    pub async fn vigente_nacional(
        repo: &dyn PortafolioRepository,
        insumo_id: &str,
        moneda: &str,
    ) -> Result<Option<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::InsumoId.eq(insumo_id))
            .filter(Column::RegionId.is_null())
            .filter(Column::Moneda.eq(moneda))
            .filter(Column::FechaVigenciaHasta.is_null())
            .order_by_desc(Column::FechaVigenciaDesde)
            .one(repo.conexion())
            .await?)
    }

    /// Historial completo de un material, más reciente primero — el
    /// frontend decide cuál de estas filas mostrar como "vigente".
    pub async fn listar_por_material(
        repo: &dyn PortafolioRepository,
        insumo_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::InsumoId.eq(insumo_id))
            .order_by_desc(Column::FechaVigenciaDesde)
            .all(repo.conexion())
            .await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::material::{MaterialData, MaterialService};
    use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
    use obrix_db::PortafolioSqliteRepository;
    use sea_orm::ActiveModelTrait;
    use std::path::Path;
    use std::str::FromStr;

    #[tokio::test]
    async fn crear_un_precio_nuevo_cierra_el_anterior() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-10T00:00:00Z".to_string();

        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set("a@a.com".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(now.clone()),
            updated_at: Set(None),
            created_by: Set(None),
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
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
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
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        unidad_medida::ActiveModel {
            id: Set("um-1".into()),
            simbolo: Set("m2".into()),
            simbolo_impresion: Set("m2".into()),
            clave_sat: Set(None),
            descripcion: Set("Metro cuadrado".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Area),
            created_at: Set(now.clone()),
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        let material = MaterialService::crear(
            &portafolio,
            "org-1",
            MaterialData {
                clave: "MAT-1".into(),
                descripcion: "Cemento gris".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
                proveedor_id: None,
                merma_porcentaje: None,
                marca: None,
                activo: true,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear material");

        let primero = PrecioMaterialService::crear(
            &portafolio,
            &material.id,
            PrecioMaterialData {
                precio: Decimal::from_str("100").unwrap(),
                moneda: "MXN".into(),
                region_id: None,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear primer precio");
        assert!(primero.fecha_vigencia_hasta.is_none());

        let segundo = PrecioMaterialService::crear(
            &portafolio,
            &material.id,
            PrecioMaterialData {
                precio: Decimal::from_str("125.50").unwrap(),
                moneda: "MXN".into(),
                region_id: None,
                fecha_vigencia_desde: "2026-06-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear segundo precio");
        assert!(segundo.fecha_vigencia_hasta.is_none());

        let historial = PrecioMaterialService::listar_por_material(&portafolio, &material.id)
            .await
            .expect("listar historial");
        assert_eq!(historial.len(), 2);

        let primero_actualizado = historial.iter().find(|p| p.id == primero.id).expect("primer precio");
        assert_eq!(
            primero_actualizado.fecha_vigencia_hasta.as_deref(),
            Some("2026-06-01"),
            "el precio anterior debe quedar cerrado en la fecha del nuevo"
        );

        let vigente = PrecioMaterialService::vigente_nacional(&portafolio, &material.id, "MXN")
            .await
            .expect("obtener vigente")
            .expect("debe haber un precio vigente");
        assert_eq!(vigente.id, segundo.id, "el vigente debe ser el más reciente, no el cerrado");

        // Una moneda distinta es una vigencia independiente: no debe cerrar
        // el precio en MXN de la misma región.
        let en_usd = PrecioMaterialService::crear(
            &portafolio,
            &material.id,
            PrecioMaterialData {
                precio: Decimal::from_str("7.5").unwrap(),
                moneda: "USD".into(),
                region_id: None,
                fecha_vigencia_desde: "2026-07-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear precio en usd");
        assert!(en_usd.fecha_vigencia_hasta.is_none());

        let historial = PrecioMaterialService::listar_por_material(&portafolio, &material.id)
            .await
            .expect("listar historial");
        let segundo_actualizado = historial.iter().find(|p| p.id == segundo.id).expect("segundo precio");
        assert!(
            segundo_actualizado.fecha_vigencia_hasta.is_none(),
            "el precio vigente en MXN no debe cerrarse al registrar uno nuevo en USD"
        );
    }
}
