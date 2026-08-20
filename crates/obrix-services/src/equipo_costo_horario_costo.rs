//! Cache por zona de un `equipo_costo_horario` (ver diccionario de datos).
//! Todo equipo nace con su fila nacional (`region_id = NULL`, ver
//! `EquipoCostoHorarioService::crear`). Las filas regionales no se cotizan:
//! son cache de receta × precios/salarios de esa zona. Al mutar la receta
//! o al sincronizar, se materializa una fila por cada `region` del catálogo.
//! El recálculo (`recalcular_valuacion`) corre **dentro de una sola zona**,
//! leyendo `cantidad` de la receta — sin fallback al total nacional.

use obrix_db::PortafolioRepository;
use obrix_db::entities::equipo_costo_horario_detalle::{
    NaturalezaEquipoCostoHorarioDetalle, TipoEquipoCostoHorarioDetalle,
};
use obrix_db::entities::{
    equipo_costo_horario, equipo_costo_horario_costo, equipo_costo_horario_costo_detalle,
    equipo_costo_horario_detalle, insumo, moneda, organizacion, precio_material, region,
    salario_categoria_fasar,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseTransaction,
    EntityTrait, QueryFilter, QueryOrder, TransactionTrait,
};

use crate::cuadrilla_costo::CuadrillaCostoService;
use crate::{ServiceError, nuevo_id};

pub struct EquipoCostoHorarioCostoService;

