use sea_orm::entity::prelude::*;

/// Receta de **primer nivel** de un `basico_auxiliar`, compartida entre
/// regiones. `cantidad` / `costo` / `importe` no viven aquí — el rendimiento
/// cambia según la zona y cuelga de `basico_auxiliar_costo_detalle`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "basico_auxiliar_componente")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub basico_auxiliar_id: String,
    pub componente_insumo_id: String,
    pub tipo: TipoBasicoAuxiliarComponente,
    pub naturaleza: NaturalezaBasicoAuxiliarComponente,
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
        belongs_to = "super::basico_auxiliar::Entity",
        from = "Column::BasicoAuxiliarId",
        to = "super::basico_auxiliar::Column::InsumoId"
    )]
    BasicoAuxiliar,
    #[sea_orm(
        belongs_to = "super::insumo::Entity",
        from = "Column::ComponenteInsumoId",
        to = "super::insumo::Column::Id"
    )]
    Insumo,
    #[sea_orm(has_many = "super::basico_auxiliar_costo_detalle::Entity")]
    BasicoAuxiliarCostoDetalle,
}

impl Related<super::basico_auxiliar::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::BasicoAuxiliar.def()
    }
}

impl Related<super::insumo::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Insumo.def()
    }
}

impl Related<super::basico_auxiliar_costo_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::BasicoAuxiliarCostoDetalle.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

/// Denormalizado de `insumo.tipo` del componente.
#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize,
)]
#[sea_orm(
    rs_type = "String",
    db_type = "String(StringLen::None)",
    rename_all = "snake_case"
)]
#[serde(rename_all = "snake_case")]
pub enum TipoBasicoAuxiliarComponente {
    Material,
    ManoObra,
    EquipoHerramienta,
    BasicoAuxiliar,
}

/// Denormalizado de la extensión que resuelve `componente_insumo_id`.
#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize,
)]
#[sea_orm(
    rs_type = "String",
    db_type = "String(StringLen::None)",
    rename_all = "snake_case"
)]
#[serde(rename_all = "snake_case")]
pub enum NaturalezaBasicoAuxiliarComponente {
    Material,
    Categoria,
    Cuadrilla,
    CostoHorario,
    Rentado,
    BasicoAuxiliar,
}

impl NaturalezaBasicoAuxiliarComponente {
    pub fn valida_para(&self, tipo: &TipoBasicoAuxiliarComponente) -> bool {
        matches!(
            (tipo, self),
            (
                TipoBasicoAuxiliarComponente::Material,
                NaturalezaBasicoAuxiliarComponente::Material
            ) | (
                TipoBasicoAuxiliarComponente::ManoObra,
                NaturalezaBasicoAuxiliarComponente::Categoria
                    | NaturalezaBasicoAuxiliarComponente::Cuadrilla
            ) | (
                TipoBasicoAuxiliarComponente::EquipoHerramienta,
                NaturalezaBasicoAuxiliarComponente::CostoHorario
                    | NaturalezaBasicoAuxiliarComponente::Rentado
            ) | (
                TipoBasicoAuxiliarComponente::BasicoAuxiliar,
                NaturalezaBasicoAuxiliarComponente::BasicoAuxiliar
            )
        )
    }
}
