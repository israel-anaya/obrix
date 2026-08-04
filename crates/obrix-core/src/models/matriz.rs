use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::insumo::TipoInsumo;

/// Precio congelado al armar la matriz: el análisis de un concepto no debe
/// moverse si el catálogo de insumos se actualiza después de cerrar el presupuesto.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApuMatrizItem {
    pub id: Uuid,
    pub concepto_id: Uuid,
    pub insumo_id: Uuid,
    pub tipo: TipoInsumo,
    pub rendimiento: Decimal,
    pub precio_unitario: Decimal,
    pub congelado: bool,
}

impl ApuMatrizItem {
    pub fn importe(&self) -> Decimal {
        self.rendimiento * self.precio_unitario
    }
}
