//! Historial de salario+FSR de `categoria_fasar` — nunca se sobrescribe, se
//! agrega una fila nueva con su propia vigencia (ver diccionario de datos).
//! El cálculo del FSR vive en el cliente (`formulaEngine.ts`/`modeloCalculo.ts`):
//! `factor_salario_real` y `salario_real_diario` llegan ya calculados desde
//! ahí, el backend solo los guarda — igual que `precio_material.precio`.
//! Por ahora solo soporta crear y consultar — la UI para reabrir/corregir
//! una vigencia ya cerrada queda para cuando haya un caso real que lo pida.

use obrix_db::PortafolioRepository;
use obrix_db::entities::salario_categoria_fasar::{ActiveModel, Column, Entity, Model};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseTransaction, EntityTrait, QueryFilter,
    QueryOrder, TransactionTrait,
};

use crate::{ServiceError, nuevo_id};

#[derive(Clone, serde::Deserialize)]
pub struct SalarioCategoriaFasarData {
    pub salario_base_diario: Decimal,
    pub factor_salario_real_id: String,
    pub factor_salario_real: Decimal,
    pub salario_real_diario: Decimal,
    pub region_id: Option<String>,
    pub fecha_vigencia_desde: String,
}

/// Una vigencia a registrar en lote — mismos campos que
/// `SalarioCategoriaFasarData` más el `insumo_id` de la categoría.
#[derive(serde::Deserialize)]
pub struct SalarioLoteItem {
    pub insumo_id: String,
    pub salario_base_diario: Decimal,
    pub factor_salario_real_id: String,
    pub factor_salario_real: Decimal,
    pub salario_real_diario: Decimal,
    pub region_id: Option<String>,
    pub fecha_vigencia_desde: String,
}

impl From<SalarioLoteItem> for (String, SalarioCategoriaFasarData) {
    fn from(item: SalarioLoteItem) -> Self {
        (
            item.insumo_id,
            SalarioCategoriaFasarData {
                salario_base_diario: item.salario_base_diario,
                factor_salario_real_id: item.factor_salario_real_id,
                factor_salario_real: item.factor_salario_real,
                salario_real_diario: item.salario_real_diario,
                region_id: item.region_id,
                fecha_vigencia_desde: item.fecha_vigencia_desde,
            },
        )
    }
}

pub struct SalarioCategoriaFasarService;

impl SalarioCategoriaFasarService {
    /// Registra una vigencia nueva y, si había una abierta para la misma
    /// llave `insumo_id`+`region_id`, la cierra en la misma transacción
    /// fijando su `fecha_vigencia_hasta` a la fecha de la nueva — nunca deben
    /// quedar dos filas abiertas para la misma combinación. Distintas
    /// regiones son vigencias independientes: una vigencia nueva regional no
    /// debe cerrar una abierta a nivel nacional.
    pub async fn crear(
        repo: &dyn PortafolioRepository,
        insumo_id: &str,
        datos: SalarioCategoriaFasarData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let modelo = Self::registrar_en_txn(&txn, insumo_id, datos, &creado_por).await?;
        txn.commit().await?;
        Ok(modelo)
    }

    /// Misma semántica que `crear`, para todas las categorías del lote, en
    /// una sola transacción: o se actualizan todas o no se toca ninguna.
    pub async fn crear_lote(
        repo: &dyn PortafolioRepository,
        items: Vec<SalarioLoteItem>,
        creado_por: String,
    ) -> Result<Vec<Model>, ServiceError> {
        if items.is_empty() {
            return Err(ServiceError::Validacion(
                "no hay salarios para actualizar".into(),
            ));
        }
        let txn = repo.conexion().begin().await?;
        let mut creados = Vec::with_capacity(items.len());
        for item in items {
            let (insumo_id, datos) = item.into();
            let modelo = Self::registrar_en_txn(&txn, &insumo_id, datos, &creado_por).await?;
            creados.push(modelo);
        }
        txn.commit().await?;
        Ok(creados)
    }

