//! Cache por zona de una `cuadrilla` (ver diccionario de datos). Toda
//! cuadrilla nace con su fila nacional (`region_id = NULL`, ver
//! `CuadrillaService::crear`). Las filas regionales no se cotizan: son
//! cache de receta × tabulador de esa zona. Al mutar la receta o al
//! sincronizar, se materializa una fila por cada `region` del catálogo.
//! El recálculo (`recalcular_valuacion`) corre **dentro de una sola zona**,
//! leyendo `cantidad` de la receta — sin fallback al total nacional.

use obrix_db::PortafolioRepository;
use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
use obrix_db::entities::{
    cuadrilla_costo, cuadrilla_costo_detalle, cuadrilla_detalle, insumo, region,
    salario_categoria_fasar,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseTransaction,
    EntityTrait, QueryFilter, QueryOrder, TransactionTrait,
};

use crate::{ServiceError, nuevo_id};

pub struct CuadrillaCostoService;

impl CuadrillaCostoService {
    /// Todas las filas de cache no borradas de una cuadrilla (nacional +
    /// una por región del catálogo, cuando ya se materializaron).
    pub async fn listar_por_cuadrilla(
        repo: &dyn PortafolioRepository,
        cuadrilla_id: &str,
    ) -> Result<Vec<cuadrilla_costo::Model>, ServiceError> {
        Ok(cuadrilla_costo::Entity::find()
            .filter(cuadrilla_costo::Column::CuadrillaId.eq(cuadrilla_id))
            .filter(cuadrilla_costo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    /// Inserta el cache de una región si aún no existe y lo recalcula.
    /// Quien muta la receta prefiere `asegurar_zonas` (todas las del catálogo).
    pub async fn crear_regional(
        repo: &dyn PortafolioRepository,
        cuadrilla_id: &str,
        region_id: String,
        creado_por: String,
    ) -> Result<cuadrilla_costo::Model, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let recetas = Self::recetas_activas(&txn, cuadrilla_id).await?;
        let nuevo = Self::insertar_cache_regional(
            &txn,
            cuadrilla_id,
            &region_id,
            &recetas,
            &creado_por,
            &crate::ahora(),
        )
        .await?;
        let resultado = Self::recalcular_valuacion(&txn, &nuevo.id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Garantiza una fila de cache por cada región del catálogo (más la
    /// nacional, que ya existía). No recalcula: el caller recorre el
    /// resultado y llama `recalcular_valuacion`. Corre contra `txn` abierta.
    pub(crate) async fn asegurar_zonas(
        txn: &DatabaseTransaction,
        cuadrilla_id: &str,
        creado_por: &str,
    ) -> Result<Vec<cuadrilla_costo::Model>, ServiceError> {
        let _nacional = cuadrilla_costo::Entity::find()
            .filter(cuadrilla_costo::Column::CuadrillaId.eq(cuadrilla_id))
            .filter(cuadrilla_costo::Column::RegionId.is_null())
            .filter(cuadrilla_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "valuación nacional de cuadrilla {cuadrilla_id}"
                ))
            })?;

        let org_id = insumo::Entity::find_by_id(cuadrilla_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("insumo {cuadrilla_id}")))?
            .organizacion_id;
        let regiones = region::Entity::find()
            .filter(region::Column::OrganizacionId.eq(org_id))
            .filter(region::Column::Deleted.eq(false))
            .all(txn)
            .await?;
        let existentes = Self::valuaciones_activas(txn, cuadrilla_id).await?;
        let cubiertas: std::collections::HashSet<String> = existentes
            .iter()
            .filter_map(|c| c.region_id.clone())
            .collect();
        let recetas = Self::recetas_activas(txn, cuadrilla_id).await?;
        let ahora = crate::ahora();

        for r in regiones {
            if !r.visible || cubiertas.contains(&r.id) {
                continue;
            }
            Self::insertar_cache_regional(
                txn,
                cuadrilla_id,
                &r.id,
                &recetas,
                creado_por,
                &ahora,
            )
            .await?;
        }
        Self::valuaciones_activas(txn, cuadrilla_id).await
    }

    async fn recetas_activas(
        txn: &DatabaseTransaction,
        cuadrilla_id: &str,
    ) -> Result<Vec<cuadrilla_detalle::Model>, ServiceError> {
        Ok(cuadrilla_detalle::Entity::find()
            .filter(cuadrilla_detalle::Column::CuadrillaInsumoId.eq(cuadrilla_id))
            .filter(cuadrilla_detalle::Column::Deleted.eq(false))
            .all(txn)
            .await?)
    }

    async fn valuaciones_activas(
        txn: &DatabaseTransaction,
        cuadrilla_id: &str,
    ) -> Result<Vec<cuadrilla_costo::Model>, ServiceError> {
        Ok(cuadrilla_costo::Entity::find()
            .filter(cuadrilla_costo::Column::CuadrillaId.eq(cuadrilla_id))
            .filter(cuadrilla_costo::Column::Deleted.eq(false))
            .all(txn)
            .await?)
    }

    async fn insertar_cache_regional(
        txn: &DatabaseTransaction,
        cuadrilla_id: &str,
        region_id: &str,
        recetas: &[cuadrilla_detalle::Model],
        creado_por: &str,
        ahora: &str,
    ) -> Result<cuadrilla_costo::Model, ServiceError> {
        if region::Entity::find_by_id(region_id)
            .one(txn)
            .await?
            .is_none()
        {
            return Err(ServiceError::NoEncontrado(format!("region {region_id}")));
        }
        let existente = cuadrilla_costo::Entity::find()
            .filter(cuadrilla_costo::Column::CuadrillaId.eq(cuadrilla_id))
            .filter(cuadrilla_costo::Column::RegionId.eq(region_id))
            .filter(cuadrilla_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?;
        if existente.is_some() {
            return Err(ServiceError::Validacion(
                "ya existe una valuación para esa región".to_string(),
            ));
        }

        let nuevo = cuadrilla_costo::ActiveModel {
            id: Set(nuevo_id()),
            cuadrilla_id: Set(cuadrilla_id.to_string()),
            region_id: Set(Some(region_id.to_string())),
            sub_total_mano_obra: Set(Decimal::ZERO),
            sub_total_herramienta: Set(Decimal::ZERO),
            costo_total: Set(Decimal::ZERO),
            sincronizado_en: Set(None),
            deleted: Set(false),
            created_at: Set(ahora.to_string()),
            created_by: Set(creado_por.to_string()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(txn)
        .await?;

        for receta in recetas {
            cuadrilla_costo_detalle::ActiveModel {
                id: Set(nuevo_id()),
                cuadrilla_costo_id: Set(nuevo.id.clone()),
                cuadrilla_detalle_id: Set(receta.id.clone()),
                costo: Set(Decimal::ZERO),
                importe: Set(Decimal::ZERO),
                fecha_precio: Set(None),
                deleted: Set(false),
                created_at: Set(ahora.to_string()),
                created_by: Set(creado_por.to_string()),
                updated_at: Set(None),
                updated_by: Set(None),
                deleted_at: Set(None),
                deleted_by: Set(None),
            }
            .insert(txn)
            .await?;
        }
        Ok(nuevo)
    }

    /// Borrado lógico de una fila de cache regional — nunca de la nacional.
    pub async fn eliminar_regional(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = cuadrilla_costo::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_costo {id}")))?;
        if existente.region_id.is_none() {
            return Err(ServiceError::Validacion(
                "no se puede eliminar la valuación nacional".to_string(),
            ));
        }

        let ahora = crate::ahora();
        let detalles = cuadrilla_costo_detalle::Entity::find()
            .filter(cuadrilla_costo_detalle::Column::CuadrillaCostoId.eq(id.clone()))
            .filter(cuadrilla_costo_detalle::Column::Deleted.eq(false))
            .all(&txn)
            .await?;
        for d in detalles {
            let mut am: cuadrilla_costo_detalle::ActiveModel = d.into();
            am.deleted = Set(true);
            am.deleted_at = Set(Some(ahora.clone()));
            am.deleted_by = Set(Some(eliminado_por.clone()));
            am.update(&txn).await?;
        }

        let mut am: cuadrilla_costo::ActiveModel = existente.into();
        am.deleted = Set(true);
        am.deleted_at = Set(Some(ahora));
        am.deleted_by = Set(Some(eliminado_por));
        am.update(&txn).await?;

        txn.commit().await?;
        Ok(())
    }

    /// Recálculo de **todas** las zonas (Nacional + catálogo de regiones)
    /// contra el tabulador vigente. Materializa el cache de regiones nuevas.
    /// Marca `sincronizado_en` en cada columna — el ⟳ de Costo por región.
    pub async fn recalcular_zonas(
        repo: &dyn PortafolioRepository,
        cuadrilla_id: &str,
        actualizado_por: &str,
    ) -> Result<Vec<cuadrilla_costo::Model>, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let valuaciones = Self::asegurar_zonas(&txn, cuadrilla_id, actualizado_por).await?;
        let ahora = crate::ahora();
        let mut resultado = Vec::with_capacity(valuaciones.len());
        for v in valuaciones {
            let recalculada = Self::recalcular_valuacion(&txn, &v.id).await?;
            let mut am: cuadrilla_costo::ActiveModel = recalculada.into();
            am.sincronizado_en = Set(Some(ahora.clone()));
            resultado.push(am.update(&txn).await?);
        }
        txn.commit().await?;
        Ok(resultado)
    }

    /// Corre siempre contra `txn` (nunca `repo.conexion()` directamente) —
    /// mismo motivo que en `CuadrillaDetalleService`/
    /// `EquipoCostoHorarioDetalleService`: pedir una conexión aparte se
    /// quedaría esperando a que la transacción abierta la libere. El
    /// algoritmo corre **dentro de una sola zona**:
    /// 1. mano de obra: costo = salario vigente **de esa misma** `region_id`
    ///    (Nacional si es NULL). Sin fallback a otra zona: si no hay
    ///    salario, costo/importe quedan en 0 y `fecha_precio` en `None`.
    /// 2. herramienta: costo = `sub_total_mano_obra` recién calculado de
    ///    esta misma zona.
    /// 3. `costo_total` = suma de ambos subtotales.
    pub(crate) async fn recalcular_valuacion(
        txn: &DatabaseTransaction,
        cuadrilla_costo_id: &str,
    ) -> Result<cuadrilla_costo::Model, ServiceError> {
        let costo_existente = cuadrilla_costo::Entity::find_by_id(cuadrilla_costo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("cuadrilla_costo {cuadrilla_costo_id}"))
            })?;
        let region_id = costo_existente.region_id.clone();

        let detalles = cuadrilla_costo_detalle::Entity::find()
            .filter(cuadrilla_costo_detalle::Column::CuadrillaCostoId.eq(cuadrilla_costo_id))
            .filter(cuadrilla_costo_detalle::Column::Deleted.eq(false))
            .all(txn)
            .await?;

        let mut recetas = std::collections::HashMap::new();
        for d in &detalles {
            if !recetas.contains_key(&d.cuadrilla_detalle_id) {
                let receta = cuadrilla_detalle::Entity::find_by_id(&d.cuadrilla_detalle_id)
                    .one(txn)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NoEncontrado(format!(
                            "cuadrilla_detalle {}",
                            d.cuadrilla_detalle_id
                        ))
                    })?;
                recetas.insert(d.cuadrilla_detalle_id.clone(), receta);
            }
        }

