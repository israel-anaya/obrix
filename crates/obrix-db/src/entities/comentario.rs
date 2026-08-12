use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "comentario")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    /// FK lógica a `proyecto` — esa tabla todavía no existe en el ORM, así
    /// que no se declara `ForeignKey` aquí (ver nota en la migración).
    pub proyecto_id: String,
    pub entidad: String,
    pub entidad_id: String,
    pub usuario_id: String,
    pub texto: String,
    pub resuelto: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
