use sea_orm::entity::prelude::*;

/// Extensión 1:1 de `insumo` cuando `insumo.tipo = basico_auxiliar`.
/// Tabla delgada: la receta de primer nivel vive en
/// `basico_auxiliar_componente`; la valuación por región, en
/// `basico_auxiliar_costo` / `basico_auxiliar_costo_detalle`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "basico_auxiliar")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub insumo_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::insumo::Entity",
        from = "Column::InsumoId",
        to = "super::insumo::Column::Id"
    )]
    Insumo,
    #[sea_orm(has_many = "super::basico_auxiliar_componente::Entity")]
    BasicoAuxiliarComponente,
    #[sea_orm(has_many = "super::basico_auxiliar_costo::Entity")]
    BasicoAuxiliarCosto,
}

impl Related<super::insumo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Insumo.def()
    }
}

impl Related<super::basico_auxiliar_componente::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::BasicoAuxiliarComponente.def()
    }
}

impl Related<super::basico_auxiliar_costo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::BasicoAuxiliarCosto.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
