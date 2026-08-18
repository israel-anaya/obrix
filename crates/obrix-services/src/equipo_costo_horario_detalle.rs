//! Administra la composición (`equipo_costo_horario_detalle`) de un
//! `equipo_costo_horario` — consumo (`material`) y operación
//! (`categoria_fasar`/`cuadrilla`), en una matriz plana no recursiva (ver
//! diccionario de datos). Cada alta/edición/baja dispara `recalcular`, que
//! vuelve a resolver el costo de todas las filas desde cero (el precio del
//! material o el salario del operador pueden haber cambiado desde la última
//! vez) y luego los dos totales cache de `equipo_costo_horario`
//! (`cargo_variable_hora`/`costo_horario_total`) — `cf_cargo_fijo_hora` no se
//! toca aquí, lo administra `EquipoCostoHorarioService`.

use obrix_db::PortafolioRepository;
use obrix_db::entities::equipo_costo_horario_detalle::{
    NaturalezaEquipoCostoHorarioDetalle, TipoEquipoCostoHorarioDetalle,
};
use obrix_db::entities::{
    categoria_fasar, cuadrilla, equipo_costo_horario, equipo_costo_horario_detalle, insumo,
    material, moneda, organizacion, precio_material, salario_categoria_fasar,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseTransaction, EntityTrait, QueryFilter,
    QueryOrder, TransactionTrait,
};

use crate::cuadrilla_costo::CuadrillaCostoService;
use crate::equipo_costo_horario::{EquipoCostoHorarioCompleto, combinar as combinar_equipo};
use crate::{ServiceError, nuevo_id};

#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DireccionMovimiento {
    Arriba,
    Abajo,
}

#[derive(serde::Deserialize)]
pub struct EquipoCostoHorarioDetalleData {
    pub detalle_insumo_id: String,
    /// Cantidad consumida (o jornales/horas de operador) por hora de máquina.
    pub cantidad: Decimal,
    /// Obligatorio si el insumo es un material (`tipo = consumo`); `None` si es operación.
    #[serde(default)]
    pub naturaleza: Option<NaturalezaEquipoCostoHorarioDetalle>,
}

pub struct EquipoCostoHorarioDetalleService;

