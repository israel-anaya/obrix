use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "insumo")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub organizacion_id: String,
    pub clave: String,
    pub tipo: TipoInsumo,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    pub activo: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub created_by: String,
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
        belongs_to = "super::unidad_medida::Entity",
        from = "Column::UnidadId",
        to = "super::unidad_medida::Column::Id"
    )]
    UnidadMedida,
}

impl Related<super::organizacion::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Organizacion.def()
    }
}

impl Related<super::unidad_medida::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::UnidadMedida.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

/// Cada valor corresponde a una tabla de extensión 1:1 distinta —
/// `material` es la única implementada por ahora (ver `entities::material`).
#[derive(Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum TipoInsumo {
    Material,
    ManoObra,
    EquipoHerramienta,
    BasicoAuxiliar,
}
