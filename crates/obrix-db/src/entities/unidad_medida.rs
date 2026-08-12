use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "unidad_medida")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub simbolo: String,
    pub simbolo_impresion: String,
    pub clave_sat: Option<String>,
    pub descripcion: String,
    pub tipo_magnitud: TipoMagnitud,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub created_by: String,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum TipoMagnitud {
    Longitud,
    Area,
    Volumen,
    Masa,
    Pieza,
    Tiempo,
    Otro,
}