impl EquipoCostoHorarioCostoService {
    /// Todas las filas de cache no borradas de un equipo (nacional +
    /// una por región del catálogo, cuando ya se materializaron).
    pub async fn listar_por_equipo(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_id: &str,
    ) -> Result<Vec<equipo_costo_horario_costo::Model>, ServiceError> {
        Ok(equipo_costo_horario_costo::Entity::find()
            .filter(
                equipo_costo_horario_costo::Column::EquipoCostoHorarioId
                    .eq(equipo_costo_horario_id),
            )
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    /// Inserta el cache de una región si aún no existe y lo recalcula.
    /// Quien muta la receta prefiere `asegurar_zonas` (todas las del catálogo).
    pub async fn crear_regional(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_id: &str,
        region_id: String,
        creado_por: String,
    ) -> Result<equipo_costo_horario_costo::Model, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let recetas = Self::recetas_activas(&txn, equipo_costo_horario_id).await?;
        let nuevo = Self::insertar_cache_regional(
            &txn,
            equipo_costo_horario_id,
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
        equipo_costo_horario_id: &str,
        creado_por: &str,
    ) -> Result<Vec<equipo_costo_horario_costo::Model>, ServiceError> {
        let _nacional = equipo_costo_horario_costo::Entity::find()
            .filter(
                equipo_costo_horario_costo::Column::EquipoCostoHorarioId
                    .eq(equipo_costo_horario_id),
            )
            .filter(equipo_costo_horario_costo::Column::RegionId.is_null())
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "valuación nacional de equipo_costo_horario {equipo_costo_horario_id}"
                ))
            })?;

        let org_id = insumo::Entity::find_by_id(equipo_costo_horario_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("insumo {equipo_costo_horario_id}")))?
            .organizacion_id;
        let regiones = region::Entity::find()
            .filter(region::Column::OrganizacionId.eq(org_id))
            .filter(region::Column::Deleted.eq(false))
            .all(txn)
            .await?;
        let existentes = Self::valuaciones_activas(txn, equipo_costo_horario_id).await?;
        let cubiertas: std::collections::HashSet<String> = existentes
            .iter()
            .filter_map(|c| c.region_id.clone())
            .collect();
        let recetas = Self::recetas_activas(txn, equipo_costo_horario_id).await?;
        let ahora = crate::ahora();

        for r in regiones {
            if !r.visible || cubiertas.contains(&r.id) {
                continue;
            }
            Self::insertar_cache_regional(
                txn,
                equipo_costo_horario_id,
                &r.id,
                &recetas,
                creado_por,
                &ahora,
            )
            .await?;
        }
        Self::valuaciones_activas(txn, equipo_costo_horario_id).await
    }

    async fn recetas_activas(
        txn: &DatabaseTransaction,
        equipo_costo_horario_id: &str,
    ) -> Result<Vec<equipo_costo_horario_detalle::Model>, ServiceError> {
        Ok(equipo_costo_horario_detalle::Entity::find()
            .filter(
                equipo_costo_horario_detalle::Column::EquipoCostoHorarioInsumoId
                    .eq(equipo_costo_horario_id),
            )
            .filter(equipo_costo_horario_detalle::Column::Deleted.eq(false))
            .all(txn)
            .await?)
    }

    async fn valuaciones_activas(
        txn: &DatabaseTransaction,
        equipo_costo_horario_id: &str,
    ) -> Result<Vec<equipo_costo_horario_costo::Model>, ServiceError> {
        Ok(equipo_costo_horario_costo::Entity::find()
            .filter(
                equipo_costo_horario_costo::Column::EquipoCostoHorarioId
                    .eq(equipo_costo_horario_id),
            )
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false))
            .all(txn)
            .await?)
    }

    async fn insertar_cache_regional(
        txn: &DatabaseTransaction,
        equipo_costo_horario_id: &str,
        region_id: &str,
        recetas: &[equipo_costo_horario_detalle::Model],
        creado_por: &str,
        ahora: &str,
    ) -> Result<equipo_costo_horario_costo::Model, ServiceError> {
        if region::Entity::find_by_id(region_id)
            .one(txn)
            .await?
            .is_none()
        {
            return Err(ServiceError::NoEncontrado(format!("region {region_id}")));
        }
        let existente = equipo_costo_horario_costo::Entity::find()
            .filter(
                equipo_costo_horario_costo::Column::EquipoCostoHorarioId
                    .eq(equipo_costo_horario_id),
            )
            .filter(equipo_costo_horario_costo::Column::RegionId.eq(region_id))
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?;
        if existente.is_some() {
            return Err(ServiceError::Validacion(
                "ya existe una valuación para esa región".to_string(),
            ));
        }

        let nuevo = equipo_costo_horario_costo::ActiveModel {
            id: Set(nuevo_id()),
            equipo_costo_horario_id: Set(equipo_costo_horario_id.to_string()),
            region_id: Set(Some(region_id.to_string())),
            subtotal_consumo: Set(Decimal::ZERO),
            subtotal_operacion: Set(Decimal::ZERO),
            cargo_variable_hora: Set(Decimal::ZERO),
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
            equipo_costo_horario_costo_detalle::ActiveModel {
                id: Set(nuevo_id()),
                equipo_costo_horario_costo_id: Set(nuevo.id.clone()),
                equipo_costo_horario_detalle_id: Set(receta.id.clone()),
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

    /// Borrado lógico de una fila de cache regional — nunca de la nacional.
    pub async fn eliminar_regional(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = equipo_costo_horario_costo::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("equipo_costo_horario_costo {id}"))
            })?;
        if existente.region_id.is_none() {
            return Err(ServiceError::Validacion(
                "no se puede eliminar la valuación nacional".to_string(),
            ));
        }

        let ahora = crate::ahora();
        let detalles = equipo_costo_horario_costo_detalle::Entity::find()
            .filter(
                equipo_costo_horario_costo_detalle::Column::EquipoCostoHorarioCostoId
                    .eq(id.clone()),
            )
            .filter(equipo_costo_horario_costo_detalle::Column::Deleted.eq(false))
            .all(&txn)
            .await?;
        for d in detalles {
            let mut am: equipo_costo_horario_costo_detalle::ActiveModel = d.into();
            am.deleted = Set(true);
            am.deleted_at = Set(Some(ahora.clone()));
            am.deleted_by = Set(Some(eliminado_por.clone()));
            am.update(&txn).await?;
        }

        let mut am: equipo_costo_horario_costo::ActiveModel = existente.into();
        am.deleted = Set(true);
        am.deleted_at = Set(Some(ahora));
        am.deleted_by = Set(Some(eliminado_por));
        am.update(&txn).await?;

        txn.commit().await?;
        Ok(())
    }

    /// Recálculo de **todas** las zonas (Nacional + catálogo de regiones)
    /// contra precios y tabuladores vigentes. Materializa el cache de
    /// regiones nuevas. Marca `sincronizado_en` en cada columna — el ⟳ de
    /// Costo por región.
    pub async fn recalcular_zonas(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_id: &str,
        actualizado_por: &str,
    ) -> Result<Vec<equipo_costo_horario_costo::Model>, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let valuaciones =
            Self::asegurar_zonas(&txn, equipo_costo_horario_id, actualizado_por).await?;
        let ahora = crate::ahora();
        let mut resultado = Vec::with_capacity(valuaciones.len());
        for v in valuaciones {
            let recalculada = Self::recalcular_valuacion(&txn, &v.id).await?;
            let mut am: equipo_costo_horario_costo::ActiveModel = recalculada.into();
            am.sincronizado_en = Set(Some(ahora.clone()));
            resultado.push(am.update(&txn).await?);
        }
        txn.commit().await?;
        Ok(resultado)
    }

    /// Corre siempre contra `txn` (nunca `repo.conexion()` directamente) —
    /// mismo motivo que en `CuadrillaCostoService`: pedir una conexión aparte
    /// se quedaría esperando a que la transacción abierta la libere. El
    /// algoritmo corre **dentro de una sola zona**:
    /// 1. consumo: costo = precio vigente de esa región, o nacional si
    ///    falta; 0 si tampoco hay.
    /// 2. operación: salario vigente de esa región, o nacional si falta;
    ///    si el operador es cuadrilla, `cuadrilla_costo.costo_total` de esa
    ///    región, o el nacional si esa zona no está valuada (fila ausente o
    ///    en cero). 0 si tampoco hay.
    /// 3. `costo_total` = `cf_cargo_fijo_hora` del header + variable.
    pub(crate) async fn recalcular_valuacion(
        txn: &DatabaseTransaction,
        equipo_costo_horario_costo_id: &str,
    ) -> Result<equipo_costo_horario_costo::Model, ServiceError> {
        let costo_existente =
            equipo_costo_horario_costo::Entity::find_by_id(equipo_costo_horario_costo_id)
                .one(txn)
                .await?
                .ok_or_else(|| {
                    ServiceError::NoEncontrado(format!(
                        "equipo_costo_horario_costo {equipo_costo_horario_costo_id}"
                    ))
                })?;
        let region_id = costo_existente.region_id.clone();
        let header =
            equipo_costo_horario::Entity::find_by_id(&costo_existente.equipo_costo_horario_id)
                .one(txn)
                .await?
                .ok_or_else(|| {
                    ServiceError::NoEncontrado(format!(
                        "equipo_costo_horario {}",
                        costo_existente.equipo_costo_horario_id
                    ))
                })?;
        let moneda_codigo =
            Self::moneda_default(txn, &costo_existente.equipo_costo_horario_id).await?;

        let detalles = equipo_costo_horario_costo_detalle::Entity::find()
            .filter(
                equipo_costo_horario_costo_detalle::Column::EquipoCostoHorarioCostoId
                    .eq(equipo_costo_horario_costo_id),
            )
            .filter(equipo_costo_horario_costo_detalle::Column::Deleted.eq(false))
            .all(txn)
            .await?;

        let mut recetas = std::collections::HashMap::new();
        for d in &detalles {
            if !recetas.contains_key(&d.equipo_costo_horario_detalle_id) {
                let receta = equipo_costo_horario_detalle::Entity::find_by_id(
                    &d.equipo_costo_horario_detalle_id,
                )
                .one(txn)
                .await?
                .ok_or_else(|| {
                    ServiceError::NoEncontrado(format!(
                        "equipo_costo_horario_detalle {}",
                        d.equipo_costo_horario_detalle_id
                    ))
                })?;
                recetas.insert(d.equipo_costo_horario_detalle_id.clone(), receta);
            }
        }

        let mut subtotal_consumo = Decimal::ZERO;
        let mut subtotal_operacion = Decimal::ZERO;
        let mut pendientes: Vec<(String, Decimal, Decimal, Option<String>, bool)> = Vec::new();

        for d in &detalles {
            let receta = &recetas[&d.equipo_costo_horario_detalle_id];
            let (costo, fecha_precio, usa_costo_nacional) = match receta.tipo {
                TipoEquipoCostoHorarioDetalle::Consumo => {
                    match Self::precio_vigente(
                        txn,
                        &receta.detalle_insumo_id,
                        region_id.as_deref(),
                        &moneda_codigo,
                    )
                    .await?
                    {
                        Some((precio, usa_nac)) => {
                            (precio.precio, Some(precio.fecha_vigencia_desde), usa_nac)
                        }
                        None => (Decimal::ZERO, None, false),
                    }
                }
                TipoEquipoCostoHorarioDetalle::Operacion => {
                    Self::costo_operacion(
                        txn,
                        &receta.detalle_insumo_id,
                        receta.naturaleza.as_ref(),
                        region_id.as_deref(),
                    )
                    .await?
                }
            };
            let importe = receta.cantidad * costo;
            match receta.tipo {
                TipoEquipoCostoHorarioDetalle::Consumo => subtotal_consumo += importe,
                TipoEquipoCostoHorarioDetalle::Operacion => subtotal_operacion += importe,
            }
            pendientes.push((d.id.clone(), costo, importe, fecha_precio, usa_costo_nacional));
        }

        for (id, costo, importe, fecha_precio, usa_costo_nacional) in pendientes {
            let mut am: equipo_costo_horario_costo_detalle::ActiveModel =
                equipo_costo_horario_costo_detalle::Entity::find_by_id(&id)
                    .one(txn)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NoEncontrado(format!(
                            "equipo_costo_horario_costo_detalle {id}"
                        ))
                    })?
                    .into();
            am.costo = Set(costo);
            am.importe = Set(importe);
            am.fecha_precio = Set(fecha_precio);
            am.usa_costo_nacional = Set(usa_costo_nacional);
            am.update(txn).await?;
        }

        let cargo_variable_hora = subtotal_consumo + subtotal_operacion;
        let costo_total = header.cf_cargo_fijo_hora + cargo_variable_hora;
        let mut am: equipo_costo_horario_costo::ActiveModel = costo_existente.into();
        am.subtotal_consumo = Set(subtotal_consumo);
        am.subtotal_operacion = Set(subtotal_operacion);
        am.cargo_variable_hora = Set(cargo_variable_hora);
        am.costo_total = Set(costo_total);
        Ok(am.update(txn).await?)
    }

    async fn moneda_default(
        txn: &DatabaseTransaction,
        equipo_costo_horario_id: &str,
    ) -> Result<String, ServiceError> {
        let ins = insumo::Entity::find_by_id(equipo_costo_horario_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("insumo {equipo_costo_horario_id}"))
            })?;
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

    /// Precio vigente de esa zona; si es regional y no hay, cae al nacional.
    /// Sin precio nacional tampoco, el renglón queda en cero. El segundo
    /// valor del par es `true` solo en valuación regional con fallback.
    async fn precio_vigente(
        txn: &DatabaseTransaction,
        material_id: &str,
        region_id: Option<&str>,
        moneda: &str,
    ) -> Result<Option<(precio_material::Model, bool)>, ServiceError> {
        if let Some(region_id) = region_id {
            let regional = Self::precio_de_zona(txn, material_id, Some(region_id), moneda).await?;
            if let Some(precio) = regional {
                return Ok(Some((precio, false)));
            }
            let nacional = Self::precio_de_zona(txn, material_id, None, moneda).await?;
            return Ok(nacional.map(|p| (p, true)));
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

    /// `naturaleza` dice si el operador es una categoría FASAR o una
    /// cuadrilla, sin ir a las extensiones (ver
    /// `equipo_costo_horario_detalle`).
    ///
    /// Un `cuadrilla_costo` regional en cero se trata como zona sin valuar,
    /// igual que si la fila no existiera: `CuadrillaCostoService` no hereda
    /// salarios nacionales, así que un cero ahí significa "esa zona no tiene
    /// tabulador", no que la cuadrilla cueste cero.
    async fn costo_operacion(
        txn: &DatabaseTransaction,
        detalle_insumo_id: &str,
        naturaleza: Option<&NaturalezaEquipoCostoHorarioDetalle>,
        region_id: Option<&str>,
    ) -> Result<(Decimal, Option<String>, bool), ServiceError> {
        if naturaleza != Some(&NaturalezaEquipoCostoHorarioDetalle::Cuadrilla) {
            return match Self::salario_vigente(txn, detalle_insumo_id, region_id).await? {
                Some((salario, usa_nac)) => Ok((
                    salario.salario_real_diario,
                    Some(salario.fecha_vigencia_desde),
                    usa_nac,
                )),
                None => Ok((Decimal::ZERO, None, false)),
            };
        }
        let de_la_zona =
            CuadrillaCostoService::resolver_costo_y_fecha(txn, detalle_insumo_id, region_id)
                .await?
                .filter(|(costo, _)| !costo.is_zero());
        if let Some((costo, fecha)) = de_la_zona {
            return Ok((costo, fecha, false));
        }
        if region_id.is_some() {
            let nacional =
                CuadrillaCostoService::resolver_costo_y_fecha(txn, detalle_insumo_id, None).await?;
            return Ok(match nacional {
                Some((costo, fecha)) if !costo.is_zero() => (costo, fecha, true),
                _ => (Decimal::ZERO, None, false),
            });
        }
        Ok((Decimal::ZERO, None, false))
    }

    /// Salario vigente de esa zona; si es regional y no hay, cae al nacional.
    /// Sin salario nacional tampoco, el renglón queda en cero. El segundo
    /// valor del par es `true` solo en valuación regional con fallback.
    async fn salario_vigente(
        txn: &DatabaseTransaction,
        insumo_id: &str,
        region_id: Option<&str>,
    ) -> Result<Option<(salario_categoria_fasar::Model, bool)>, ServiceError> {
        if let Some(region_id) = region_id {
            let regional = Self::salario_de_zona(txn, insumo_id, Some(region_id)).await?;
            if let Some(salario) = regional {
                return Ok(Some((salario, false)));
            }
            let nacional = Self::salario_de_zona(txn, insumo_id, None).await?;
            return Ok(nacional.map(|s| (s, true)));
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

    /// Cache de la zona pedida, sin sustituir el total nacional si la fila
    /// regional aún no existe.
    pub async fn resolver_costo_total(
        conn: &impl ConnectionTrait,
        equipo_costo_horario_id: &str,
        region_id: Option<&str>,
    ) -> Result<Option<Decimal>, ServiceError> {
        let mut consulta = equipo_costo_horario_costo::Entity::find()
            .filter(
                equipo_costo_horario_costo::Column::EquipoCostoHorarioId
                    .eq(equipo_costo_horario_id),
            )
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false));
        consulta = match region_id {
            Some(region_id) => {
                consulta.filter(equipo_costo_horario_costo::Column::RegionId.eq(region_id))
            }
            None => consulta.filter(equipo_costo_horario_costo::Column::RegionId.is_null()),
        };
        Ok(consulta.one(conn).await?.map(|c| c.costo_total))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::categoria_fasar::{CategoriaFasarData, CategoriaFasarService};
    use crate::equipo_costo_horario::{EquipoCostoHorarioData, EquipoCostoHorarioService};
    use crate::equipo_costo_horario_detalle::{
        EquipoCostoHorarioDetalleData, EquipoCostoHorarioDetalleService,
    };
    use crate::factor_salario_real::{FactorSalarioRealData, FactorSalarioRealService};
    use crate::material::{MaterialData, MaterialService};
    use crate::precio_material::{PrecioMaterialData, PrecioMaterialService};
    use crate::region::{RegionData, RegionService};
    use crate::salario_categoria_fasar::{SalarioCategoriaFasarData, SalarioCategoriaFasarService};
    use obrix_db::PortafolioSqliteRepository;
    use obrix_db::entities::equipo_costo_horario_detalle::NaturalezaEquipoCostoHorarioDetalle;
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

        for (id, simbolo, desc, tipo) in [
            ("um-hr", "hr", "Hora", unidad_medida::TipoMagnitud::Tiempo),
            ("um-lt", "lt", "Litro", unidad_medida::TipoMagnitud::Otro),
            ("um-jor", "jor", "Jornal", unidad_medida::TipoMagnitud::Otro),
        ] {
            unidad_medida::ActiveModel {
                id: Set(id.into()),
                simbolo: Set(simbolo.into()),
                simbolo_impresion: Set(simbolo.into()),
                variantes: Set("".into()),
                clave_sat: Set(None),
                descripcion: Set(desc.into()),
                tipo_magnitud: Set(tipo),
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

    fn datos_equipo() -> EquipoCostoHorarioData {
        EquipoCostoHorarioData {
            clave: "ECH-1".into(),
            descripcion: "Excavadora".into(),
            unidad_id: "um-hr".into(),
            familia_id: None,
            sub_familia_id: None,
            cf_costo_maquina: Decimal::from_str("1000000").unwrap(),
            cf_valor_llantas: Decimal::ZERO,
            cf_valor_piezas_especiales: Decimal::ZERO,
            cf_valor_rescate_porcentaje: Decimal::from_str("10").unwrap(),
            cf_vida_economica_anios: Decimal::from_str("5").unwrap(),
            cf_horas_uso_anual: Decimal::from_str("2000").unwrap(),
            cf_tasa_interes_anual_porcentaje: Decimal::from_str("12").unwrap(),
            cf_tasa_seguros_anual_porcentaje: Decimal::from_str("4").unwrap(),
            cf_mantenimiento_porcentaje: Decimal::from_str("60").unwrap(),
        }
    }

    async fn crear_equipo(portafolio: &PortafolioSqliteRepository) -> String {
        EquipoCostoHorarioService::crear(portafolio, "org-1", datos_equipo(), "usr-1".into())
            .await
            .expect("crear equipo")
            .id
    }

    async fn crear_region(portafolio: &PortafolioSqliteRepository, nombre: &str) -> String {
        RegionService::crear(
            portafolio,
            "org-1",
            RegionData {
                nombre: nombre.into(),
                estado: "NL".into(),
                factor_ajuste: None,
                visible: true,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear region")
        .id
    }

    async fn crear_material(portafolio: &PortafolioSqliteRepository, clave: &str) -> String {
        MaterialService::crear(
            portafolio,
            "org-1",
            MaterialData {
                clave: clave.into(),
                descripcion: "Diesel".into(),
                unidad_id: "um-lt".into(),
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

    async fn crear_operador(
        portafolio: &PortafolioSqliteRepository,
        region_id: Option<String>,
        salario: &str,
        clave: &str,
    ) -> String {
        let fsr = FactorSalarioRealService::crear(
            portafolio,
            "org-1".into(),
            FactorSalarioRealData {
                nombre: format!("FSR {clave}"),
                region_id: region_id.clone(),
                modelo_calculo_json: String::new(),
                parametros_json: String::new(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear FSR")
        .id;
        let categoria = CategoriaFasarService::crear(
            portafolio,
            "org-1",
            CategoriaFasarData {
                clave: clave.into(),
                descripcion: "Operador".into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria");
        SalarioCategoriaFasarService::crear(
            portafolio,
            &categoria.id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str(salario).unwrap(),
                factor_salario_real_id: fsr,
                factor_salario_real: Decimal::ONE,
                salario_real_diario: Decimal::from_str(salario).unwrap(),
                region_id,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("registrar salario");
        categoria.id
    }

    async fn registrar_salario(
        portafolio: &PortafolioSqliteRepository,
        insumo_id: &str,
        region_id: Option<String>,
        salario: &str,
    ) {
        let etiqueta = region_id.as_deref().unwrap_or("nacional");
        let fsr = FactorSalarioRealService::crear(
            portafolio,
            "org-1".into(),
            FactorSalarioRealData {
                nombre: format!("FSR {insumo_id} {etiqueta}"),
                region_id: region_id.clone(),
                modelo_calculo_json: String::new(),
                parametros_json: String::new(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear FSR")
        .id;
        SalarioCategoriaFasarService::crear(
            portafolio,
            insumo_id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str(salario).unwrap(),
                factor_salario_real_id: fsr,
                factor_salario_real: Decimal::ONE,
                salario_real_diario: Decimal::from_str(salario).unwrap(),
                region_id,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("registrar salario");
    }

    #[tokio::test]
    async fn receta_mutada_materializa_regiones_y_consumo_cae_al_nacional() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo_id = crear_equipo(&portafolio).await;
        let region_id = crear_region(&portafolio, "Norte").await;
        let diesel = crear_material(&portafolio, "MAT-1").await;
        registrar_precio(&portafolio, &diesel, None, "20").await;

        EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo_id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: diesel,
                cantidad: Decimal::from(2),
                naturaleza: Some(NaturalezaEquipoCostoHorarioDetalle::Combustible),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar consumo");

        let costos = EquipoCostoHorarioCostoService::listar_por_equipo(&portafolio, &equipo_id)
            .await
            .unwrap();
        assert!(
            costos
                .iter()
                .any(|c| c.region_id.as_deref() == Some(region_id.as_str())),
            "mutar la receta debe materializar el cache de Norte"
        );
        let norte = costos
            .iter()
            .find(|c| c.region_id.as_deref() == Some(region_id.as_str()))
            .unwrap();
        // 2 × 20 (fallback nacional) = 40
        assert_eq!(norte.subtotal_consumo, Decimal::from(40));
        let detalles_norte = crate::equipo_costo_horario_costo_detalle::EquipoCostoHorarioCostoDetalleService::listar_por_costo(
            &portafolio,
            &norte.id,
        )
        .await
        .unwrap();
        assert!(detalles_norte[0].usa_costo_nacional);
        let nacional = costos.iter().find(|c| c.region_id.is_none()).unwrap();
        let detalles_nacional = crate::equipo_costo_horario_costo_detalle::EquipoCostoHorarioCostoDetalleService::listar_por_costo(
            &portafolio,
            &nacional.id,
        )
        .await
        .unwrap();
        assert!(!detalles_nacional[0].usa_costo_nacional);
    }

    #[tokio::test]
    async fn consumo_usa_precio_regional_cuando_existe() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo_id = crear_equipo(&portafolio).await;
        let region_id = crear_region(&portafolio, "Norte").await;
        let diesel = crear_material(&portafolio, "MAT-1").await;
        registrar_precio(&portafolio, &diesel, None, "20").await;
        registrar_precio(&portafolio, &diesel, Some(region_id.clone()), "30").await;

        EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo_id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: diesel,
                cantidad: Decimal::from(2),
                naturaleza: Some(NaturalezaEquipoCostoHorarioDetalle::Combustible),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar consumo");

        let costos = EquipoCostoHorarioCostoService::listar_por_equipo(&portafolio, &equipo_id)
            .await
            .unwrap();
        let nacional = costos.iter().find(|c| c.region_id.is_none()).unwrap();
        let norte = costos
            .iter()
            .find(|c| c.region_id.as_deref() == Some(region_id.as_str()))
            .unwrap();
        assert_eq!(nacional.subtotal_consumo, Decimal::from(40));
        assert_eq!(norte.subtotal_consumo, Decimal::from(60));
        let detalles_norte = crate::equipo_costo_horario_costo_detalle::EquipoCostoHorarioCostoDetalleService::listar_por_costo(
            &portafolio,
            &norte.id,
        )
        .await
        .unwrap();
        assert!(!detalles_norte[0].usa_costo_nacional);
    }

    #[tokio::test]
    async fn operacion_cae_al_salario_nacional_si_falta_regional() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo_id = crear_equipo(&portafolio).await;
        let region_id = crear_region(&portafolio, "Norte").await;
        let operador = crear_operador(&portafolio, None, "500", "OP-1").await;

        EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo_id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: operador,
                cantidad: Decimal::ONE,
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar operacion");

        let costos = EquipoCostoHorarioCostoService::listar_por_equipo(&portafolio, &equipo_id)
            .await
            .unwrap();
        let nacional = costos.iter().find(|c| c.region_id.is_none()).unwrap();
        let norte = costos
            .iter()
            .find(|c| c.region_id.as_deref() == Some(region_id.as_str()))
            .unwrap();
        assert_eq!(nacional.subtotal_operacion, Decimal::from(500));
        assert_eq!(norte.subtotal_operacion, Decimal::from(500));
        let detalles_norte = crate::equipo_costo_horario_costo_detalle::EquipoCostoHorarioCostoDetalleService::listar_por_costo(
            &portafolio,
            &norte.id,
        )
        .await
        .unwrap();
        assert!(detalles_norte[0].usa_costo_nacional);
    }

    #[tokio::test]
    async fn operacion_con_cuadrilla_sin_tabulador_de_la_zona_hereda_la_nacional() {
        use crate::cuadrilla::{CuadrillaData, CuadrillaService};
        use crate::cuadrilla_costo::CuadrillaCostoService;
        use crate::cuadrilla_detalle::{CuadrillaDetalleData, CuadrillaDetalleService};

        let portafolio = portafolio_con_fixtures().await;
        let equipo_id = crear_equipo(&portafolio).await;
        let region_id = crear_region(&portafolio, "Norte").await;
        let integrante = crear_operador(&portafolio, None, "500", "OP-3").await;
        let cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Operador de camión + ayudante".into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla")
        .id;
        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla,
            CuadrillaDetalleData {
                detalle_insumo_id: integrante,
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar integrante");

        // La cuadrilla sí materializa su cache de Norte, pero sin tabulador
        // de esa zona queda en cero — el equipo no debe tomar ese cero.
        let cuadrilla_en_norte = CuadrillaCostoService::resolver_costo_total(
            portafolio.conexion(),
            &cuadrilla,
            Some(region_id.as_str()),
        )
        .await
        .unwrap();
        assert_eq!(cuadrilla_en_norte, Some(Decimal::ZERO));

        EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo_id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: cuadrilla,
                cantidad: Decimal::ONE,
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar operacion");

        let costos = EquipoCostoHorarioCostoService::listar_por_equipo(&portafolio, &equipo_id)
            .await
            .unwrap();
        let nacional = costos.iter().find(|c| c.region_id.is_none()).unwrap();
        let norte = costos
            .iter()
            .find(|c| c.region_id.as_deref() == Some(region_id.as_str()))
            .unwrap();
        assert_eq!(nacional.subtotal_operacion, Decimal::from(500));
        assert_eq!(norte.subtotal_operacion, Decimal::from(500));

        // El renglón hereda la fecha del salario que respalda a la cuadrilla,
        // tanto en su propia zona como cuando cae a la nacional — sin eso la
        // ficha marcaría la región como "sin precio en algún renglón".
        for costo in [nacional, norte] {
            let detalles = crate::equipo_costo_horario_costo_detalle::
                EquipoCostoHorarioCostoDetalleService::listar_por_costo(&portafolio, &costo.id)
                    .await
                    .expect("listar detalles de la valuación");
            assert_eq!(detalles.len(), 1);
            assert_eq!(detalles[0].fecha_precio.as_deref(), Some("2026-01-01"));
            assert_eq!(
                detalles[0].usa_costo_nacional,
                costo.region_id.is_some(),
                "solo la valuación regional debe marcar fallback nacional"
            );
        }
    }

    #[tokio::test]
    async fn operacion_usa_salario_regional_cuando_existe() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo_id = crear_equipo(&portafolio).await;
        let region_id = crear_region(&portafolio, "Norte").await;
        let operador = crear_operador(&portafolio, None, "500", "OP-2").await;
        registrar_salario(&portafolio, &operador, Some(region_id.clone()), "800").await;

        EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo_id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: operador,
                cantidad: Decimal::ONE,
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar operacion");

        let costos = EquipoCostoHorarioCostoService::listar_por_equipo(&portafolio, &equipo_id)
            .await
            .unwrap();
        let nacional = costos.iter().find(|c| c.region_id.is_none()).unwrap();
        let norte = costos
            .iter()
            .find(|c| c.region_id.as_deref() == Some(region_id.as_str()))
            .unwrap();
        assert_eq!(nacional.subtotal_operacion, Decimal::from(500));
        assert_eq!(norte.subtotal_operacion, Decimal::from(800));
    }

    #[tokio::test]
    async fn resolver_costo_total_de_la_zona_sin_caer_a_nacional() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo_id = crear_equipo(&portafolio).await;
        let region_id = crear_region(&portafolio, "Norte").await;
        EquipoCostoHorarioCostoService::crear_regional(
            &portafolio,
            &equipo_id,
            region_id.clone(),
            "usr-1".into(),
        )
        .await
        .expect("crear valuación regional");

        let cf = EquipoCostoHorarioService::buscar_por_id(&portafolio, &equipo_id)
            .await
            .unwrap()
            .cf_cargo_fijo_hora;

        let costo_region = EquipoCostoHorarioCostoService::resolver_costo_total(
            portafolio.conexion(),
            &equipo_id,
            Some(region_id.as_str()),
        )
        .await
        .unwrap()
        .expect("cache de Norte");
        assert_eq!(costo_region, cf);

        let otra = crear_region(&portafolio, "Sur").await;
        let costo_sur = EquipoCostoHorarioCostoService::resolver_costo_total(
            portafolio.conexion(),
            &equipo_id,
            Some(otra.as_str()),
        )
        .await
        .unwrap();
        assert_eq!(costo_sur, None);
    }

    #[tokio::test]
    async fn cambio_de_cf_actualiza_costo_total_de_todas_las_zonas() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo_id = crear_equipo(&portafolio).await;
        let region_id = crear_region(&portafolio, "Norte").await;
        let diesel = crear_material(&portafolio, "MAT-1").await;
        registrar_precio(&portafolio, &diesel, None, "10").await;
        EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo_id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: diesel,
                cantidad: Decimal::ONE,
                naturaleza: Some(NaturalezaEquipoCostoHorarioDetalle::Combustible),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar consumo");

        let mut datos = datos_equipo();
        datos.cf_costo_maquina = Decimal::from_str("2000000").unwrap();
        let actualizado = EquipoCostoHorarioService::actualizar(
            &portafolio,
            equipo_id.clone(),
            datos,
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar CF");

        let costos = EquipoCostoHorarioCostoService::listar_por_equipo(&portafolio, &equipo_id)
            .await
            .unwrap();
        for c in &costos {
            assert_eq!(c.subtotal_consumo, Decimal::from(10));
            assert_eq!(
                c.costo_total,
                actualizado.cf_cargo_fijo_hora + Decimal::from(10)
            );
        }
        assert!(
            costos
                .iter()
                .any(|c| c.region_id.as_deref() == Some(region_id.as_str()))
        );
    }
}
