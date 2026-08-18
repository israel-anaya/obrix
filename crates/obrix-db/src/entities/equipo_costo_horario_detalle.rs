use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Composición **plana, no recursiva** de un `equipo_costo_horario` — cada
/// fila es un consumo (`detalle_insumo_id` con extensión `material`: diesel,
/// aceites, llantas, piezas especiales, otras fuentes) o una operación
/// (`detalle_insumo_id` con extensión `categoria_fasar` o `cuadrilla`: el
/// operador, con su cantidad en jornales u horas consumidos por hora de
/// máquina). `naturaleza` clasifica el consumo para
/// `perfil_inactividad_equipo`. `costo`/`importe` son cache: los recalcula
/// `EquipoCostoHorarioDetalleService::recalcular` cada vez que la
/// composición cambia (ver diccionario de datos).
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "equipo_costo_horario_detalle")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    /// FK → `equipo_costo_horario.insumo_id`.
    pub equipo_costo_horario_insumo_id: String,
    /// FK → `insumo.id` — debe tener extensión `material` (consumo) o
    /// `categoria_fasar`/`cuadrilla` (operación).
    pub detalle_insumo_id: String,
    pub tipo: TipoEquipoCostoHorarioDetalle,
    /// Obligatorio si `tipo = consumo`; `None` si `tipo = operacion`.
    pub naturaleza: Option<NaturalezaEquipoCostoHorarioDetalle>,
    pub orden: i32,
    /// Cantidad consumida (o jornales/horas de operador) por hora de máquina.
    pub cantidad: Decimal,
    pub costo: Decimal,
    pub importe: Decimal,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::equipo_costo_horario::Entity",
        from = "Column::EquipoCostoHorarioInsumoId",
        to = "super::equipo_costo_horario::Column::InsumoId"
    )]
    EquipoCostoHorario,
    #[sea_orm(
        belongs_to = "super::insumo::Entity",
        from = "Column::DetalleInsumoId",
        to = "super::insumo::Column::Id"
    )]
    Insumo,
}

impl Related<super::equipo_costo_horario::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EquipoCostoHorario.def()
    }
}

impl Related<super::insumo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Insumo.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

/// Denormalizado de qué extensión resuelve `detalle_insumo_id` — permite
/// separar consumo de operación sin join.
#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize,
)]
#[sea_orm(
    rs_type = "String",
    db_type = "String(StringLen::None)",
    rename_all = "snake_case"
)]
#[serde(rename_all = "snake_case")]
pub enum TipoEquipoCostoHorarioDetalle {
    Consumo,
    Operacion,
}

/// Desglose CMIC/RLOPSRM de un renglón de consumo — ver diccionario de datos.
#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize,
)]
#[sea_orm(
    rs_type = "String",
    db_type = "String(StringLen::None)",
    rename_all = "snake_case"
)]
#[serde(rename_all = "snake_case")]
pub enum NaturalezaEquipoCostoHorarioDetalle {
    Combustible,
    Lubricante,
    Llantas,
    PiezasEspeciales,
    OtrasFuentes,
}