    async fn registrar_en_txn(
        txn: &DatabaseTransaction,
        insumo_id: &str,
        datos: SalarioCategoriaFasarData,
        creado_por: &str,
    ) -> Result<Model, ServiceError> {
        let mut buscar_anterior = Entity::find()
            .filter(Column::InsumoId.eq(insumo_id))
            .filter(Column::FechaVigenciaHasta.is_null());
        buscar_anterior = match &datos.region_id {
            Some(region_id) => buscar_anterior.filter(Column::RegionId.eq(region_id.clone())),
            None => buscar_anterior.filter(Column::RegionId.is_null()),
        };
        if let Some(anterior) = buscar_anterior.one(txn).await? {
            let mut anterior: ActiveModel = anterior.into();
            anterior.fecha_vigencia_hasta = Set(Some(datos.fecha_vigencia_desde.clone()));
            anterior.updated_at = Set(Some(crate::ahora()));
            anterior.updated_by = Set(Some(creado_por.to_string()));
            anterior.update(txn).await?;
        }

        Ok(ActiveModel {
            id: Set(nuevo_id()),
            insumo_id: Set(insumo_id.to_string()),
            region_id: Set(datos.region_id),
            salario_base_diario: Set(datos.salario_base_diario),
            factor_salario_real_id: Set(datos.factor_salario_real_id),
            factor_salario_real: Set(datos.factor_salario_real),
            salario_real_diario: Set(datos.salario_real_diario),
            fecha_vigencia_desde: Set(datos.fecha_vigencia_desde),
            fecha_vigencia_hasta: Set(None),
            created_at: Set(crate::ahora()),
            created_by: Set(creado_por.to_string()),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(txn)
        .await?)
    }

    /// Salario nacional vigente (`region_id IS NULL`, `fecha_vigencia_hasta
    /// IS NULL`) — el fallback final de la prioridad de resolución descrita
    /// en el diccionario. Si hay varias filas abiertas (no debería, pero
    /// nada lo impide todavía a nivel de base de datos), toma la de
    /// vigencia más reciente.
    pub async fn vigente_nacional(
        repo: &dyn PortafolioRepository,
        insumo_id: &str,
    ) -> Result<Option<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::InsumoId.eq(insumo_id))
            .filter(Column::RegionId.is_null())
            .filter(Column::FechaVigenciaHasta.is_null())
            .order_by_desc(Column::FechaVigenciaDesde)
            .one(repo.conexion())
            .await?)
    }

    /// Historial completo de una `categoria_fasar`, más reciente primero —
    /// el frontend decide cuál de estas filas mostrar como "vigente".
    pub async fn listar_por_categoria(
        repo: &dyn PortafolioRepository,
        insumo_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::InsumoId.eq(insumo_id))
            .all(repo.conexion())
            .await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::categoria_fasar::{CategoriaFasarData, CategoriaFasarService};
    use crate::factor_salario_real::{FactorSalarioRealData, FactorSalarioRealService};
    use crate::region::{RegionData, RegionService};
    use obrix_db::PortafolioSqliteRepository;
    use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
    use sea_orm::ActiveModelTrait;
    use std::path::Path;
    use std::str::FromStr;

    async fn portafolio_con_fixtures() -> PortafolioSqliteRepository {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-12T00:00:00Z".to_string();

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

        unidad_medida::ActiveModel {
            id: Set("um-1".into()),
            simbolo: Set("jor".into()),
            simbolo_impresion: Set("jor".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Jornal".into()),
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

        portafolio
    }

    #[tokio::test]
    async fn crear_una_vigencia_nueva_cierra_la_anterior_por_region() {
        let portafolio = portafolio_con_fixtures().await;

        let categoria = CategoriaFasarService::crear(
            &portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial albañil".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria_fasar");

        let fsr_nacional = FactorSalarioRealService::crear(
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
        .expect("crear FSR nacional");

        let norte = RegionService::crear(
            &portafolio,
            "org-1",
            RegionData {
                nombre: "Norte".into(),
                estado: "Nuevo León".into(),
                factor_ajuste: None,
                visible: true,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear region norte");

        let fsr_norte = FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            FactorSalarioRealData {
                nombre: "FSR Norte".into(),
                region_id: Some(norte.id.clone()),
                modelo_calculo_json: String::new(),
                parametros_json: String::new(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear FSR norte");

        let primero = SalarioCategoriaFasarService::crear(
            &portafolio,
            &categoria.id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str("500").unwrap(),
                factor_salario_real_id: fsr_nacional.id.clone(),
                factor_salario_real: Decimal::from_str("2.1").unwrap(),
                salario_real_diario: Decimal::from_str("1050").unwrap(),
                region_id: None,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear primera vigencia nacional");
        assert!(primero.fecha_vigencia_hasta.is_none());

        let segundo = SalarioCategoriaFasarService::crear(
            &portafolio,
            &categoria.id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str("550").unwrap(),
                factor_salario_real_id: fsr_nacional.id.clone(),
                factor_salario_real: Decimal::from_str("2.1").unwrap(),
                salario_real_diario: Decimal::from_str("1155").unwrap(),
                region_id: None,
                fecha_vigencia_desde: "2026-06-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear segunda vigencia nacional");
        assert!(segundo.fecha_vigencia_hasta.is_none());

        let historial =
            SalarioCategoriaFasarService::listar_por_categoria(&portafolio, &categoria.id)
                .await
                .expect("listar historial");
        assert_eq!(historial.len(), 2);

        let primero_actualizado = historial
            .iter()
            .find(|v| v.id == primero.id)
            .expect("primera vigencia");
        assert_eq!(
            primero_actualizado.fecha_vigencia_hasta.as_deref(),
            Some("2026-06-01"),
            "la vigencia anterior debe quedar cerrada en la fecha de la nueva"
        );

        let vigente = SalarioCategoriaFasarService::vigente_nacional(&portafolio, &categoria.id)
            .await
            .expect("obtener vigente")
            .expect("debe haber una vigencia nacional vigente");
        assert_eq!(
            vigente.id, segundo.id,
            "la vigente debe ser la más reciente, no la cerrada"
        );

        // Una región distinta es una vigencia independiente: no debe cerrar
        // la vigencia nacional abierta.
        let en_norte = SalarioCategoriaFasarService::crear(
            &portafolio,
            &categoria.id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str("650").unwrap(),
                factor_salario_real_id: fsr_norte.id.clone(),
                factor_salario_real: Decimal::from_str("2.3").unwrap(),
                salario_real_diario: Decimal::from_str("1495").unwrap(),
                region_id: Some(norte.id.clone()),
                fecha_vigencia_desde: "2026-07-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear vigencia regional");
        assert!(en_norte.fecha_vigencia_hasta.is_none());

        let historial =
            SalarioCategoriaFasarService::listar_por_categoria(&portafolio, &categoria.id)
                .await
                .expect("listar historial");
        let segundo_actualizado = historial
            .iter()
            .find(|v| v.id == segundo.id)
            .expect("segunda vigencia");
        assert!(
            segundo_actualizado.fecha_vigencia_hasta.is_none(),
            "la vigencia nacional vigente no debe cerrarse al registrar una vigencia regional"
        );
    }

    #[tokio::test]
    async fn crear_lote_actualiza_varias_categorias_en_una_transaccion() {
        let portafolio = portafolio_con_fixtures().await;

        let albanil = CategoriaFasarService::crear(
            &portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial albañil".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear albañil");

        let peon = CategoriaFasarService::crear(
            &portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "CAT-2".into(),
                descripcion: "Ayudante oficial".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear peón");

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
        .expect("crear FSR");

        let _previo = SalarioCategoriaFasarService::crear(
            &portafolio,
            &albanil.id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str("300").unwrap(),
                factor_salario_real_id: fsr.id.clone(),
                factor_salario_real: Decimal::from_str("2").unwrap(),
                salario_real_diario: Decimal::from_str("600").unwrap(),
                region_id: None,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("vigencia previa del albañil");

        let creados = SalarioCategoriaFasarService::crear_lote(
            &portafolio,
            vec![
                SalarioLoteItem {
                    insumo_id: albanil.id.clone(),
                    salario_base_diario: Decimal::from_str("349.31").unwrap(),
                    factor_salario_real_id: fsr.id.clone(),
                    factor_salario_real: Decimal::from_str("2.1").unwrap(),
                    salario_real_diario: Decimal::from_str("733.55").unwrap(),
                    region_id: None,
                    fecha_vigencia_desde: "2026-08-13".into(),
                },
                SalarioLoteItem {
                    insumo_id: peon.id.clone(),
                    salario_base_diario: Decimal::from_str("214.33").unwrap(),
                    factor_salario_real_id: fsr.id.clone(),
                    factor_salario_real: Decimal::from_str("2.1").unwrap(),
                    salario_real_diario: Decimal::from_str("450.09").unwrap(),
                    region_id: None,
                    fecha_vigencia_desde: "2026-08-13".into(),
                },
            ],
            "usr-1".into(),
        )
        .await
        .expect("crear lote");
        assert_eq!(creados.len(), 2);

        let vigente_albanil =
            SalarioCategoriaFasarService::vigente_nacional(&portafolio, &albanil.id)
                .await
                .expect("vigente albañil")
                .expect("debe haber vigente");
        assert_eq!(
            vigente_albanil.salario_base_diario,
            Decimal::from_str("349.31").unwrap()
        );
        assert!(vigente_albanil.fecha_vigencia_hasta.is_none());

        let historial_albanil =
            SalarioCategoriaFasarService::listar_por_categoria(&portafolio, &albanil.id)
                .await
                .expect("historial albañil");
        assert_eq!(historial_albanil.len(), 2);
        let cerrado = historial_albanil
            .iter()
            .find(|v| v.id != vigente_albanil.id)
            .expect("previo");
        assert_eq!(cerrado.fecha_vigencia_hasta.as_deref(), Some("2026-08-13"));

        let vigente_peon = SalarioCategoriaFasarService::vigente_nacional(&portafolio, &peon.id)
            .await
            .expect("vigente peón")
            .expect("debe haber vigente");
        assert_eq!(
            vigente_peon.salario_base_diario,
            Decimal::from_str("214.33").unwrap()
        );
    }
}
