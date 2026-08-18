use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "historial_cambio")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    /// FK lógica a `proyecto` — esa tabla todavía no existe en el ORM, así
    /// que no se declara `ForeignKey` aquí (ver nota en la migración).
    pub proyecto_id: String,
    pub entidad: String,
    pub entidad_id: String,
    pub accion: AccionHistorial,
    pub usuario_id: String,
    /// JSON serializado como texto — el snapshot de campos cambiados no se
    /// consulta por columna, así que no vale la pena habilitar el tipo
    /// `Json` de SeaORM solo para esta tabla.
    pub diff_json: String,
    pub created_at: String,
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
pub enum AccionHistorial {
    Crear,
    Actualizar,
    Eliminar,
}
