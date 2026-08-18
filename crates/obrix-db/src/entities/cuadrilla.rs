use sea_orm::entity::prelude::*;

/// Extensión 1:1 de `insumo` cuando `insumo.tipo = mano_obra` y representa un
/// **equipo de trabajo compuesto** (ej. "Cuadrilla de albañilería tipo A"),
/// a diferencia de `categoria_fasar` que es un trabajador atómico. Tabla
/// delgada, sin cache: la receta (quién integra el equipo y cuántos) vive en
/// `cuadrilla_detalle`; la valuación por región (a qué costo, qué importe,
/// con los salarios de esa zona) vive en `cuadrilla_costo`/
/// `cuadrilla_costo_detalle`. Sin columnas de auditoría
/// propias: comparte el ciclo de vida de su `insumo`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "cuadrilla")]
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
    #[sea_orm(has_many = "super::cuadrilla_detalle::Entity")]
    CuadrillaDetalle,
    #[sea_orm(has_many = "super::cuadrilla_costo::Entity")]
    CuadrillaCosto,
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

impl Related<super::cuadrilla_costo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CuadrillaCosto.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
