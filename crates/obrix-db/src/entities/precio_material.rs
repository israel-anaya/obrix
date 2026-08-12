use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Historial de precios de `material` — nunca se sobrescribe, cada precio
/// nuevo es una fila con su propia vigencia. A diferencia de `material`,
/// tiene su propio `id` y ciclo de vida (varias filas por material).
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "precio_material")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    /// FK → `material.insumo_id`.
    pub insumo_id: String,
    pub region_id: Option<String>,
    pub precio: Decimal,
    pub moneda: String,
    pub fecha_vigencia_desde: String,
    pub fecha_vigencia_hasta: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub created_by: String,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::material::Entity",
        from = "Column::InsumoId",
        to = "super::material::Column::InsumoId"
    )]
    Material,
    #[sea_orm(
        belongs_to = "super::region::Entity",
        from = "Column::RegionId",
        to = "super::region::Column::Id"
    )]
    Region,
}

impl Related<super::material::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Material.def()
    }
}

impl Related<super::region::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Region.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
