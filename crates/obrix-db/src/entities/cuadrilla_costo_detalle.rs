use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Cache valuado de un renglón de receta (`cuadrilla_detalle`) **en una
/// valuación** (`cuadrilla_costo`) — `region_id` no se repite aquí, se
/// hereda de `cuadrilla_costo`. Toda valuación tiene exactamente un renglón
/// por cada `cuadrilla_detalle` de esa cuadrilla. No hay campos capturables:
/// `cantidad` vive en la receta; `costo` e `importe` los deriva el recálculo
/// del `cuadrilla_costo` padre (ver diccionario de datos).
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "cuadrilla_costo_detalle")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub cuadrilla_costo_id: String,
    pub cuadrilla_detalle_id: String,
    /// Si tipo = categoria_fasar: `salario_categoria_fasar.salario_real_diario`
    /// vigente de la región de `cuadrilla_costo`, o 0 si no hay salario
    /// vigente. Si tipo = equipo_herramienta: `cuadrilla_costo.sub_total_mano_obra`
    /// de esta misma valuación.
    pub costo: Decimal,
    pub importe: Decimal,
    /// Foto de `salario_categoria_fasar.fecha_vigencia_desde` al recalcular
    /// este renglón. Solo aplica a mano de obra (`categoria_fasar`); en
    /// herramienta queda `NULL` (es porcentaje sobre el subtotal de MO).
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
        belongs_to = "super::cuadrilla_costo::Entity",
        from = "Column::CuadrillaCostoId",
        to = "super::cuadrilla_costo::Column::Id"
    )]
    CuadrillaCosto,
    #[sea_orm(
        belongs_to = "super::cuadrilla_detalle::Entity",
        from = "Column::CuadrillaDetalleId",
        to = "super::cuadrilla_detalle::Column::Id"
    )]
    CuadrillaDetalle,
}

impl Related<super::cuadrilla_costo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CuadrillaCosto.def()
    }
}

impl Related<super::cuadrilla_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CuadrillaDetalle.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
