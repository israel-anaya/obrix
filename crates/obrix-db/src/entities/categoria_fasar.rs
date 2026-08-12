use sea_orm::entity::prelude::*;

/// Extensión 1:1 de `insumo` cuando `insumo.tipo = mano_obra` y representa un
/// trabajador atómico (no una cuadrilla) — `insumo_id` es a la vez PK y FK,
/// no tiene `id` propio. Tabla delgada, sin columnas propias más allá del
/// vínculo: toda la variación (salario, FSR, vigencia, región) vive en
/// `salario_categoria_fasar`. Sin columnas de auditoría propias: comparte el
/// ciclo de vida de su `insumo` (mismo patrón que `material`).
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "categoria_fasar")]
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
}

impl Related<super::insumo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Insumo.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
