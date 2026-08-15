use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Porcentaje de un rubro de costo horario que aplica cuando el equipo está
/// inactivo, por criterio publicante — tabla de referencia, no cuelga de
/// `insumo`. Fuente de verdad del sembrado en
/// `data/initial/perfil_inactividad_equipo.csv`. `tipo` es `espera` o
/// `reserva`; `rubro` es uno de los 8 renglones fijos (`depreciacion`,
/// `inversion`, `seguros`, `mantenimiento`, `combustibles`, `lubricantes`,
/// `llantas`, `operacion`); `perfil` es el criterio publicante (`cfe`,
/// `gcdmx`, `cmic`). `(tipo, rubro, perfil)` es único.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "perfil_inactividad_equipo")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub tipo: String,
    pub rubro: String,
    pub perfil: String,
    pub valor: Decimal,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub created_by: String,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
