use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Extensión 1:1 de `insumo` cuando `insumo.tipo = equipo_herramienta` y se
/// trata de equipo **propio** costado por depreciación/consumo (a diferencia
/// de `herramienta`, que no calcula depreciación, y `equipo_rentado`, que es
/// de terceros) — metodología estándar SCT/CMIC: cargos fijos (existen
/// aunque la máquina no trabaje, calculados sobre `cf_valor_maquina`). La
/// receta de cargos variables vive en `equipo_costo_horario_detalle`; la
/// valuación por región vive en `equipo_costo_horario_costo` /
/// `equipo_costo_horario_costo_detalle`. Todos los campos `cf_*` salvo los
/// marcados como cache son captura directa del usuario; los de cache se
/// recalculan en `EquipoCostoHorarioService::calcular_cargos_fijos` cada vez
/// que cualquiera de los campos de captura cambia. Sin `region_id` ni
/// caches de variable/total: un `region_id` en la extensión 1:1 dejaría una
/// sola región por insumo. Sin columnas de auditoría propias: comparte el
/// ciclo de vida de su `insumo` (mismo patrón que `material`/`cuadrilla`).
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "equipo_costo_horario")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub insumo_id: String,
    /// Precio de la máquina nueva, todo incluido (Cm).
    pub cf_costo_maquina: Decimal,
    /// Valor de las llantas incluido en `cf_costo_maquina` (Pn), default 0.
    pub cf_valor_llantas: Decimal,
    /// Valor de piezas especiales incluido en `cf_costo_maquina` (Pa), default 0.
    pub cf_valor_piezas_especiales: Decimal,
    /// Cache = cf_costo_maquina − cf_valor_llantas − cf_valor_piezas_especiales (Vm).
    pub cf_valor_maquina: Decimal,
    /// % de valor de rescate al final de su vida económica (r).
    pub cf_valor_rescate_porcentaje: Decimal,
    /// Cache = cf_valor_maquina × cf_valor_rescate_porcentaje / 100 (Vr).
    pub cf_valor_rescate: Decimal,
    pub cf_vida_economica_anios: Decimal,
    /// Horas efectivas de uso al año (Hea), para prorratear cargos fijos.
    pub cf_horas_uso_anual: Decimal,
    /// Cache = cf_vida_economica_anios × cf_horas_uso_anual (Ve).
    pub cf_vida_util_horas: Decimal,
    /// Costo de capital/oportunidad de la inversión (i).
    pub cf_tasa_interes_anual_porcentaje: Decimal,
    pub cf_tasa_seguros_anual_porcentaje: Decimal,
    /// % de la depreciación que representa el cargo de mantenimiento (Ko).
    pub cf_mantenimiento_porcentaje: Decimal,
    /// Cache = (cf_valor_maquina − cf_valor_rescate) / cf_vida_util_horas (D).
    pub cf_depreciacion_hora: Decimal,
    /// Cache = (Vm + Vr) × i/100 / (2 × Hea) (Im).
    pub cf_inversion_hora: Decimal,
    /// Cache = (Vm + Vr) × s/100 / (2 × Hea) (Sm).
    pub cf_seguro_hora: Decimal,
    /// Cache = cf_mantenimiento_porcentaje/100 × cf_depreciacion_hora (Mn).
    pub cf_mantenimiento_hora: Decimal,
    /// Cache = cf_depreciacion_hora + cf_inversion_hora + cf_seguro_hora + cf_mantenimiento_hora.
    pub cf_cargo_fijo_hora: Decimal,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::insumo::Entity",
        from = "Column::InsumoId",
        to = "super::insumo::Column::Id"
    )]
    Insumo,
    #[sea_orm(has_many = "super::equipo_costo_horario_detalle::Entity")]
    EquipoCostoHorarioDetalle,
    #[sea_orm(has_many = "super::equipo_costo_horario_costo::Entity")]
    EquipoCostoHorarioCosto,
}

impl Related<super::insumo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Insumo.def()
    }
}

impl Related<super::equipo_costo_horario_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EquipoCostoHorarioDetalle.def()
    }
}

impl Related<super::equipo_costo_horario_costo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EquipoCostoHorarioCosto.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
