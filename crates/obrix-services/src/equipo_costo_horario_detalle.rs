//! Administra la composición (`equipo_costo_horario_detalle`) de un
//! `equipo_costo_horario` — consumo (`material`) y operación
//! (`categoria_fasar`/`cuadrilla`), en una matriz plana no recursiva
//! **compartida entre regiones** (ver diccionario de datos). `cantidad` vive
//! aquí (definición del equipo); `costo`/`importe` los administra el
//! recálculo de cada `equipo_costo_horario_costo`. Cada alta/baja o cambio
//! de cantidad materializa el cache de **todas** las regiones del catálogo
//! y las recalcula.

use obrix_db::PortafolioRepository;
use obrix_db::entities::equipo_costo_horario_detalle::{
    NaturalezaEquipoCostoHorarioDetalle, TipoEquipoCostoHorarioDetalle,
};
use obrix_db::entities::{
    categoria_fasar, cuadrilla, equipo_costo_horario, equipo_costo_horario_costo,
    equipo_costo_horario_costo_detalle, equipo_costo_horario_detalle, insumo, material,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseTransaction, EntityTrait, QueryFilter,
    QueryOrder, TransactionTrait,
};

use crate::equipo_costo_horario::{EquipoCostoHorarioCompleto, combinar as combinar_equipo};
use crate::equipo_costo_horario_costo::EquipoCostoHorarioCostoService;
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
    /// Obligatorio si el insumo es un material (`tipo = consumo`). En
    /// operación se deriva de la extensión del insumo (`categoria` o
    /// `cuadrilla`): mandarla es opcional y solo puede confirmar la derivada.
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
            .filter(equipo_costo_horario_detalle::Column::Deleted.eq(false))
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

        let (tipo, derivada) = Self::clasificar(&txn, &datos.detalle_insumo_id).await?;
        let naturaleza =
            Self::resolver_naturaleza(tipo.clone(), derivada, datos.naturaleza, None)?;
        Self::validar_referencia(
            &txn,
            equipo_costo_horario_insumo_id,
            &datos.detalle_insumo_id,
        )
        .await?;
        let orden = Self::siguiente_orden(&txn, equipo_costo_horario_insumo_id, &tipo).await?;
        let ahora = crate::ahora();

        let valuaciones = EquipoCostoHorarioCostoService::asegurar_zonas(
            &txn,
            equipo_costo_horario_insumo_id,
            &creado_por,
        )
        .await?;

        let nuevo_detalle = equipo_costo_horario_detalle::ActiveModel {
            id: Set(nuevo_id()),
            equipo_costo_horario_insumo_id: Set(equipo_costo_horario_insumo_id.to_string()),
            detalle_insumo_id: Set(datos.detalle_insumo_id),
            tipo: Set(tipo),
            naturaleza: Set(naturaleza),
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

        for v in &valuaciones {
            equipo_costo_horario_costo_detalle::ActiveModel {
                id: Set(nuevo_id()),
                equipo_costo_horario_costo_id: Set(v.id.clone()),
                equipo_costo_horario_detalle_id: Set(nuevo_detalle.id.clone()),
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
            EquipoCostoHorarioCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }

        let resultado = Self::cargar_completo(&txn, equipo_costo_horario_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Cambia a qué insumo apunta el renglón y/o su `cantidad` (de la receta,
    /// no de una valuación). Recalcula todas las valuaciones.
    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: EquipoCostoHorarioDetalleData,
        actualizado_por: Option<String>,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = equipo_costo_horario_detalle::Entity::find_by_id(&id)
            .filter(equipo_costo_horario_detalle::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("equipo_costo_horario_detalle {id}"))
            })?;
        let equipo_costo_horario_insumo_id = existente.equipo_costo_horario_insumo_id.clone();
        let autor = actualizado_por
            .clone()
            .unwrap_or_else(|| existente.created_by.clone());

        let (tipo, derivada) = Self::clasificar(&txn, &datos.detalle_insumo_id).await?;
        let naturaleza = Self::resolver_naturaleza(
            tipo.clone(),
            derivada,
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

        let valuaciones = EquipoCostoHorarioCostoService::asegurar_zonas(
            &txn,
            &equipo_costo_horario_insumo_id,
            &autor,
        )
        .await?;
        for v in &valuaciones {
            EquipoCostoHorarioCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }

        let resultado = Self::cargar_completo(&txn, &equipo_costo_horario_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Borrado lógico del renglón de receta — en cascada se borran (lógico)
    /// sus `equipo_costo_horario_costo_detalle` en **todas** las valuaciones
    /// y se recalculan.
    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = equipo_costo_horario_detalle::Entity::find_by_id(&id)
            .filter(equipo_costo_horario_detalle::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("equipo_costo_horario_detalle {id}"))
            })?;
        let equipo_costo_horario_insumo_id = existente.equipo_costo_horario_insumo_id.clone();
        let ahora = crate::ahora();

        let detalles_costo = equipo_costo_horario_costo_detalle::Entity::find()
            .filter(
                equipo_costo_horario_costo_detalle::Column::EquipoCostoHorarioDetalleId.eq(id.clone()),
            )
            .filter(equipo_costo_horario_costo_detalle::Column::Deleted.eq(false))
            .all(&txn)
            .await?;
        for d in detalles_costo {
            let mut am: equipo_costo_horario_costo_detalle::ActiveModel = d.into();
            am.deleted = Set(true);
            am.deleted_at = Set(Some(ahora.clone()));
            am.deleted_by = Set(Some(eliminado_por.clone()));
            am.update(&txn).await?;
        }

        let mut am: equipo_costo_horario_detalle::ActiveModel = existente.into();
        am.deleted = Set(true);
        am.deleted_at = Set(Some(ahora));
        am.deleted_by = Set(Some(eliminado_por.clone()));
        am.update(&txn).await?;

        let valuaciones = EquipoCostoHorarioCostoService::asegurar_zonas(
            &txn,
            &equipo_costo_horario_insumo_id,
            &eliminado_por,
        )
        .await?;
        for v in &valuaciones {
            EquipoCostoHorarioCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }

        let resultado = Self::cargar_completo(&txn, &equipo_costo_horario_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Intercambia el `orden` de una fila con el de su vecina (dentro del
    /// mismo `tipo` — consumo y operación se ordenan por separado). No hace
    /// nada si ya es la primera/última de su tabla. No dispara recálculo.
    pub async fn mover(
        repo: &dyn PortafolioRepository,
        id: String,
        direccion: DireccionMovimiento,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = equipo_costo_horario_detalle::Entity::find_by_id(&id)
            .filter(equipo_costo_horario_detalle::Column::Deleted.eq(false))
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
            .filter(equipo_costo_horario_detalle::Column::Deleted.eq(false))
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

        let resultado = Self::cargar_completo(&txn, &equipo_costo_horario_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// `tipo` y, en operación, la `naturaleza` que le corresponde — ambos
    /// denormalizados de qué extensión resuelve `detalle_insumo_id`. En
    /// consumo la naturaleza no se deriva: la captura el analista.
    ///
    /// `material` (consumo) y `categoria_fasar`/`cuadrilla` (operación) son
    /// las únicas extensiones válidas dentro de un equipo_costo_horario — en
    /// particular, esto rechaza referenciar otro `equipo_costo_horario`.
    async fn clasificar(
        txn: &DatabaseTransaction,
        detalle_insumo_id: &str,
    ) -> Result<
        (
            TipoEquipoCostoHorarioDetalle,
            Option<NaturalezaEquipoCostoHorarioDetalle>,
        ),
        ServiceError,
    > {
        if material::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok((TipoEquipoCostoHorarioDetalle::Consumo, None));
        }
        if categoria_fasar::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok((
                TipoEquipoCostoHorarioDetalle::Operacion,
                Some(NaturalezaEquipoCostoHorarioDetalle::Categoria),
            ));
        }
        if cuadrilla::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok((
                TipoEquipoCostoHorarioDetalle::Operacion,
                Some(NaturalezaEquipoCostoHorarioDetalle::Cuadrilla),
            ));
        }
        Err(ServiceError::Validacion(format!(
            "\"{detalle_insumo_id}\" no es un material, una categoría FASAR ni una cuadrilla — un equipo de costo horario no puede contener otro equipo de costo horario"
        )))
    }

    /// `naturaleza` es obligatoria en ambos tipos, con un subconjunto de
    /// valores por tipo. En consumo la captura el analista (desglose CMIC);
    /// en operación la manda `derivada` — `categoria` o `cuadrilla` según la
    /// extensión del insumo — y lo que venga del cliente solo puede
    /// confirmarla.
    fn resolver_naturaleza(
        tipo: TipoEquipoCostoHorarioDetalle,
        derivada: Option<NaturalezaEquipoCostoHorarioDetalle>,
        propuesta: Option<NaturalezaEquipoCostoHorarioDetalle>,
        existente: Option<NaturalezaEquipoCostoHorarioDetalle>,
    ) -> Result<Option<NaturalezaEquipoCostoHorarioDetalle>, ServiceError> {
        match tipo {
            TipoEquipoCostoHorarioDetalle::Consumo => {
                let naturaleza = propuesta
                    .or_else(|| existente.filter(|n| n.valida_para(&tipo)))
                    .ok_or_else(|| {
                        ServiceError::Validacion(
                            "naturaleza es obligatoria cuando el renglón es de consumo (combustible, lubricante, llantas, piezas_especiales u otras_fuentes)".into(),
                        )
                    })?;
                if !naturaleza.valida_para(&tipo) {
                    return Err(ServiceError::Validacion(
                        "categoria y cuadrilla son naturalezas de operación; un consumo va con combustible, lubricante, llantas, piezas_especiales u otras_fuentes".into(),
                    ));
                }
                Ok(Some(naturaleza))
            }
            TipoEquipoCostoHorarioDetalle::Operacion => {
                if let Some(propuesta) = propuesta {
                    if Some(&propuesta) != derivada.as_ref() {
                        return Err(ServiceError::Validacion(
                            "en operación la naturaleza la define la extensión del insumo (categoria o cuadrilla); no se puede capturar otra".into(),
                        ));
                    }
                }
                Ok(derivada)
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
        tipo: &TipoEquipoCostoHorarioDetalle,
    ) -> Result<i32, ServiceError> {
        let maximo = equipo_costo_horario_detalle::Entity::find()
            .filter(
                equipo_costo_horario_detalle::Column::EquipoCostoHorarioInsumoId
                    .eq(equipo_costo_horario_insumo_id),
            )
            .filter(equipo_costo_horario_detalle::Column::Tipo.eq(tipo.clone()))
            .filter(equipo_costo_horario_detalle::Column::Deleted.eq(false))
            .order_by_desc(equipo_costo_horario_detalle::Column::Orden)
            .one(txn)
            .await?;
        Ok(maximo.map(|d| d.orden + 1).unwrap_or(0))
    }

    async fn cargar_completo(
        txn: &DatabaseTransaction,
        equipo_costo_horario_insumo_id: &str,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let eq = equipo_costo_horario::Entity::find_by_id(equipo_costo_horario_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "equipo_costo_horario {equipo_costo_horario_insumo_id}"
                ))
            })?;
        let ins = insumo::Entity::find_by_id(equipo_costo_horario_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!(
                    "equipo_costo_horario {equipo_costo_horario_insumo_id}"
                ))
            })?;
        let costo_nacional = equipo_costo_horario_costo::Entity::find()
            .filter(
                equipo_costo_horario_costo::Column::EquipoCostoHorarioId
                    .eq(equipo_costo_horario_insumo_id),
            )
            .filter(equipo_costo_horario_costo::Column::RegionId.is_null())
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?;
        Ok(combinar_equipo(ins, eq, costo_nacional))
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

    fn datos_equipo(clave: &str) -> EquipoCostoHorarioData {
        EquipoCostoHorarioData {
            clave: clave.into(),
            descripcion: "Excavadora CAT 320".into(),
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

    async fn crear_equipo(
        portafolio: &PortafolioSqliteRepository,
        clave: &str,
    ) -> EquipoCostoHorarioCompleto {
        EquipoCostoHorarioService::crear(portafolio, "org-1", datos_equipo(clave), "usr-1".into())
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
        let costo = tras_consumo.costo_nacional.as_ref().unwrap();
        assert_eq!(costo.cargo_variable_hora, Decimal::from_str("180.00").unwrap());
        assert_eq!(
            costo.costo_total,
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
        let costo = tras_operacion.costo_nacional.as_ref().unwrap();
        assert_eq!(
            costo.cargo_variable_hora,
            Decimal::from_str("242.500").unwrap()
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
        let fila_operacion = detalles
            .iter()
            .find(|d| d.detalle_insumo_id == operador)
            .unwrap();
        assert_eq!(
            fila_operacion.tipo,
            TipoEquipoCostoHorarioDetalle::Operacion
        );

        let valuacion = crate::equipo_costo_horario_costo::EquipoCostoHorarioCostoService::listar_por_equipo(
            &portafolio,
            &equipo.id,
        )
        .await
        .unwrap()
        .into_iter()
        .find(|c| c.region_id.is_none())
        .unwrap();
        let costo_detalles =
            crate::equipo_costo_horario_costo_detalle::EquipoCostoHorarioCostoDetalleService::listar_por_costo(
                &portafolio,
                &valuacion.id,
            )
            .await
            .unwrap();
        let fila_op_costo = costo_detalles
            .iter()
            .find(|d| d.equipo_costo_horario_detalle_id == fila_operacion.id)
            .unwrap();
        assert_eq!(fila_op_costo.costo, Decimal::from_str("500").unwrap());

        let tras_borrar = EquipoCostoHorarioDetalleService::eliminar(
            &portafolio,
            fila_operacion.id.clone(),
            "usr-1".into(),
        )
        .await
        .expect("borrar operacion");
        assert_eq!(
            tras_borrar
                .costo_nacional
                .as_ref()
                .unwrap()
                .cargo_variable_hora,
            Decimal::from_str("180.00").unwrap()
        );
    }

    #[tokio::test]
    async fn operacion_deriva_naturaleza_de_la_extension_del_insumo() {
        use crate::cuadrilla::{CuadrillaData, CuadrillaService};

        let portafolio = portafolio_con_fixtures().await;
        let equipo = crear_equipo(&portafolio, "ECH-1").await;
        let operador = crear_operador_con_salario(&portafolio, "500").await;
        let cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla de operación".into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla")
        .id;

        for insumo_id in [operador.clone(), cuadrilla.clone()] {
            EquipoCostoHorarioDetalleService::crear(
                &portafolio,
                &equipo.id,
                EquipoCostoHorarioDetalleData {
                    detalle_insumo_id: insumo_id,
                    cantidad: Decimal::ONE,
                    naturaleza: None,
                },
                "usr-1".into(),
            )
            .await
            .expect("agregar operacion");
        }

        let detalles = EquipoCostoHorarioDetalleService::listar_por_equipo(&portafolio, &equipo.id)
            .await
            .expect("listar detalles");
        let de_categoria = detalles
            .iter()
            .find(|d| d.detalle_insumo_id == operador)
            .unwrap();
        let de_cuadrilla = detalles
            .iter()
            .find(|d| d.detalle_insumo_id == cuadrilla)
            .unwrap();
        assert_eq!(
            de_categoria.naturaleza,
            Some(NaturalezaEquipoCostoHorarioDetalle::Categoria)
        );
        assert_eq!(
            de_cuadrilla.naturaleza,
            Some(NaturalezaEquipoCostoHorarioDetalle::Cuadrilla)
        );

        // Reenviar la naturaleza derivada (lo que hace la ficha al editar la
        // cantidad) no debe fallar.
        EquipoCostoHorarioDetalleService::actualizar(
            &portafolio,
            de_cuadrilla.id.clone(),
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: cuadrilla.clone(),
                cantidad: Decimal::from(2),
                naturaleza: Some(NaturalezaEquipoCostoHorarioDetalle::Cuadrilla),
            },
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar cantidad conservando la naturaleza derivada");

        let err = EquipoCostoHorarioDetalleService::actualizar(
            &portafolio,
            de_cuadrilla.id.clone(),
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: cuadrilla,
                cantidad: Decimal::ONE,
                naturaleza: Some(NaturalezaEquipoCostoHorarioDetalle::Categoria),
            },
            Some("usr-1".into()),
        )
        .await
        .expect_err("no debe permitir capturar una naturaleza que contradiga la extensión");
        match err {
            ServiceError::Validacion(mensaje) => assert!(
                mensaje.contains("la define la extensión del insumo"),
                "mensaje inesperado: {mensaje}"
            ),
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }
    }

    #[tokio::test]
    async fn consumo_rechaza_naturaleza_de_operacion() {
        let portafolio = portafolio_con_fixtures().await;
        let equipo = crear_equipo(&portafolio, "ECH-1").await;
        let diesel = crear_material_con_precio(&portafolio, "MAT-1", "Diesel", "22.50").await;

        let err = EquipoCostoHorarioDetalleService::crear(
            &portafolio,
            &equipo.id,
            EquipoCostoHorarioDetalleData {
                detalle_insumo_id: diesel,
                cantidad: Decimal::ONE,
                naturaleza: Some(NaturalezaEquipoCostoHorarioDetalle::Cuadrilla),
            },
            "usr-1".into(),
        )
        .await
        .expect_err("cuadrilla no es una naturaleza de consumo");
        match err {
            ServiceError::Validacion(mensaje) => assert!(
                mensaje.contains("naturalezas de operación"),
                "mensaje inesperado: {mensaje}"
            ),
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }
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
