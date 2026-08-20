//! Cache valuado de un renglón de receta dentro de un `basico_auxiliar_costo`.
//! `cantidad` y `rendimiento` son capturables — por zona — y se mantienen
//! como inversos entre sí.

use obrix_db::PortafolioRepository;
use obrix_db::entities::{basico_auxiliar_costo, basico_auxiliar_costo_detalle};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};

use crate::basico_auxiliar_costo::BasicoAuxiliarCostoService;
use crate::ServiceError;

/// `1 / v`, o 0 si `v` es 0 (no hay inverso matemático; se evita dividir
/// entre cero en vez de propagar un error de captura).
pub(crate) fn invertir(v: Decimal) -> Decimal {
    if v.is_zero() { Decimal::ZERO } else { Decimal::ONE / v }
}

#[derive(serde::Deserialize)]
pub struct BasicoAuxiliarCostoDetalleCantidadData {
    pub cantidad: Decimal,
}

#[derive(serde::Deserialize)]
pub struct BasicoAuxiliarCostoDetalleRendimientoData {
    pub rendimiento: Decimal,
}

pub struct BasicoAuxiliarCostoDetalleService;

impl BasicoAuxiliarCostoDetalleService {
    pub async fn listar_por_costo(
        repo: &dyn PortafolioRepository,
        basico_auxiliar_costo_id: &str,
    ) -> Result<Vec<basico_auxiliar_costo_detalle::Model>, ServiceError> {
        Ok(basico_auxiliar_costo_detalle::Entity::find()
            .filter(
                basico_auxiliar_costo_detalle::Column::BasicoAuxiliarCostoId
                    .eq(basico_auxiliar_costo_id),
            )
            .filter(basico_auxiliar_costo_detalle::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    /// Cambia el rendimiento **de esta zona** y recalcula solo esa valuación.
    pub async fn actualizar_cantidad(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: BasicoAuxiliarCostoDetalleCantidadData,
        actualizado_por: Option<String>,
    ) -> Result<basico_auxiliar_costo::Model, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let existente = basico_auxiliar_costo_detalle::Entity::find_by_id(&id)
            .filter(basico_auxiliar_costo_detalle::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("basico_auxiliar_costo_detalle {id}"))
            })?;
        let costo_id = existente.basico_auxiliar_costo_id.clone();
        let mut am: basico_auxiliar_costo_detalle::ActiveModel = existente.into();
        am.cantidad = Set(datos.cantidad);
        am.rendimiento = Set(invertir(datos.cantidad));
        am.updated_at = Set(Some(crate::ahora()));
        am.updated_by = Set(actualizado_por);
        am.update(&txn).await?;
        let resultado = BasicoAuxiliarCostoService::recalcular_valuacion(&txn, &costo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Cambia el rendimiento **de esta zona** capturado como producción
    /// (inverso de `cantidad`) y recalcula solo esa valuación.
    pub async fn actualizar_rendimiento(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: BasicoAuxiliarCostoDetalleRendimientoData,
        actualizado_por: Option<String>,
    ) -> Result<basico_auxiliar_costo::Model, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let existente = basico_auxiliar_costo_detalle::Entity::find_by_id(&id)
            .filter(basico_auxiliar_costo_detalle::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("basico_auxiliar_costo_detalle {id}"))
            })?;
        let costo_id = existente.basico_auxiliar_costo_id.clone();
        let mut am: basico_auxiliar_costo_detalle::ActiveModel = existente.into();
        am.rendimiento = Set(datos.rendimiento);
        am.cantidad = Set(invertir(datos.rendimiento));
        am.updated_at = Set(Some(crate::ahora()));
        am.updated_by = Set(actualizado_por);
        am.update(&txn).await?;
        let resultado = BasicoAuxiliarCostoService::recalcular_valuacion(&txn, &costo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }
}
