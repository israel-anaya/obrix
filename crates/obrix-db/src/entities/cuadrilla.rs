use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Extensión 1:1 de `insumo` cuando `insumo.tipo = mano_obra` y representa un
/// **equipo de trabajo compuesto** (ej. "Cuadrilla de albañilería tipo A"),
/// a diferencia de `categoria_fasar` que es un trabajador atómico. Los tres
/// subtotales son cache — se recalculan desde `cuadrilla_detalle` cada vez
/// que su composición cambia, nunca se editan directamente. Sin columnas de
/// auditoría propias: comparte el ciclo de vida de su `insumo` (mismo patrón
/// que `material`/`categoria_fasar`).
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "cuadrilla")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub insumo_id: String,
    pub sub_total_mano_obra: Decimal,
    pub sub_total_herramienta: Decimal,
    pub costo_total: Decimal,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::insumo::Entity",
        from = "Column::InsumoId",
        to = "super::insumo::Column::Id"
    )]
    Insumo,
    #[sea_orm(has_many = "super::cuadrilla_detalle::Entity")]
    CuadrillaDetalle,
}

impl Related<super::insumo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Insumo.def()
    }
}

impl Related<super::cuadrilla_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CuadrillaDetalle.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
