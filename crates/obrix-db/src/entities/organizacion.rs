use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "organizacion")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub razon_social: String,
    pub rfc: String,
    pub tipo: TipoOrganizacion,
    /// Moneda usada por default al capturar precios (p. ej. `precio_material`)
    /// para esta organización — requerida, siempre sembrada con MXN.
    pub moneda_default_id: String,
    /// Horas que componen una jornada laboral — default 8 (jornada diurna
    /// LFT). Decimal porque una jornada mixta puede ser 7.5.
    pub horas_jornada: Decimal,
    pub deleted: bool,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
    pub deleted_at: Option<String>,
    pub deleted_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::cliente::Entity")]
    Cliente,
    #[sea_orm(
        belongs_to = "super::moneda::Entity",
        from = "Column::MonedaDefaultId",
        to = "super::moneda::Column::Id"
    )]
    Moneda,
}

impl Related<super::cliente::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Cliente.def()
    }
}

impl Related<super::moneda::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Moneda.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize,
)]
#[sea_orm(
    rs_type = "String",
    db_type = "String(StringLen::None)",
    rename_all = "snake_case"
)]
#[serde(rename_all = "snake_case")]
pub enum TipoOrganizacion {
    Despacho,
    Constructora,
    Gobierno,
}
