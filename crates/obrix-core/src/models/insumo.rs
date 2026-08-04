use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TipoInsumo {
    Material,
    ManoObra,
    EquipoHerramienta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Insumo {
    pub id: Uuid,
    pub clave: String,
    pub tipo: TipoInsumo,
    pub descripcion: String,
    pub unidad: String,
    pub precio_base: Decimal,
}
