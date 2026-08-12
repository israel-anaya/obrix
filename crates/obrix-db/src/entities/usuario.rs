use sea_orm::entity::prelude::*;

/// Identidad global — no pertenece a una sola organización. Qué
/// organizaciones puede ver vive en `organizacion_usuario`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "usuario")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub nombre: String,
    pub correo: String,
    pub rol: RolUsuario,
    pub activo: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum RolUsuario {
    Admin,
    Propietario,
    Editor,
    Lector,
}
