use sea_orm::entity::prelude::*;

/// Plan de suscripción de una `organizacion` — compartido entre
/// `suscripcion` y el catálogo `plan_capacidad`.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    EnumIter,
    DeriveActiveEnum,
    serde::Serialize,
    serde::Deserialize,
)]
#[sea_orm(
    rs_type = "String",
    db_type = "String(StringLen::None)",
    rename_all = "snake_case"
)]
#[serde(rename_all = "snake_case")]
pub enum Plan {
    Free,
    Profesional,
    Enterprise,
}
