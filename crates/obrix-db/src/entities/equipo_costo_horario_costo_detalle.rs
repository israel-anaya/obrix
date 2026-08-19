use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Cache valuado de un renglón de receta (`equipo_costo_horario_detalle`)
/// **en una valuación** (`equipo_costo_horario_costo`) — `region_id` no se
/// repite aquí, se hereda de `equipo_costo_horario_costo`. Toda valuación
/// tiene exactamente un renglón por cada `equipo_costo_horario_detalle` de
/// ese equipo. No hay campos capturables: `cantidad` vive en la receta;
/// `costo` e `importe` los deriva el recálculo del
/// `equipo_costo_horario_costo` padre (ver diccionario de datos).
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "equipo_costo_horario_costo_detalle")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub equipo_costo_horario_costo_id: String,
    pub equipo_costo_horario_detalle_id: String,
    /// Si tipo = consumo: `precio_material.precio` vigente de la región
    /// (o nacional si falta; 0 si tampoco hay). Si tipo = operacion:
    /// salario vigente de esa región o `cuadrilla_costo.costo_total` de esa
    /// región (0 si falta).
    pub costo: Decimal,
    pub importe: Decimal,
    /// Foto de `precio_material.fecha_vigencia_desde` o
    /// `salario_categoria_fasar.fecha_vigencia_desde` al recalcular. NULL
    /// si el renglón quedó en 0.
    pub fecha_precio: Option<String>,
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
        belongs_to = "super::equipo_costo_horario_costo::Entity",
        from = "Column::EquipoCostoHorarioCostoId",
        to = "super::equipo_costo_horario_costo::Column::Id"
    )]
    EquipoCostoHorarioCosto,
    #[sea_orm(
        belongs_to = "super::equipo_costo_horario_detalle::Entity",
        from = "Column::EquipoCostoHorarioDetalleId",
        to = "super::equipo_costo_horario_detalle::Column::Id"
    )]
    EquipoCostoHorarioDetalle,
}

impl Related<super::equipo_costo_horario_costo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EquipoCostoHorarioCosto.def()
    }
}

impl Related<super::equipo_costo_horario_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EquipoCostoHorarioDetalle.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
