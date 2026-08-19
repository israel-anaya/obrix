use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Valuación regional de un `equipo_costo_horario` — los caches de variable
/// y el total que antes vivían en la extensión 1:1. Sin vigencias: el
/// consumo se deriva de `precio_material` y la operación de
/// `salario_categoria_fasar` / `cuadrilla_costo`, que ya historizan por
/// fecha. `region_id` nullable — todo equipo nace con la fila nacional
/// (`region_id = NULL`); el resto de regiones del catálogo se materializa
/// como cache al mutar la receta o al sincronizar. A diferencia de
/// `precio_material`/`salario_categoria_fasar` (histórico append-only), aquí
/// sí hay `deleted`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "equipo_costo_horario_costo")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    /// FK → `equipo_costo_horario.insumo_id`.
    pub equipo_costo_horario_id: String,
    pub region_id: Option<String>,
    pub subtotal_consumo: Decimal,
    pub subtotal_operacion: Decimal,
    pub cargo_variable_hora: Decimal,
    /// Cache = `equipo_costo_horario.cf_cargo_fijo_hora` + cargo_variable_hora.
    pub costo_total: Decimal,
    /// Última vez que se recalcularon los costos desde los insumos vigentes
    /// (el ⟳ de Costo por región). No es `updated_at`: editar clave/descripción
    /// o la receta no cuenta como sincronización.
    pub sincronizado_en: Option<String>,
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
        belongs_to = "super::equipo_costo_horario::Entity",
        from = "Column::EquipoCostoHorarioId",
        to = "super::equipo_costo_horario::Column::InsumoId"
    )]
    EquipoCostoHorario,
    #[sea_orm(
        belongs_to = "super::region::Entity",
        from = "Column::RegionId",
        to = "super::region::Column::Id"
    )]
    Region,
    #[sea_orm(has_many = "super::equipo_costo_horario_costo_detalle::Entity")]
    EquipoCostoHorarioCostoDetalle,
}

impl Related<super::equipo_costo_horario::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EquipoCostoHorario.def()
    }
}

impl Related<super::region::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Region.def()
    }
}

impl Related<super::equipo_costo_horario_costo_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EquipoCostoHorarioCostoDetalle.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
