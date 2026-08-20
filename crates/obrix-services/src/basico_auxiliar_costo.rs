//! Cache por zona de un `basico_auxiliar`. Todo auxiliar nace con su fila
//! nacional. El recálculo corre **dentro de una sola zona**, sobre el primer
//! nivel: si el componente es otro auxiliar, toma su `costo_total` de esa
//! región (o el nacional si esa zona no está valuada). `cantidad` vive en
//! cada `basico_auxiliar_costo_detalle` y no se pisa al sincronizar.

use obrix_db::PortafolioRepository;
use obrix_db::entities::basico_auxiliar_componente::{
    NaturalezaBasicoAuxiliarComponente, TipoBasicoAuxiliarComponente,
};
use obrix_db::entities::{
    basico_auxiliar_componente, basico_auxiliar_costo, basico_auxiliar_costo_detalle, insumo,
    moneda, organizacion, precio_material, region, salario_categoria_fasar,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseTransaction,
    EntityTrait, QueryFilter, QueryOrder, TransactionTrait,
};
use std::collections::HashMap;

use crate::cuadrilla_costo::CuadrillaCostoService;
use crate::equipo_costo_horario_costo::EquipoCostoHorarioCostoService;
use crate::{ServiceError, nuevo_id};

pub struct BasicoAuxiliarCostoService;

