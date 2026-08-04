use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Renglón de una hoja de números generadores. Las dimensiones no usadas se
/// dejan en `None` (equivalen a un factor de 1), como en la hoja de cálculo
/// clásica donde solo se llenan las columnas que aplican.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumeroGeneradorRenglon {
    pub id: Uuid,
    pub concepto_id: Uuid,
    pub descripcion: String,
    pub cantidad: Decimal,
    pub largo: Option<Decimal>,
    pub ancho: Option<Decimal>,
    pub alto: Option<Decimal>,
}

impl NumeroGeneradorRenglon {
    pub fn subtotal(&self) -> Decimal {
        self.cantidad
            * self.largo.unwrap_or(Decimal::ONE)
            * self.ancho.unwrap_or(Decimal::ONE)
            * self.alto.unwrap_or(Decimal::ONE)
    }
}
