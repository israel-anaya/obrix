use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Composición **plana, no recursiva** de un `equipo_costo_horario` —
/// cada fila es un consumo (`detalle_insumo_id` con extensión `material`) o
/// una operación (`detalle_insumo_id` con extensión `categoria_fasar` o
/// `cuadrilla`), nunca otro equipo. Compartida entre regiones: `cantidad`
/// es de la receta (igual en todas); `costo`/`importe` varían por región y
/// cuelgan de `equipo_costo_horario_costo_detalle`. `naturaleza` clasifica
/// el consumo para `perfil_inactividad_equipo` y, en operación, distingue
/// categoría FASAR de cuadrilla sin join. Borrado lógico: al borrar
/// un renglón se borran en cascada sus `equipo_costo_horario_costo_detalle`
/// en todas las valuaciones.
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
    /// Obligatorio, y sus valores dependen de `tipo`: en consumo el
    /// desglose CMIC (lo captura el analista); en operación, `categoria` o
    /// `cuadrilla` (lo deriva el servicio de la extensión del insumo).
    pub naturaleza: Option<NaturalezaEquipoCostoHorarioDetalle>,
    pub orden: i32,
    /// Cantidad consumida (o jornales/horas de operador) por hora de
    /// máquina. No varía por región.
    pub cantidad: Decimal,
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
    #[sea_orm(has_many = "super::equipo_costo_horario_costo_detalle::Entity")]
    EquipoCostoHorarioCostoDetalle,
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

impl Related<super::equipo_costo_horario_costo_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EquipoCostoHorarioCostoDetalle.def()
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

/// Desglose CMIC/RLOPSRM de un renglón de consumo y, en operación, qué
/// extensión resuelve el insumo — ver diccionario de datos. Cada `tipo`
/// admite solo su propio subconjunto (ver
/// `NaturalezaEquipoCostoHorarioDetalle::valida_para`).
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
    /// Operación con extensión `categoria_fasar`.
    Categoria,
    /// Operación con extensión `cuadrilla`.
    Cuadrilla,
}

impl NaturalezaEquipoCostoHorarioDetalle {
    /// Si esta naturaleza pertenece al subconjunto que admite ese `tipo`.
    pub fn valida_para(&self, tipo: &TipoEquipoCostoHorarioDetalle) -> bool {
        let de_operacion = matches!(self, Self::Categoria | Self::Cuadrilla);
        match tipo {
            TipoEquipoCostoHorarioDetalle::Consumo => !de_operacion,
            TipoEquipoCostoHorarioDetalle::Operacion => de_operacion,
        }
    }
}