impl BasicoAuxiliarCostoService {
    pub async fn listar_por_auxiliar(
        repo: &dyn PortafolioRepository,
        basico_auxiliar_id: &str,
    ) -> Result<Vec<basico_auxiliar_costo::Model>, ServiceError> {
        Ok(basico_auxiliar_costo::Entity::find()
            .filter(basico_auxiliar_costo::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear_regional(
        repo: &dyn PortafolioRepository,
        basico_auxiliar_id: &str,
        region_id: String,
        creado_por: String,
    ) -> Result<basico_auxiliar_costo::Model, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let recetas = Self::recetas_activas(&txn, basico_auxiliar_id).await?;
        let cantidades = Self::cantidades_nacionales(&txn, basico_auxiliar_id).await?;
        let nuevo = Self::insertar_cache_regional(
            &txn,
            basico_auxiliar_id,
            &region_id,
            &recetas,
            &cantidades,
            &creado_por,
            &crate::ahora(),
        )
        .await?;
        let resultado = Self::recalcular_valuacion(&txn, &nuevo.id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    pub async fn eliminar_regional(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        let txn = repo.conexion().begin().await?;
        let existente = basico_auxiliar_costo::Entity::find_by_id(&id)
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("basico_auxiliar_costo {id}")))?;
        if existente.region_id.is_none() {
            return Err(ServiceError::Validacion(
                "no se puede eliminar la valuación nacional".into(),
            ));
        }
        let ahora = crate::ahora();
        let detalles = basico_auxiliar_costo_detalle::Entity::find()
            .filter(basico_auxiliar_costo_detalle::Column::BasicoAuxiliarCostoId.eq(&id))
            .filter(basico_auxiliar_costo_detalle::Column::Deleted.eq(false))
            .all(&txn)
            .await?;
        for d in detalles {
            let mut am: basico_auxiliar_costo_detalle::ActiveModel = d.into();
            am.deleted = Set(true);
            am.deleted_at = Set(Some(ahora.clone()));
            am.deleted_by = Set(Some(eliminado_por.clone()));
            am.update(&txn).await?;
        }
        let mut am: basico_auxiliar_costo::ActiveModel = existente.into();
        am.deleted = Set(true);
        am.deleted_at = Set(Some(ahora));
        am.deleted_by = Set(Some(eliminado_por));
        am.update(&txn).await?;
        txn.commit().await?;
        Ok(())
    }

    pub async fn recalcular_zonas(
        repo: &dyn PortafolioRepository,
        basico_auxiliar_id: &str,
        actualizado_por: &str,
    ) -> Result<Vec<basico_auxiliar_costo::Model>, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let valuaciones =
            Self::asegurar_zonas(&txn, basico_auxiliar_id, actualizado_por).await?;
        let ahora = crate::ahora();
        let mut resultado = Vec::with_capacity(valuaciones.len());
        for v in valuaciones {
            let recalculada = Self::recalcular_valuacion(&txn, &v.id).await?;
            let mut am: basico_auxiliar_costo::ActiveModel = recalculada.into();
            am.sincronizado_en = Set(Some(ahora.clone()));
            resultado.push(am.update(&txn).await?);
        }
        txn.commit().await?;
        Ok(resultado)
    }

    pub(crate) async fn asegurar_zonas(
        txn: &DatabaseTransaction,
        basico_auxiliar_id: &str,
        creado_por: &str,
    ) -> Result<Vec<basico_auxiliar_costo::Model>, ServiceError> {
        let _nacional = basico_auxiliar_costo::Entity::find()
            .filter(basico_auxiliar_costo::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_costo::Column::RegionId.is_null())
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "valuación nacional de basico_auxiliar {basico_auxiliar_id}"
                ))
            })?;

        let org_id = insumo::Entity::find_by_id(basico_auxiliar_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("insumo {basico_auxiliar_id}")))?
            .organizacion_id;
        let regiones = region::Entity::find()
            .filter(region::Column::OrganizacionId.eq(org_id))
            .filter(region::Column::Deleted.eq(false))
            .all(txn)
            .await?;
        let existentes = Self::valuaciones_activas(txn, basico_auxiliar_id).await?;
        let cubiertas: std::collections::HashSet<String> = existentes
            .iter()
            .filter_map(|c| c.region_id.clone())
            .collect();
        let recetas = Self::recetas_activas(txn, basico_auxiliar_id).await?;
        let cantidades = Self::cantidades_nacionales(txn, basico_auxiliar_id).await?;
        let ahora = crate::ahora();

        for r in regiones {
            if !r.visible || cubiertas.contains(&r.id) {
                continue;
            }
            Self::insertar_cache_regional(
                txn,
                basico_auxiliar_id,
                &r.id,
                &recetas,
                &cantidades,
                creado_por,
                &ahora,
            )
            .await?;
        }
        Self::valuaciones_activas(txn, basico_auxiliar_id).await
    }

    async fn recetas_activas(
        txn: &DatabaseTransaction,
        basico_auxiliar_id: &str,
    ) -> Result<Vec<basico_auxiliar_componente::Model>, ServiceError> {
        Ok(basico_auxiliar_componente::Entity::find()
            .filter(basico_auxiliar_componente::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_componente::Column::Deleted.eq(false))
            .all(txn)
            .await?)
    }

    async fn valuaciones_activas(
        txn: &DatabaseTransaction,
        basico_auxiliar_id: &str,
    ) -> Result<Vec<basico_auxiliar_costo::Model>, ServiceError> {
        Ok(basico_auxiliar_costo::Entity::find()
            .filter(basico_auxiliar_costo::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false))
            .all(txn)
            .await?)
    }

    async fn cantidades_nacionales(
        txn: &DatabaseTransaction,
        basico_auxiliar_id: &str,
    ) -> Result<HashMap<String, Decimal>, ServiceError> {
        let Some(nacional) = basico_auxiliar_costo::Entity::find()
            .filter(basico_auxiliar_costo::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_costo::Column::RegionId.is_null())
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?
        else {
            return Ok(HashMap::new());
        };
        let detalles = basico_auxiliar_costo_detalle::Entity::find()
            .filter(basico_auxiliar_costo_detalle::Column::BasicoAuxiliarCostoId.eq(nacional.id))
            .filter(basico_auxiliar_costo_detalle::Column::Deleted.eq(false))
            .all(txn)
            .await?;
        Ok(detalles
            .into_iter()
            .map(|d| (d.basico_auxiliar_componente_id, d.cantidad))
            .collect())
    }

    async fn insertar_cache_regional(
        txn: &DatabaseTransaction,
        basico_auxiliar_id: &str,
        region_id: &str,
        recetas: &[basico_auxiliar_componente::Model],
        cantidades: &HashMap<String, Decimal>,
        creado_por: &str,
        ahora: &str,
    ) -> Result<basico_auxiliar_costo::Model, ServiceError> {
        if region::Entity::find_by_id(region_id)
            .one(txn)
            .await?
            .is_none()
        {
            return Err(ServiceError::NoEncontrado(format!("region {region_id}")));
        }
        let existente = basico_auxiliar_costo::Entity::find()
            .filter(basico_auxiliar_costo::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_costo::Column::RegionId.eq(region_id))
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?;
        if existente.is_some() {
            return Err(ServiceError::Validacion(
                "ya existe una valuación para esa región".to_string(),
            ));
        }

        let nuevo = basico_auxiliar_costo::ActiveModel {
            id: Set(nuevo_id()),
            basico_auxiliar_id: Set(basico_auxiliar_id.to_string()),
            region_id: Set(Some(region_id.to_string())),
            sub_total_material: Set(Decimal::ZERO),
            sub_total_mano_obra: Set(Decimal::ZERO),
            sub_total_equipo: Set(Decimal::ZERO),
            sub_total_basico_auxiliar: Set(Decimal::ZERO),
            costo_total: Set(Decimal::ZERO),
            fecha_costo: Set(None),
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
            let cantidad = cantidades
                .get(&receta.id)
                .copied()
                .unwrap_or(Decimal::ZERO);
            basico_auxiliar_costo_detalle::ActiveModel {
                id: Set(nuevo_id()),
                basico_auxiliar_costo_id: Set(nuevo.id.clone()),
                basico_auxiliar_componente_id: Set(receta.id.clone()),
                cantidad: Set(cantidad),
                rendimiento: Set(crate::basico_auxiliar_costo_detalle::invertir(cantidad)),
                costo: Set(Decimal::ZERO),
                importe: Set(Decimal::ZERO),
                fecha_precio: Set(None),
                usa_costo_nacional: Set(false),
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

    pub(crate) async fn recalcular_valuacion(
        txn: &DatabaseTransaction,
        basico_auxiliar_costo_id: &str,
    ) -> Result<basico_auxiliar_costo::Model, ServiceError> {
        let costo_existente = basico_auxiliar_costo::Entity::find_by_id(basico_auxiliar_costo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("basico_auxiliar_costo {basico_auxiliar_costo_id}"))
            })?;
        let region_id = costo_existente.region_id.clone();
        let moneda = Self::moneda_default(txn, &costo_existente.basico_auxiliar_id).await?;

        let detalles = basico_auxiliar_costo_detalle::Entity::find()
            .filter(
                basico_auxiliar_costo_detalle::Column::BasicoAuxiliarCostoId
                    .eq(basico_auxiliar_costo_id),
            )
            .filter(basico_auxiliar_costo_detalle::Column::Deleted.eq(false))
            .all(txn)
            .await?;
        let recetas: HashMap<String, basico_auxiliar_componente::Model> =
            Self::recetas_activas(txn, &costo_existente.basico_auxiliar_id)
                .await?
                .into_iter()
                .map(|r| (r.id.clone(), r))
                .collect();

        let mut sub_total_material = Decimal::ZERO;
        let mut sub_total_mano_obra = Decimal::ZERO;
        let mut sub_total_equipo = Decimal::ZERO;
        let mut sub_total_basico_auxiliar = Decimal::ZERO;
        let mut pendientes: Vec<(String, Decimal, Decimal, Option<String>, bool)> = Vec::new();

        for d in &detalles {
            let Some(receta) = recetas.get(&d.basico_auxiliar_componente_id) else {
                continue;
            };
            let (costo, fecha_precio, usa_costo_nacional) = Self::costo_componente(
                txn,
                receta,
                region_id.as_deref(),
                &moneda,
            )
            .await?;
            let importe = d.cantidad * costo;
            match receta.tipo {
                TipoBasicoAuxiliarComponente::Material => sub_total_material += importe,
                TipoBasicoAuxiliarComponente::ManoObra => sub_total_mano_obra += importe,
                TipoBasicoAuxiliarComponente::EquipoHerramienta => sub_total_equipo += importe,
                TipoBasicoAuxiliarComponente::BasicoAuxiliar => {
                    sub_total_basico_auxiliar += importe
                }
            }
            pendientes.push((d.id.clone(), costo, importe, fecha_precio, usa_costo_nacional));
        }

        let fecha_costo = pendientes
            .iter()
            .filter_map(|(_, _, _, fecha, _)| fecha.clone())
            .max();

        for (id, costo, importe, fecha_precio, usa_costo_nacional) in pendientes {
            let mut am: basico_auxiliar_costo_detalle::ActiveModel =
                basico_auxiliar_costo_detalle::Entity::find_by_id(&id)
                    .one(txn)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NoEncontrado(format!("basico_auxiliar_costo_detalle {id}"))
                    })?
                    .into();
            am.costo = Set(costo);
            am.importe = Set(importe);
            am.fecha_precio = Set(fecha_precio);
            am.usa_costo_nacional = Set(usa_costo_nacional);
            am.update(txn).await?;
        }

        let costo_total =
            sub_total_material + sub_total_mano_obra + sub_total_equipo + sub_total_basico_auxiliar;
        let mut am: basico_auxiliar_costo::ActiveModel = costo_existente.into();
        am.sub_total_material = Set(sub_total_material);
        am.sub_total_mano_obra = Set(sub_total_mano_obra);
        am.sub_total_equipo = Set(sub_total_equipo);
        am.sub_total_basico_auxiliar = Set(sub_total_basico_auxiliar);
        am.costo_total = Set(costo_total);
        am.fecha_costo = Set(fecha_costo);
        Ok(am.update(txn).await?)
    }

    async fn costo_componente(
        txn: &DatabaseTransaction,
        receta: &basico_auxiliar_componente::Model,
        region_id: Option<&str>,
        moneda: &str,
    ) -> Result<(Decimal, Option<String>, bool), ServiceError> {
        match receta.naturaleza {
            NaturalezaBasicoAuxiliarComponente::Material => {
                match Self::precio_vigente(txn, &receta.componente_insumo_id, region_id, moneda)
                    .await?
                {
                    Some((precio, usa_nac)) => Ok((
                        precio.precio,
                        Some(precio.fecha_vigencia_desde),
                        usa_nac,
                    )),
                    None => Ok((Decimal::ZERO, None, false)),
                }
            }
            NaturalezaBasicoAuxiliarComponente::Categoria => {
                match Self::salario_vigente(txn, &receta.componente_insumo_id, region_id).await? {
                    Some((salario, usa_nac)) => Ok((
                        salario.salario_real_diario,
                        Some(salario.fecha_vigencia_desde),
                        usa_nac,
                    )),
                    None => Ok((Decimal::ZERO, None, false)),
                }
            }
            NaturalezaBasicoAuxiliarComponente::Cuadrilla => {
                Self::cache_con_fallback(
                    CuadrillaCostoService::resolver_costo_y_fecha(
                        txn,
                        &receta.componente_insumo_id,
                        region_id,
                    )
                    .await?,
                    if region_id.is_some() {
                        CuadrillaCostoService::resolver_costo_y_fecha(
                            txn,
                            &receta.componente_insumo_id,
                            None,
                        )
                        .await?
                    } else {
                        None
                    },
                    region_id.is_some(),
                )
            }
            NaturalezaBasicoAuxiliarComponente::CostoHorario => {
                Self::cache_con_fallback(
                    EquipoCostoHorarioCostoService::resolver_costo_y_fecha(
                        txn,
                        &receta.componente_insumo_id,
                        region_id,
                    )
                    .await?,
                    if region_id.is_some() {
                        EquipoCostoHorarioCostoService::resolver_costo_y_fecha(
                            txn,
                            &receta.componente_insumo_id,
                            None,
                        )
                        .await?
                    } else {
                        None
                    },
                    region_id.is_some(),
                )
            }
            NaturalezaBasicoAuxiliarComponente::Rentado => Ok((Decimal::ZERO, None, false)),
            NaturalezaBasicoAuxiliarComponente::BasicoAuxiliar => Self::cache_con_fallback(
                Self::resolver_costo_y_fecha(txn, &receta.componente_insumo_id, region_id).await?,
                if region_id.is_some() {
                    Self::resolver_costo_y_fecha(txn, &receta.componente_insumo_id, None).await?
                } else {
                    None
                },
                region_id.is_some(),
            ),
        }
    }

    fn cache_con_fallback(
        de_la_zona: Option<(Decimal, Option<String>)>,
        nacional: Option<(Decimal, Option<String>)>,
        hay_region: bool,
    ) -> Result<(Decimal, Option<String>, bool), ServiceError> {
        if let Some((costo, fecha)) = de_la_zona.filter(|(c, _)| !c.is_zero()) {
            return Ok((costo, fecha, false));
        }
        if hay_region {
            return Ok(match nacional {
                Some((costo, fecha)) if !costo.is_zero() => (costo, fecha, true),
                _ => (Decimal::ZERO, None, false),
            });
        }
        Ok((Decimal::ZERO, None, false))
    }

    async fn moneda_default(
        txn: &DatabaseTransaction,
        basico_auxiliar_id: &str,
    ) -> Result<String, ServiceError> {
        let ins = insumo::Entity::find_by_id(basico_auxiliar_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("insumo {basico_auxiliar_id}")))?;
        let org = organizacion::Entity::find_by_id(&ins.organizacion_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("organizacion {}", ins.organizacion_id))
            })?;
        let moneda_default = moneda::Entity::find_by_id(&org.moneda_default_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("moneda {}", org.moneda_default_id))
            })?;
        Ok(moneda_default.codigo)
    }

    async fn precio_vigente(
        txn: &DatabaseTransaction,
        material_id: &str,
        region_id: Option<&str>,
        moneda: &str,
    ) -> Result<Option<(precio_material::Model, bool)>, ServiceError> {
        if let Some(region_id) = region_id {
            if let Some(precio) =
                Self::precio_de_zona(txn, material_id, Some(region_id), moneda).await?
            {
                return Ok(Some((precio, false)));
            }
            return Ok(Self::precio_de_zona(txn, material_id, None, moneda)
                .await?
                .map(|p| (p, true)));
        }
        Ok(Self::precio_de_zona(txn, material_id, None, moneda)
            .await?
            .map(|p| (p, false)))
    }

    async fn precio_de_zona(
        txn: &DatabaseTransaction,
        material_id: &str,
        region_id: Option<&str>,
        moneda: &str,
    ) -> Result<Option<precio_material::Model>, ServiceError> {
        let mut consulta = precio_material::Entity::find()
            .filter(precio_material::Column::MaterialId.eq(material_id))
            .filter(precio_material::Column::Moneda.eq(moneda))
            .filter(precio_material::Column::FechaVigenciaHasta.is_null())
            .order_by_desc(precio_material::Column::FechaVigenciaDesde);
        consulta = match region_id {
            Some(region_id) => consulta.filter(precio_material::Column::RegionId.eq(region_id)),
            None => consulta.filter(precio_material::Column::RegionId.is_null()),
        };
        Ok(consulta.one(txn).await?)
    }

    async fn salario_vigente(
        txn: &DatabaseTransaction,
        insumo_id: &str,
        region_id: Option<&str>,
    ) -> Result<Option<(salario_categoria_fasar::Model, bool)>, ServiceError> {
        if let Some(region_id) = region_id {
            if let Some(salario) = Self::salario_de_zona(txn, insumo_id, Some(region_id)).await? {
                return Ok(Some((salario, false)));
            }
            return Ok(Self::salario_de_zona(txn, insumo_id, None)
                .await?
                .map(|s| (s, true)));
        }
        Ok(Self::salario_de_zona(txn, insumo_id, None)
            .await?
            .map(|s| (s, false)))
    }

    async fn salario_de_zona(
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

    pub async fn resolver_costo_total(
        conn: &impl ConnectionTrait,
        basico_auxiliar_id: &str,
        region_id: Option<&str>,
    ) -> Result<Option<Decimal>, ServiceError> {
        Ok(Self::resolver_costo_y_fecha(conn, basico_auxiliar_id, region_id)
            .await?
            .map(|(c, _)| c))
    }

    pub async fn resolver_costo_y_fecha(
        conn: &impl ConnectionTrait,
        basico_auxiliar_id: &str,
        region_id: Option<&str>,
    ) -> Result<Option<(Decimal, Option<String>)>, ServiceError> {
        let mut consulta = basico_auxiliar_costo::Entity::find()
            .filter(basico_auxiliar_costo::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false));
        consulta = match region_id {
            Some(region_id) => {
                consulta.filter(basico_auxiliar_costo::Column::RegionId.eq(region_id))
            }
            None => consulta.filter(basico_auxiliar_costo::Column::RegionId.is_null()),
        };
        Ok(consulta
            .one(conn)
            .await?
            .map(|c| (c.costo_total, c.fecha_costo)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::basico_auxiliar::{BasicoAuxiliarData, BasicoAuxiliarService};
    use crate::basico_auxiliar_componente::{
        BasicoAuxiliarComponenteData, BasicoAuxiliarComponenteService,
    };
    use crate::basico_auxiliar_costo_detalle::{
        BasicoAuxiliarCostoDetalleCantidadData, BasicoAuxiliarCostoDetalleService,
    };
    use crate::material::{MaterialData, MaterialService};
    use crate::precio_material::{PrecioMaterialData, PrecioMaterialService};
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
        let now = "2026-08-18T00:00:00Z".to_string();
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
            id: Set("um-m3".into()),
            simbolo: Set("m3".into()),
            simbolo_impresion: Set("m³".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Metro cúbico".into()),
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

    async fn crear_auxiliar(
        portafolio: &PortafolioSqliteRepository,
        clave: &str,
    ) -> String {
        BasicoAuxiliarService::crear(
            portafolio,
            "org-1",
            BasicoAuxiliarData {
                clave: clave.into(),
                descripcion: clave.into(),
                unidad_id: "um-m3".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear auxiliar")
        .id
    }

    async fn crear_material(portafolio: &PortafolioSqliteRepository, clave: &str) -> String {
        MaterialService::crear(
            portafolio,
            "org-1",
            MaterialData {
                clave: clave.into(),
                descripcion: clave.into(),
                unidad_id: "um-m3".into(),
                familia_id: None,
                sub_familia_id: None,
                proveedor_id: None,
                merma_porcentaje: None,
                marca: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear material")
        .id
    }

    async fn registrar_precio(
        portafolio: &PortafolioSqliteRepository,
        material_id: &str,
        region_id: Option<String>,
        precio: &str,
    ) {
        PrecioMaterialService::crear(
            portafolio,
            material_id,
            PrecioMaterialData {
                precio: Decimal::from_str(precio).unwrap(),
                moneda: "MXN".into(),
                region_id,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("registrar precio");
    }

    #[tokio::test]
    async fn receta_valua_nacional_y_cantidad_regional_no_pisa_la_nacional() {
        let portafolio = portafolio_con_fixtures().await;
        let aux = crear_auxiliar(&portafolio, "BA-1").await;
        let cemento = crear_material(&portafolio, "CEM").await;
        registrar_precio(&portafolio, &cemento, None, "100").await;
        BasicoAuxiliarComponenteService::crear(
            &portafolio,
            &aux,
            BasicoAuxiliarComponenteData {
                componente_insumo_id: cemento,
                cantidad: Decimal::from(2),
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar cemento");

        let nacional = BasicoAuxiliarService::buscar_por_id(&portafolio, &aux)
            .await
            .unwrap()
            .costo_nacional
            .unwrap();
        assert_eq!(nacional.costo_total, Decimal::from(200));
        assert_eq!(nacional.fecha_costo.as_deref(), Some("2026-01-01"));

        let region_id = RegionService::crear(
            &portafolio,
            "org-1",
            RegionData {
                nombre: "Norte".into(),
                estado: "NL".into(),
                factor_ajuste: None,
                visible: true,
            },
            "usr-1".into(),
        )
        .await
        .unwrap()
        .id;
        let regional = BasicoAuxiliarCostoService::crear_regional(
            &portafolio,
            &aux,
            region_id,
            "usr-1".into(),
        )
        .await
        .unwrap();
        assert_eq!(
            regional.costo_total,
            Decimal::from(200),
            "misma cantidad sembrada desde nacional; precio cae al nacional"
        );

        let detalles = BasicoAuxiliarCostoDetalleService::listar_por_costo(&portafolio, &regional.id)
            .await
            .unwrap();
        BasicoAuxiliarCostoDetalleService::actualizar_cantidad(
            &portafolio,
            detalles[0].id.clone(),
            BasicoAuxiliarCostoDetalleCantidadData {
                cantidad: Decimal::from(3),
            },
            Some("usr-1".into()),
        )
        .await
        .unwrap();

        let costos = BasicoAuxiliarCostoService::listar_por_auxiliar(&portafolio, &aux)
            .await
            .unwrap();
        let nacional = costos.iter().find(|c| c.region_id.is_none()).unwrap();
        let norte = costos.iter().find(|c| c.region_id.is_some()).unwrap();
        assert_eq!(nacional.costo_total, Decimal::from(200));
        assert_eq!(norte.costo_total, Decimal::from(300));
    }

    #[tokio::test]
    async fn auxiliar_hijo_sin_valuar_en_la_zona_cae_al_nacional() {
        let portafolio = portafolio_con_fixtures().await;
        let mortero = crear_auxiliar(&portafolio, "MOR").await;
        let cemento = crear_material(&portafolio, "CEM").await;
        registrar_precio(&portafolio, &cemento, None, "50").await;
        BasicoAuxiliarComponenteService::crear(
            &portafolio,
            &mortero,
            BasicoAuxiliarComponenteData {
                componente_insumo_id: cemento,
                cantidad: Decimal::ONE,
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .unwrap();

        let aplanado = crear_auxiliar(&portafolio, "APL").await;
        BasicoAuxiliarComponenteService::crear(
            &portafolio,
            &aplanado,
            BasicoAuxiliarComponenteData {
                componente_insumo_id: mortero.clone(),
                cantidad: Decimal::from(2),
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .unwrap();

        let region_id = RegionService::crear(
            &portafolio,
            "org-1",
            RegionData {
                nombre: "Norte".into(),
                estado: "NL".into(),
                factor_ajuste: None,
                visible: true,
            },
            "usr-1".into(),
        )
        .await
        .unwrap()
        .id;
        let aplanado_norte = BasicoAuxiliarCostoService::crear_regional(
            &portafolio,
            &aplanado,
            region_id.clone(),
            "usr-1".into(),
        )
        .await
        .unwrap();
        assert_eq!(
            BasicoAuxiliarCostoService::resolver_costo_total(
                portafolio.conexion(),
                &mortero,
                Some(region_id.as_str()),
            )
            .await
            .unwrap(),
            None,
            "el hijo no tiene fila de cache en Norte"
        );
        assert_eq!(aplanado_norte.costo_total, Decimal::from(100));
        assert_eq!(aplanado_norte.sub_total_basico_auxiliar, Decimal::from(100));
        let detalles =
            BasicoAuxiliarCostoDetalleService::listar_por_costo(&portafolio, &aplanado_norte.id)
                .await
                .unwrap();
        assert!(detalles[0].usa_costo_nacional);
    }

    #[tokio::test]
    async fn ciclo_de_auxiliares_se_rechaza() {
        let portafolio = portafolio_con_fixtures().await;
        let a = crear_auxiliar(&portafolio, "A").await;
        let b = crear_auxiliar(&portafolio, "B").await;
        BasicoAuxiliarComponenteService::crear(
            &portafolio,
            &a,
            BasicoAuxiliarComponenteData {
                componente_insumo_id: b.clone(),
                cantidad: Decimal::ONE,
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .unwrap();
        let err = BasicoAuxiliarComponenteService::crear(
            &portafolio,
            &b,
            BasicoAuxiliarComponenteData {
                componente_insumo_id: a,
                cantidad: Decimal::ONE,
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("sí mismo"));
    }
}
