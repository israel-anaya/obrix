use sea_orm::entity::prelude::*;

/// Membresía: qué organizaciones puede ver un usuario (identidad global,
/// ver entidad `usuario`). Única `(organizacion_id, usuario_id)`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "organizacion_usuario")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub organizacion_id: String,
    pub usuario_id: String,
    /// Revoca el acceso a esta organización sin borrar la cuenta ni la membresía.
    pub activo: bool,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::organizacion::Entity",
        from = "Column::OrganizacionId",
        to = "super::organizacion::Column::Id"
    )]
    Organizacion,
    #[sea_orm(
        belongs_to = "super::usuario::Entity",
        from = "Column::UsuarioId",
        to = "super::usuario::Column::Id"
    )]
    Usuario,
}

impl Related<super::organizacion::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Organizacion.def()
    }
}

impl Related<super::usuario::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Usuario.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
