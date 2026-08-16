use sea_orm::entity::prelude::*;

/// Composición **plana, no recursiva** de una `cuadrilla` — cada fila es un
/// miembro (`detalle_insumo_id` con extensión `categoria_fasar`) o una
/// herramienta (`detalle_insumo_id` con extensión `herramienta`), nunca otra
/// cuadrilla. Compartida entre regiones: `cantidad`/`costo`/`importe` no
/// viven aquí, varían por región y cuelgan de `cuadrilla_costo_detalle` (ver
/// diccionario de datos). Borrado lógico: al borrar un renglón se borran en
/// cascada sus `cuadrilla_costo_detalle` en todas las valuaciones.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "cuadrilla_detalle")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    /// FK → `cuadrilla.insumo_id`.
    pub cuadrilla_insumo_id: String,
    /// FK → `insumo.id` — debe tener extensión `categoria_fasar` o `herramienta`.
    pub detalle_insumo_id: String,
    pub tipo: TipoCuadrillaDetalle,
    pub orden: i32,
    pub deleted: bool,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
    pub deleted_at: Option<String>,
    pub deleted_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::cuadrilla::Entity",
        from = "Column::CuadrillaInsumoId",
        to = "super::cuadrilla::Column::InsumoId"
    )]
    Cuadrilla,
    #[sea_orm(
        belongs_to = "super::insumo::Entity",
        from = "Column::DetalleInsumoId",
        to = "super::insumo::Column::Id"
    )]
    Insumo,
    #[sea_orm(has_many = "super::cuadrilla_costo_detalle::Entity")]
    CuadrillaCostoDetalle,
}

impl Related<super::cuadrilla::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Cuadrilla.def()
    }
}

impl Related<super::insumo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Insumo.def()
    }
}

impl Related<super::cuadrilla_costo_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CuadrillaCostoDetalle.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

/// Denormalizado de qué extensión resuelve `detalle_insumo_id` — permite
/// separar `cuadrilla_costo.sub_total_mano_obra` de `sub_total_herramienta`
/// sin join.
#[derive(Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum TipoCuadrillaDetalle {
    CategoriaFasar,
    EquipoHerramienta,
}
