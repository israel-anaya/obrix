use sea_orm::entity::prelude::*;

/// Extensión 1:1 de `insumo` cuando `insumo.tipo = equipo_herramienta` y se
/// trata de herramienta mayor/con motor, precio propio simple, sin cálculo
/// de depreciación (a diferencia de `equipo_costo_horario`) — `insumo_id` es
/// a la vez PK y FK, no tiene `id` propio. Sin precio propio: dentro de una
/// cuadrilla su costo se resuelve como `porcentaje_mano_obra` ×
/// `cuadrilla.sub_total_mano_obra`. Sin columnas de auditoría propias:
/// comparte el ciclo de vida de su `insumo` (mismo patrón que `material`).
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "herramienta")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub insumo_id: String,
    /// Porcentaje por default del costo de mano de obra, 0 a 100.
    pub porcentaje_mano_obra: Option<i32>,
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