impl EquipoCostoHorarioDetalleService {
    pub async fn listar_por_equipo(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_insumo_id: &str,
    ) -> Result<Vec<equipo_costo_horario_detalle::Model>, ServiceError> {
        Ok(equipo_costo_horario_detalle::Entity::find()
            .filter(
                equipo_costo_horario_detalle::Column::EquipoCostoHorarioInsumoId
                    .eq(equipo_costo_horario_insumo_id),
            )
            .order_by_asc(equipo_costo_horario_detalle::Column::Orden)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_insumo_id: &str,
        datos: EquipoCostoHorarioDetalleData,
        creado_por: String,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let tipo = Self::resolver_tipo(&txn, &datos.detalle_insumo_id).await?;
        let naturaleza = Self::resolver_naturaleza(tipo.clone(), datos.naturaleza, None)?;
        Self::validar_referencia(
            &txn,
            equipo_costo_horario_insumo_id,
            &datos.detalle_insumo_id,
        )
        .await?;
        let orden = Self::siguiente_orden(&txn, equipo_costo_horario_insumo_id).await?;

        equipo_costo_horario_detalle::ActiveModel {
            id: Set(nuevo_id()),
            equipo_costo_horario_insumo_id: Set(equipo_costo_horario_insumo_id.to_string()),
            detalle_insumo_id: Set(datos.detalle_insumo_id),
            tipo: Set(tipo),
            naturaleza: Set(naturaleza),
            orden: Set(orden),
            cantidad: Set(datos.cantidad),
            costo: Set(Decimal::ZERO),
            importe: Set(Decimal::ZERO),
            created_at: Set(crate::ahora()),
            created_by: Set(creado_por),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(&txn)
        .await?;

        let resultado = Self::recalcular(&txn, equipo_costo_horario_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Solo permite cambiar a qué insumo apunta la fila y su cantidad — el
    /// orden no es editable desde la UI (se asigna al insertar), y
    /// costo/importe siempre los deriva `recalcular`.
    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: EquipoCostoHorarioDetalleData,
        actualizado_por: Option<String>,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = equipo_costo_horario_detalle::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("equipo_costo_horario_detalle {id}"))
            })?;
        let equipo_costo_horario_insumo_id = existente.equipo_costo_horario_insumo_id.clone();

        let tipo = Self::resolver_tipo(&txn, &datos.detalle_insumo_id).await?;
        let naturaleza = Self::resolver_naturaleza(
            tipo.clone(),
            datos.naturaleza,
            existente.naturaleza.clone(),
        )?;
        Self::validar_referencia(
            &txn,
            &equipo_costo_horario_insumo_id,
            &datos.detalle_insumo_id,
        )
        .await?;

        let mut am: equipo_costo_horario_detalle::ActiveModel = existente.into();
        am.detalle_insumo_id = Set(datos.detalle_insumo_id);
        am.tipo = Set(tipo);
        am.naturaleza = Set(naturaleza);
        am.cantidad = Set(datos.cantidad);
        am.updated_at = Set(Some(crate::ahora()));
        am.updated_by = Set(actualizado_por);
        am.update(&txn).await?;

        let resultado = Self::recalcular(&txn, &equipo_costo_horario_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = equipo_costo_horario_detalle::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("equipo_costo_horario_detalle {id}"))
            })?;
        let equipo_costo_horario_insumo_id = existente.equipo_costo_horario_insumo_id.clone();

        equipo_costo_horario_detalle::Entity::delete_by_id(id)
            .exec(&txn)
            .await?;

        let resultado = Self::recalcular(&txn, &equipo_costo_horario_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Fuerza un recálculo manual, sin que haya cambiado la composición —
    /// trae de nueva cuenta el precio vigente de cada material de consumo y
    /// el salario/costo del operador de cada renglón de operación, y
    /// recompone `subtotal_consumo`/`subtotal_operacion`/`cargo_variable_hora`/
    /// `costo_horario_total`. `cf_cargo_fijo_hora` no cambia — es función
    /// solo de los 9 valores de captura, no de precios externos.
    pub async fn recalcular_costos(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_insumo_id: String,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let resultado = Self::recalcular(&txn, &equipo_costo_horario_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Intercambia el `orden` de una fila con el de su vecina (dentro del
    /// mismo `tipo` — consumo y operación se ordenan por separado, ya que la
    /// ficha las muestra en tablas distintas). No hace nada si ya es la
    /// primera/última de su tabla. No dispara `recalcular`: el orden no
    /// afecta costo/importe.
    pub async fn mover(
        repo: &dyn PortafolioRepository,
        id: String,
        direccion: DireccionMovimiento,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = equipo_costo_horario_detalle::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("equipo_costo_horario_detalle {id}"))
            })?;
        let equipo_costo_horario_insumo_id = existente.equipo_costo_horario_insumo_id.clone();

        let misma_tabla = equipo_costo_horario_detalle::Entity::find()
            .filter(
                equipo_costo_horario_detalle::Column::EquipoCostoHorarioInsumoId
                    .eq(&equipo_costo_horario_insumo_id),
            )
            .filter(equipo_costo_horario_detalle::Column::Tipo.eq(existente.tipo.clone()))
            .order_by_asc(equipo_costo_horario_detalle::Column::Orden)
            .all(&txn)
            .await?;

        let indice = misma_tabla.iter().position(|d| d.id == id).ok_or_else(|| {
            ServiceError::NoEncontrado(format!("equipo_costo_horario_detalle {id}"))
        })?;
        let indice_vecino = match direccion {
            DireccionMovimiento::Arriba => indice.checked_sub(1),
            DireccionMovimiento::Abajo => (indice + 1 < misma_tabla.len()).then_some(indice + 1),
        };

        if let Some(indice_vecino) = indice_vecino {
            let vecino = &misma_tabla[indice_vecino];
            let orden_existente = existente.orden;
            let orden_vecino = vecino.orden;

            let mut am_existente: equipo_costo_horario_detalle::ActiveModel = existente.into();
            am_existente.orden = Set(orden_vecino);
            am_existente.update(&txn).await?;

            let mut am_vecino: equipo_costo_horario_detalle::ActiveModel = vecino.clone().into();
            am_vecino.orden = Set(orden_existente);
            am_vecino.update(&txn).await?;
        }

        let equipo = equipo_costo_horario::Entity::find_by_id(&equipo_costo_horario_insumo_id)
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "equipo_costo_horario {equipo_costo_horario_insumo_id}"
                ))
            })?;
        let ins = insumo::Entity::find_by_id(&equipo_costo_horario_insumo_id)
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "equipo_costo_horario {equipo_costo_horario_insumo_id}"
                ))
            })?;
        let resultado = combinar_equipo(ins, equipo);
        txn.commit().await?;
        Ok(resultado)
    }

    /// `material` (consumo) y `categoria_fasar`/`cuadrilla` (operación) son
    /// las únicas extensiones válidas dentro de un equipo_costo_horario — en
    /// particular, esto rechaza referenciar otro `equipo_costo_horario`
    /// (que también es `insumo.tipo = equipo_herramienta`, pero no tiene
    /// fila en ninguna de las tres), preservando la composición plana no
    /// recursiva del diccionario de datos.
    async fn resolver_tipo(
        txn: &DatabaseTransaction,
        detalle_insumo_id: &str,
    ) -> Result<TipoEquipoCostoHorarioDetalle, ServiceError> {
        if material::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok(TipoEquipoCostoHorarioDetalle::Consumo);
        }
        if categoria_fasar::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok(TipoEquipoCostoHorarioDetalle::Operacion);
        }
        if cuadrilla::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok(TipoEquipoCostoHorarioDetalle::Operacion);
        }
        Err(ServiceError::Validacion(format!(
            "\"{detalle_insumo_id}\" no es un material, una categoría FASAR ni una cuadrilla — un equipo de costo horario no puede contener otro equipo de costo horario"
        )))
    }

    /// `naturaleza` es obligatoria en consumo y nula en operación — ver
    /// `equipo_costo_horario_detalle` en el diccionario. En una edición de
    /// consumo, si no viene en el payload se conserva la que ya tenía la fila.
    fn resolver_naturaleza(
        tipo: TipoEquipoCostoHorarioDetalle,
        propuesta: Option<NaturalezaEquipoCostoHorarioDetalle>,
        existente: Option<NaturalezaEquipoCostoHorarioDetalle>,
    ) -> Result<Option<NaturalezaEquipoCostoHorarioDetalle>, ServiceError> {
        match tipo {
            TipoEquipoCostoHorarioDetalle::Consumo => propuesta
                .or(existente)
                .ok_or_else(|| {
                    ServiceError::Validacion(
                        "naturaleza es obligatoria cuando el renglón es de consumo (combustible, lubricante, llantas, piezas_especiales u otras_fuentes)".into(),
                    )
                })
                .map(Some),
            TipoEquipoCostoHorarioDetalle::Operacion => {
                if propuesta.is_some() {
                    return Err(ServiceError::Validacion(
                        "naturaleza solo aplica a renglones de consumo; en operación debe ir vacía".into(),
                    ));
                }
                Ok(None)
            }
        }
    }

    async fn validar_referencia(
        txn: &DatabaseTransaction,
        equipo_costo_horario_insumo_id: &str,
        detalle_insumo_id: &str,
    ) -> Result<(), ServiceError> {
        if detalle_insumo_id == equipo_costo_horario_insumo_id {
            return Err(ServiceError::Validacion(
                "un equipo de costo horario no puede referenciarse a sí mismo".to_string(),
            ));
        }
        let equipo_ins = insumo::Entity::find_by_id(equipo_costo_horario_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "equipo_costo_horario {equipo_costo_horario_insumo_id}"
                ))
            })?;
        let detalle_ins = insumo::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("insumo {detalle_insumo_id}")))?;
        if equipo_ins.organizacion_id != detalle_ins.organizacion_id {
            return Err(ServiceError::Validacion(
                "el insumo debe pertenecer a la misma organización que el equipo de costo horario"
                    .to_string(),
            ));
        }
        Ok(())
    }

    async fn siguiente_orden(
        txn: &DatabaseTransaction,
        equipo_costo_horario_insumo_id: &str,
    ) -> Result<i32, ServiceError> {
        let maximo = equipo_costo_horario_detalle::Entity::find()
            .filter(
                equipo_costo_horario_detalle::Column::EquipoCostoHorarioInsumoId
                    .eq(equipo_costo_horario_insumo_id),
            )
            .order_by_desc(equipo_costo_horario_detalle::Column::Orden)
            .one(txn)
            .await?;
        Ok(maximo.map(|d| d.orden + 1).unwrap_or(0))
    }

    /// Corre siempre contra `txn` (nunca `repo.conexion()` directamente):
    /// como ya hay una transacción abierta sobre la única conexión del
    /// portafolio, pedir una conexión aparte se quedaría esperando a que
    /// `txn` la libere — un candado consigo misma (mismo patrón que
    /// `CuadrillaDetalleService::recalcular`). Por eso el precio de material
    /// y el salario/costo del operador se resuelven aquí mismo, inline.
    async fn recalcular(
        txn: &DatabaseTransaction,
        equipo_costo_horario_insumo_id: &str,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let ins = insumo::Entity::find_by_id(equipo_costo_horario_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "equipo_costo_horario {equipo_costo_horario_insumo_id}"
                ))
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

        let detalles = equipo_costo_horario_detalle::Entity::find()
            .filter(
                equipo_costo_horario_detalle::Column::EquipoCostoHorarioInsumoId
                    .eq(equipo_costo_horario_insumo_id),
            )
            .order_by_asc(equipo_costo_horario_detalle::Column::Orden)
            .all(txn)
            .await?;

        let mut subtotal_consumo = Decimal::ZERO;
        let mut subtotal_operacion = Decimal::ZERO;
        let mut pendientes: Vec<(String, Decimal, Decimal)> = Vec::new();

        for d in detalles
            .iter()
            .filter(|d| d.tipo == TipoEquipoCostoHorarioDetalle::Consumo)
        {
            let precio = precio_material::Entity::find()
                .filter(precio_material::Column::MaterialId.eq(&d.detalle_insumo_id))
                .filter(precio_material::Column::RegionId.is_null())
                .filter(precio_material::Column::Moneda.eq(&moneda_default.codigo))
                .filter(precio_material::Column::FechaVigenciaHasta.is_null())
                .order_by_desc(precio_material::Column::FechaVigenciaDesde)
                .one(txn)
                .await?
                .ok_or_else(|| {
                    ServiceError::Validacion(format!(
                        "\"{}\" no tiene un precio nacional vigente registrado en {}",
                        d.detalle_insumo_id, moneda_default.codigo
                    ))
                })?;
            let importe = d.cantidad * precio.precio;
            subtotal_consumo += importe;
            pendientes.push((d.id.clone(), precio.precio, importe));
        }

        for d in detalles
            .iter()
            .filter(|d| d.tipo == TipoEquipoCostoHorarioDetalle::Operacion)
        {
            let costo = if let Some(salario) = salario_categoria_fasar::Entity::find()
                .filter(salario_categoria_fasar::Column::InsumoId.eq(&d.detalle_insumo_id))
                .filter(salario_categoria_fasar::Column::RegionId.is_null())
                .filter(salario_categoria_fasar::Column::FechaVigenciaHasta.is_null())
                .order_by_desc(salario_categoria_fasar::Column::FechaVigenciaDesde)
                .one(txn)
                .await?
            {
                salario.salario_real_diario
            } else if let Some(costo_total) =
                CuadrillaCostoService::resolver_costo_total(txn, &d.detalle_insumo_id, None).await?
            {
                costo_total
            } else {
                return Err(ServiceError::Validacion(format!(
                    "\"{}\" no tiene un salario nacional vigente ni es una cuadrilla con costo calculado",
                    d.detalle_insumo_id
                )));
            };
            let importe = d.cantidad * costo;
            subtotal_operacion += importe;
            pendientes.push((d.id.clone(), costo, importe));
        }
        let cargo_variable_hora = subtotal_consumo + subtotal_operacion;

        for (id, costo, importe) in pendientes {
            let mut am: equipo_costo_horario_detalle::ActiveModel =
                equipo_costo_horario_detalle::Entity::find_by_id(&id)
                    .one(txn)
                    .await?
                    .ok_or_else(|| {
                        ServiceError::NoEncontrado(format!("equipo_costo_horario_detalle {id}"))
                    })?
                    .into();
            am.costo = Set(costo);
            am.importe = Set(importe);
            am.update(txn).await?;
        }

        let equipo_existente =
            equipo_costo_horario::Entity::find_by_id(equipo_costo_horario_insumo_id)
                .one(txn)
                .await?
                .ok_or_else(|| {
                    ServiceError::NoEncontrado(format!(
                        "equipo_costo_horario {equipo_costo_horario_insumo_id}"
                    ))
                })?;
        let cf_cargo_fijo_hora = equipo_existente.cf_cargo_fijo_hora;
        let mut eq: equipo_costo_horario::ActiveModel = equipo_existente.into();
        eq.subtotal_consumo = Set(subtotal_consumo);
        eq.subtotal_operacion = Set(subtotal_operacion);
        eq.cargo_variable_hora = Set(cargo_variable_hora);
        eq.costo_horario_total = Set(cf_cargo_fijo_hora + cargo_variable_hora);
        let equipo = eq.update(txn).await?;

        let ins = insumo::Entity::find_by_id(equipo_costo_horario_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "equipo_costo_horario {equipo_costo_horario_insumo_id}"
                ))
            })?;
        Ok(combinar_equipo(ins, equipo))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::categoria_fasar::{CategoriaFasarData, CategoriaFasarService};
    use crate::equipo_costo_horario::{EquipoCostoHorarioData, EquipoCostoHorarioService};
    use crate::factor_salario_real::{FactorSalarioRealData, FactorSalarioRealService};
    use crate::material::{MaterialData, MaterialService};
    use crate::precio_material::{PrecioMaterialData, PrecioMaterialService};
    use crate::salario_categoria_fasar::{SalarioCategoriaFasarData, SalarioCategoriaFasarService};
    use obrix_db::PortafolioSqliteRepository;
    use obrix_db::entities::{moneda as moneda_entity, organizacion, unidad_medida, usuario};
    use sea_orm::ActiveModelTrait;
    use std::path::Path;
    use std::str::FromStr;

    async fn portafolio_con_fixtures() -> PortafolioSqliteRepository {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-14T00:00:00Z".to_string();

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

        moneda_entity::ActiveModel {
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
            id: Set("um-hr".into()),
            simbolo: Set("hr".into()),
            simbolo_impresion: Set("hr".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Hora".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Tiempo),
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
            id: Set("um-lt".into()),
            simbolo: Set("lt".into()),
            simbolo_impresion: Set("lt".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Litro".into()),
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

        unidad_medida::ActiveModel {
            id: Set("um-jor".into()),
            simbolo: Set("jor".into()),
            simbolo_impresion: Set("jor".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Jornal".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Otro),
            created_at: Set(now),
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

    async fn crear_equipo(
        portafolio: &PortafolioSqliteRepository,
        clave: &str,
    ) -> EquipoCostoHorarioCompleto {
        EquipoCostoHorarioService::crear(
            portafolio,
            "org-1",
            EquipoCostoHorarioData {
                clave: clave.into(),
                descripcion: "Excavadora CAT 320".into(),
                unidad_id: "um-hr".into(),
                familia_id: None,
                sub_familia_id: None,
                region_id: None,
                cf_costo_maquina: Decimal::from_str("1000000").unwrap(),
                cf_valor_llantas: Decimal::ZERO,
                cf_valor_piezas_especiales: Decimal::ZERO,
                cf_valor_rescate_porcentaje: Decimal::from_str("10").unwrap(),
                cf_vida_economica_anios: Decimal::from_str("5").unwrap(),
                cf_horas_uso_anual: Decimal::from_str("2000").unwrap(),
                cf_tasa_interes_anual_porcentaje: Decimal::from_str("12").unwrap(),
                cf_tasa_seguros_anual_porcentaje: Decimal::from_str("4").unwrap(),
                cf_mantenimiento_porcentaje: Decimal::from_str("60").unwrap(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear equipo_costo_horario")
    }

    async fn crear_material_con_precio(
        portafolio: &PortafolioSqliteRepository,
        clave: &str,
        descripcion: &str,
        precio: &str,
    ) -> String {
        let material = MaterialService::crear(
            portafolio,
            "org-1",
            MaterialData {
                clave: clave.into(),
                descripcion: descripcion.into(),
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
        .expect("crear material");

        PrecioMaterialService::crear(
            portafolio,
            &material.id,
            PrecioMaterialData {
                precio: Decimal::from_str(precio).unwrap(),
                moneda: "MXN".into(),
                region_id: None,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("registrar precio de material");

        material.id
    }

    async fn crear_operador_con_salario(
        portafolio: &PortafolioSqliteRepository,
        salario_real_diario: &str,
    ) -> String {
        let fsr = FactorSalarioRealService::crear(
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
        .id;

        let categoria = CategoriaFasarService::crear(
            portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "OP-1".into(),
                descripcion: "Operador de maquinaria".into(),
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
                factor_salario_real_id: fsr,
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

    #[tokio::test]
    async fn agregar_consumo_y_operacion_calcula_cargo_variable_y_costo_total() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo = crear_equipo(&portafolio, "ECH-1").await;
        let diesel = crear_material_con_precio(&portafolio, "MAT-1", "Diesel", "22.50").await;
        let operador = crear_operador_con_salario(&portafolio, "500").await;

        let tras_consumo = EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo.id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: diesel.clone(),
                cantidad: Decimal::from_str("8").unwrap(),
                naturaleza: Some(NaturalezaEquipoCostoHorarioDetalle::Combustible),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar consumo de diesel");
        // 8 lt × 22.50 = 180.00
        assert_eq!(
            tras_consumo.cargo_variable_hora,
            Decimal::from_str("180.00").unwrap()
        );
        assert_eq!(
            tras_consumo.costo_horario_total,
            equipo.cf_cargo_fijo_hora + Decimal::from_str("180.00").unwrap()
        );

        let tras_operacion = EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo.id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: operador.clone(),
                cantidad: Decimal::from_str("0.125").unwrap(),
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar operacion");
        // 180.00 + 0.125 × 500 = 180.00 + 62.5 = 242.5
        assert_eq!(
            tras_operacion.cargo_variable_hora,
            Decimal::from_str("242.500").unwrap()
        );
        assert_eq!(
            tras_operacion.costo_horario_total,
            equipo.cf_cargo_fijo_hora + Decimal::from_str("242.500").unwrap()
        );

        let detalles = EquipoCostoHorarioDetalleService::listar_por_equipo(&portafolio, &equipo.id)
            .await
            .expect("listar detalles");
        assert_eq!(detalles.len(), 2);
        let fila_consumo = detalles
            .iter()
            .find(|d| d.detalle_insumo_id == diesel)
            .unwrap();
        assert_eq!(fila_consumo.tipo, TipoEquipoCostoHorarioDetalle::Consumo);
        assert_eq!(
            fila_consumo.naturaleza,
            Some(NaturalezaEquipoCostoHorarioDetalle::Combustible)
        );
        let fila_operacion = detalles
            .iter()
            .find(|d| d.detalle_insumo_id == operador)
            .unwrap();
        assert_eq!(
            fila_operacion.tipo,
            TipoEquipoCostoHorarioDetalle::Operacion
        );
        assert_eq!(fila_operacion.naturaleza, None);
        assert_eq!(fila_operacion.costo, Decimal::from_str("500").unwrap());

        let tras_borrar =
            EquipoCostoHorarioDetalleService::eliminar(&portafolio, fila_operacion.id.clone())
                .await
                .expect("borrar operacion");
        assert_eq!(
            tras_borrar.cargo_variable_hora,
            Decimal::from_str("180.00").unwrap()
        );
    }

    #[tokio::test]
    async fn rechaza_referenciar_otro_equipo_costo_horario() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo = crear_equipo(&portafolio, "ECH-1").await;
        let otro_equipo = crear_equipo(&portafolio, "ECH-2").await;

        let err = EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo.id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: otro_equipo.id,
                cantidad: Decimal::ONE,
                naturaleza: None,
            },
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir anidar equipos de costo horario");
        match err {
            ServiceError::Validacion(mensaje) => {
                assert!(
                    mensaje.contains("no puede contener otro equipo de costo horario"),
                    "mensaje inesperado: {mensaje}"
                );
            }
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }
    }
}
