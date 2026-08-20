use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Valuación regional de un `basico_auxiliar`. `region_id` nullable — todo
/// auxiliar nace con la fila nacional. Los subtotales y `costo_total` son
/// cache de receta × precios/costos de **esta** zona.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "basico_auxiliar_costo")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub basico_auxiliar_id: String,
    pub region_id: Option<String>,
    pub sub_total_material: Decimal,
    pub sub_total_mano_obra: Decimal,
    pub sub_total_equipo: Decimal,
    pub sub_total_basico_auxiliar: Decimal,
    pub costo_total: Decimal,
    /// Foto de la `fecha_precio` más reciente de esta valuación.
    pub fecha_costo: Option<String>,
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
        belongs_to = "super::basico_auxiliar::Entity",
        from = "Column::BasicoAuxiliarId",
        to = "super::basico_auxiliar::Column::InsumoId"
    )]
    BasicoAuxiliar,
    #[sea_orm(
        belongs_to = "super::region::Entity",
        from = "Column::RegionId",
        to = "super::region::Column::Id"
    )]
    Region,
    #[sea_orm(has_many = "super::basico_auxiliar_costo_detalle::Entity")]
    BasicoAuxiliarCostoDetalle,
}

impl Related<super::basico_auxiliar::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::BasicoAuxiliar.def()
    }
}

impl Related<super::region::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Region.def()
    }
}

impl Related<super::basico_auxiliar_costo_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::BasicoAuxiliarCostoDetalle.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
