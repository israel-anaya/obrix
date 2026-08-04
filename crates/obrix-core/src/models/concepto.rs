use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Concepto {
    pub id: Uuid,
    pub clave: String,
    pub descripcion: String,
    pub unidad: String,
    pub cantidad: Decimal,
    pub parent_id: Option<Uuid>,
}
