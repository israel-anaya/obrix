use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Un renglón de receta valuado **en una zona**. `cantidad` y `rendimiento`
/// son capturables e inversos entre sí (`rendimiento = 1 / cantidad`,
/// `cantidad = 1 / rendimiento`; si uno es 0 el otro también queda en 0) —
/// dos formas de capturar el mismo rendimiento de esa región, mantenidas en
/// sincronía por el servicio. `costo` / `importe` los deriva el recálculo.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "basico_auxiliar_costo_detalle")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub basico_auxiliar_costo_id: String,
    pub basico_auxiliar_componente_id: String,
    pub cantidad: Decimal,
    pub rendimiento: Decimal,
    pub costo: Decimal,
    pub importe: Decimal,
    pub fecha_precio: Option<String>,
    pub usa_costo_nacional: bool,
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
        belongs_to = "super::basico_auxiliar_costo::Entity",
        from = "Column::BasicoAuxiliarCostoId",
        to = "super::basico_auxiliar_costo::Column::Id"
    )]
    BasicoAuxiliarCosto,
    #[sea_orm(
        belongs_to = "super::basico_auxiliar_componente::Entity",
        from = "Column::BasicoAuxiliarComponenteId",
        to = "super::basico_auxiliar_componente::Column::Id"
    )]
    BasicoAuxiliarComponente,
}

impl Related<super::basico_auxiliar_costo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::BasicoAuxiliarCosto.def()
    }
}

impl Related<super::basico_auxiliar_componente::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::BasicoAuxiliarComponente.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