        let mut sub_total_mano_obra = Decimal::ZERO;
        let mut pendientes: Vec<(String, Decimal, Decimal, Option<String>)> = Vec::new();
        for d in detalles.iter().filter(|d| {
            recetas[&d.cuadrilla_detalle_id].tipo == TipoCuadrillaDetalle::CategoriaFasar
        }) {
            let receta = &recetas[&d.cuadrilla_detalle_id];
            let (costo, fecha_precio) =
                match Self::salario_vigente(txn, &receta.detalle_insumo_id, region_id.as_deref())
                    .await?
                {
                    Some(salario) => (
                        salario.salario_real_diario,
                        Some(salario.fecha_vigencia_desde),
                    ),
                    None => (Decimal::ZERO, None),
                };
            let importe = receta.cantidad * costo;
            sub_total_mano_obra += importe;
            pendientes.push((d.id.clone(), costo, importe, fecha_precio));
        }

        let mut sub_total_herramienta = Decimal::ZERO;
        for d in detalles.iter().filter(|d| {
            recetas[&d.cuadrilla_detalle_id].tipo == TipoCuadrillaDetalle::EquipoHerramienta
        }) {
            let receta = &recetas[&d.cuadrilla_detalle_id];
            let costo = sub_total_mano_obra;
            let importe = costo * receta.cantidad / Decimal::ONE_HUNDRED;
            sub_total_herramienta += importe;
            pendientes.push((d.id.clone(), costo, importe, None));
        }

