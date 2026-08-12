use sea_orm::entity::prelude::*;

/// Extensión 1:1 de `insumo` cuando `insumo.tipo = material` — `insumo_id`
/// es a la vez PK y FK, no tiene `id` propio. Sin columnas de auditoría
/// propias: comparte el ciclo de vida de su `insumo`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "material")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub insumo_id: String,
    pub proveedor_id: Option<String>,
    /// Porcentaje de merma típico, 0 a 100.
    pub merma_porcentaje: Option<i32>,
    pub marca: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::insumo::Entity",
        from = "Column::InsumoId",
        to = "super::insumo::Column::Id"
    )]
    Insumo,
    #[sea_orm(
        belongs_to = "super::proveedor::Entity",
        from = "Column::ProveedorId",
        to = "super::proveedor::Column::Id"
    )]
    Proveedor,
}

impl Related<super::insumo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Insumo.def()
    }
}

impl Related<super::proveedor::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Proveedor.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
