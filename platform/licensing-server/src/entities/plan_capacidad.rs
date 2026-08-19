use sea_orm::entity::prelude::*;

use super::plan::Plan;

/// Catálogo de qué desbloquea cada plan. Ajustar un límite o feature flag
/// es editar este catálogo (o su semilla en la migración), no tocar código.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "plan_capacidad")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub plan: Plan,
    pub capacidad: Capacidad,
    /// `None` = ilimitado. No aplica si `capacidad` es un feature flag
    /// booleano puro (ej. `multi_usuario`) — ahí lo relevante es `habilitado`.
    pub limite: Option<i32>,
    pub habilitado: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

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
pub enum Capacidad {
    Organizaciones,
    Proyectos,
    MultiUsuario,
}