        for (id, costo, importe, fecha_precio) in pendientes {
            let mut am: cuadrilla_costo_detalle::ActiveModel =
                cuadrilla_costo_detalle::Entity::find_by_id(&id)
                    .one(txn)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NoEncontrado(format!("cuadrilla_costo_detalle {id}"))
                    })?
                    .into();
            am.costo = Set(costo);
            am.importe = Set(importe);
            am.fecha_precio = Set(fecha_precio);
            am.update(txn).await?;
        }

        let costo_total = sub_total_mano_obra + sub_total_herramienta;
        let mut am: cuadrilla_costo::ActiveModel = costo_existente.into();
        am.sub_total_mano_obra = Set(sub_total_mano_obra);
        am.sub_total_herramienta = Set(sub_total_herramienta);
        am.costo_total = Set(costo_total);
        Ok(am.update(txn).await?)
    }

    /// Salario vigente **de esa zona** (Nacional si `region_id` es `None`).
    /// Sin fallback a otra zona: si el tabulador no tiene el oficio ahí,
    /// el renglón de la cuadrilla queda en cero. Corre dentro de una
    /// transacción abierta (no reutiliza `vigente_nacional`).
    async fn salario_vigente(
        txn: &DatabaseTransaction,
        insumo_id: &str,
        region_id: Option<&str>,
    ) -> Result<Option<salario_categoria_fasar::Model>, ServiceError> {
        let mut consulta = salario_categoria_fasar::Entity::find()
            .filter(salario_categoria_fasar::Column::InsumoId.eq(insumo_id))
            .filter(salario_categoria_fasar::Column::FechaVigenciaHasta.is_null())
            .order_by_desc(salario_categoria_fasar::Column::FechaVigenciaDesde);
        consulta = match region_id {
            Some(region_id) => {
                consulta.filter(salario_categoria_fasar::Column::RegionId.eq(region_id))
            }
            None => consulta.filter(salario_categoria_fasar::Column::RegionId.is_null()),
        };
        Ok(consulta.one(txn).await?)
    }

    /// Cache de la zona pedida, sin sustituir el total nacional si la fila
    /// regional aún no existe. Genérica sobre `ConnectionTrait` para poder
    /// llamarse tanto con `repo.conexion()` como desde dentro de una
    /// transacción abierta.
    pub async fn resolver_costo_total(
        conn: &impl ConnectionTrait,
        cuadrilla_id: &str,
        region_id: Option<&str>,
    ) -> Result<Option<Decimal>, ServiceError> {
        let mut consulta = cuadrilla_costo::Entity::find()
            .filter(cuadrilla_costo::Column::CuadrillaId.eq(cuadrilla_id))
            .filter(cuadrilla_costo::Column::Deleted.eq(false));
        consulta = match region_id {
            Some(region_id) => consulta.filter(cuadrilla_costo::Column::RegionId.eq(region_id)),
            None => consulta.filter(cuadrilla_costo::Column::RegionId.is_null()),
        };
        Ok(consulta.one(conn).await?.map(|c| c.costo_total))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::categoria_fasar::{CategoriaFasarData, CategoriaFasarService};
    use crate::cuadrilla::{CuadrillaData, CuadrillaService};
    use crate::cuadrilla_detalle::{CuadrillaDetalleData, CuadrillaDetalleService};
    use crate::factor_salario_real::{FactorSalarioRealData, FactorSalarioRealService};
    use crate::region::{RegionData, RegionService};
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

        for (id, simbolo, descripcion) in [
            ("um-jor", "jor", "Jornal"),
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

    async fn crear_region(portafolio: &PortafolioSqliteRepository, nombre: &str) -> String {
        RegionService::crear(
            portafolio,
            "org-1",
            RegionData {
                nombre: nombre.into(),
                estado: "Nuevo León".into(),
                factor_ajuste: None,
                visible: true,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear region")
        .id
    }

    async fn crear_fsr(
        portafolio: &PortafolioSqliteRepository,
        nombre: &str,
        region_id: Option<String>,
    ) -> String {
        FactorSalarioRealService::crear(
            portafolio,
            "org-1".into(),
            FactorSalarioRealData {
                nombre: nombre.into(),
                region_id,
                modelo_calculo_json: String::new(),
                parametros_json: String::new(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear FSR")
        .id
    }

    async fn crear_categoria(
        portafolio: &PortafolioSqliteRepository,
        clave: &str,
        descripcion: &str,
    ) -> String {
        CategoriaFasarService::crear(
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
        .expect("crear categoria_fasar")
        .id
    }

    async fn registrar_salario(
        portafolio: &PortafolioSqliteRepository,
        insumo_id: &str,
        fsr_id: &str,
        region_id: Option<String>,
        salario_real_diario: &str,
    ) {
        SalarioCategoriaFasarService::crear(
            portafolio,
            insumo_id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str(salario_real_diario).unwrap(),
                factor_salario_real_id: fsr_id.to_string(),
                factor_salario_real: Decimal::ONE,
                salario_real_diario: Decimal::from_str(salario_real_diario).unwrap(),
                region_id,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("registrar salario");
    }

    async fn crear_cuadrilla_con_integrante(
        portafolio: &PortafolioSqliteRepository,
        insumo_id: &str,
        cantidad: Decimal,
    ) -> String {
        let cuadrilla = CuadrillaService::crear(
            portafolio,
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
        CuadrillaDetalleService::crear(
            portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: insumo_id.to_string(),
                cantidad,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar integrante");
        cuadrilla.id
    }

    #[tokio::test]
    async fn crear_regional_sin_salario_de_esa_zona_queda_en_cero() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr(&portafolio, "FSR nacional", None).await;
        let oficial = crear_categoria(&portafolio, "CAT-1", "Oficial albañil").await;
        registrar_salario(&portafolio, &oficial, &fsr, None, "700").await;
        let cuadrilla_id =
            crear_cuadrilla_con_integrante(&portafolio, &oficial, Decimal::from(2)).await;
        let region_id = crear_region(&portafolio, "Norte").await;

        let regional = CuadrillaCostoService::crear_regional(
            &portafolio,
            &cuadrilla_id,
            region_id.clone(),
            "usr-1".into(),
        )
        .await
        .expect("crear valuación regional");
        assert_eq!(regional.region_id.as_deref(), Some(region_id.as_str()));
        assert_eq!(
            regional.sub_total_mano_obra,
            Decimal::ZERO,
            "sin tabulador de esa zona el renglón queda en cero, no hereda Nacional"
        );
        assert_eq!(regional.costo_total, Decimal::ZERO);

        let detalles =
            crate::cuadrilla_costo_detalle::CuadrillaCostoDetalleService::listar_por_costo(
                &portafolio,
                &regional.id,
            )
            .await
            .expect("listar cuadrilla_costo_detalle");
        let receta = crate::cuadrilla_detalle::CuadrillaDetalleService::listar_por_cuadrilla(
            &portafolio,
            &cuadrilla_id,
        )
        .await
        .expect("listar receta");
        assert_eq!(
            receta[0].cantidad,
            Decimal::from(2),
            "la cantidad es de la receta, no de la valuación"
        );
        assert_eq!(detalles.len(), 1);
        assert!(
            detalles[0].fecha_precio.is_none(),
            "sin salario de esa zona no hay fecha_precio"
        );
        assert_eq!(
            regional.sincronizado_en, None,
            "crear regional no es una sincronización ⟳"
        );
    }

    #[tokio::test]
    async fn recalculo_de_zonas_marca_sincronizado_en() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr(&portafolio, "FSR nacional", None).await;
        let oficial = crear_categoria(&portafolio, "CAT-1", "Oficial albañil").await;
        registrar_salario(&portafolio, &oficial, &fsr, None, "700").await;
        let cuadrilla_id =
            crear_cuadrilla_con_integrante(&portafolio, &oficial, Decimal::ONE).await;

        let nacional = CuadrillaCostoService::listar_por_cuadrilla(&portafolio, &cuadrilla_id)
            .await
            .unwrap()
            .into_iter()
            .next()
            .expect("valuación nacional");
        assert_eq!(
            nacional.sincronizado_en, None,
            "agregar integrante recalcula la valuación pero no marca sincronizado_en"
        );
        let detalles =
            crate::cuadrilla_costo_detalle::CuadrillaCostoDetalleService::listar_por_costo(
                &portafolio,
                &nacional.id,
            )
            .await
            .expect("listar cuadrilla_costo_detalle");
        assert_eq!(detalles[0].fecha_precio.as_deref(), Some("2026-01-01"));

        let tras = CuadrillaCostoService::recalcular_zonas(&portafolio, &cuadrilla_id, "usr-1")
            .await
            .expect("recalcular zonas");
        assert!(
            tras.iter().all(|c| c.sincronizado_en.is_some()),
            "el ⟳ de Costo por zona debe marcar sincronizado_en en todas las columnas"
        );
        let detalles =
            crate::cuadrilla_costo_detalle::CuadrillaCostoDetalleService::listar_por_costo(
                &portafolio,
                &nacional.id,
            )
            .await
            .expect("listar tras recálculo");
        assert_eq!(detalles[0].fecha_precio.as_deref(), Some("2026-01-01"));
    }

    #[tokio::test]
    async fn crear_regional_usa_salario_regional_cuando_existe() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr_nacional = crear_fsr(&portafolio, "FSR nacional", None).await;
        let oficial = crear_categoria(&portafolio, "CAT-1", "Oficial albañil").await;
        registrar_salario(&portafolio, &oficial, &fsr_nacional, None, "700").await;
        let cuadrilla_id =
            crear_cuadrilla_con_integrante(&portafolio, &oficial, Decimal::from(2)).await;

        let region_id = crear_region(&portafolio, "Norte").await;
        let fsr_norte = crear_fsr(&portafolio, "FSR Norte", Some(region_id.clone())).await;
        registrar_salario(
            &portafolio,
            &oficial,
            &fsr_norte,
            Some(region_id.clone()),
            "900",
        )
        .await;

        let regional = CuadrillaCostoService::crear_regional(
            &portafolio,
            &cuadrilla_id,
            region_id,
            "usr-1".into(),
        )
        .await
        .expect("crear valuación regional");
        // Con salario regional propio: 900 × 2 = 1800, no el nacional.
        assert_eq!(regional.sub_total_mano_obra, Decimal::from(1800));
    }

    #[tokio::test]
    async fn eliminar_regional_no_permite_borrar_nacional() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr(&portafolio, "FSR nacional", None).await;
        let oficial = crear_categoria(&portafolio, "CAT-1", "Oficial albañil").await;
        registrar_salario(&portafolio, &oficial, &fsr, None, "700").await;
        let cuadrilla_id =
            crear_cuadrilla_con_integrante(&portafolio, &oficial, Decimal::ONE).await;

        let nacional = CuadrillaCostoService::listar_por_cuadrilla(&portafolio, &cuadrilla_id)
            .await
            .unwrap();
        let nacional_id = nacional[0].id.clone();

        let err =
            CuadrillaCostoService::eliminar_regional(&portafolio, nacional_id, "usr-1".into())
                .await
                .expect_err("no debe permitir borrar la nacional");
        match err {
            ServiceError::Validacion(mensaje) => {
                assert!(
                    mensaje.contains("valuación nacional"),
                    "mensaje inesperado: {mensaje}"
                );
            }
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }
    }

    #[tokio::test]
    async fn resolver_costo_total_de_la_zona_sin_caer_a_nacional() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr(&portafolio, "FSR nacional", None).await;
        let oficial = crear_categoria(&portafolio, "CAT-1", "Oficial albañil").await;
        registrar_salario(&portafolio, &oficial, &fsr, None, "700").await;
        let cuadrilla_id =
            crear_cuadrilla_con_integrante(&portafolio, &oficial, Decimal::ONE).await;
        let region_id = crear_region(&portafolio, "Norte").await;
        CuadrillaCostoService::crear_regional(
            &portafolio,
            &cuadrilla_id,
            region_id.clone(),
            "usr-1".into(),
        )
        .await
        .expect("crear valuación regional");

        let costo_region = CuadrillaCostoService::resolver_costo_total(
            portafolio.conexion(),
            &cuadrilla_id,
            Some(region_id.as_str()),
        )
        .await
        .expect("resolver costo con region")
        .expect("debe existir el cache de Norte");
        assert_eq!(
            costo_region,
            Decimal::ZERO,
            "Norte no tiene tabulador propio"
        );

        let costo_nacional = CuadrillaCostoService::resolver_costo_total(
            portafolio.conexion(),
            &cuadrilla_id,
            None,
        )
        .await
        .expect("resolver nacional")
        .expect("debe existir");
        assert_eq!(costo_nacional, Decimal::from(700));

        let otra_region_id = crear_region(&portafolio, "Sur").await;
        let costo_sur = CuadrillaCostoService::resolver_costo_total(
            portafolio.conexion(),
            &cuadrilla_id,
            Some(otra_region_id.as_str()),
        )
        .await
        .expect("resolver costo de Sur");
        assert_eq!(
            costo_sur, None,
            "sin fila de cache en Sur no se toma el total nacional"
        );
    }

    #[tokio::test]
    async fn agregar_integrante_materializa_cache_de_regiones_del_catalogo() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr(&portafolio, "FSR nacional", None).await;
        let oficial = crear_categoria(&portafolio, "CAT-1", "Oficial albañil").await;
        registrar_salario(&portafolio, &oficial, &fsr, None, "700").await;
        let region_id = crear_region(&portafolio, "Norte").await;
        let fsr_norte = crear_fsr(&portafolio, "FSR Norte", Some(region_id.clone())).await;
        registrar_salario(
            &portafolio,
            &oficial,
            &fsr_norte,
            Some(region_id.clone()),
            "900",
        )
        .await;

        let cuadrilla_id =
            crear_cuadrilla_con_integrante(&portafolio, &oficial, Decimal::from(2)).await;
        let costos = CuadrillaCostoService::listar_por_cuadrilla(&portafolio, &cuadrilla_id)
            .await
            .expect("listar costos");
        assert_eq!(costos.len(), 2, "Nacional + Norte del catálogo");
        let nacional = costos.iter().find(|c| c.region_id.is_none()).unwrap();
        let norte = costos
            .iter()
            .find(|c| c.region_id.as_deref() == Some(region_id.as_str()))
            .unwrap();
        assert_eq!(nacional.sub_total_mano_obra, Decimal::from(1400));
        assert_eq!(norte.sub_total_mano_obra, Decimal::from(1800));
    }
}
