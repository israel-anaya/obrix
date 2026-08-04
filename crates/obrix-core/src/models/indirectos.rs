use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Porcentajes expresados en base 100 (ej. 8 = 8%), no en fracción.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParametrosIndirectos {
    pub pct_administracion_campo: Decimal,
    pub pct_administracion_oficina: Decimal,
    pub pct_financiamiento: Decimal,
    pub pct_utilidad: Decimal,
    pub pct_cargos_adicionales: Decimal,
}
