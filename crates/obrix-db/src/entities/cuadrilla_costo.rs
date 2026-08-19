use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Valuación regional de una `cuadrilla` — los tres caches que antes vivían
/// en la extensión 1:1 (`sub_total_mano_obra`, `sub_total_herramienta`,
/// `costo_total`). Sin vigencias: el costo de la cuadrilla se deriva de
/// `salario_categoria_fasar`, que ya historiza por fecha (ver diccionario de
/// datos). `region_id` nullable — toda cuadrilla nace con la fila nacional
/// (`region_id = NULL`); el resto de regiones del catálogo se materializa como
/// cache al mutar la receta o al sincronizar. A diferencia de
/// `precio_material`/`salario_categoria_fasar` (histórico append-only), aquí
/// sí hay `deleted`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "cuadrilla_costo")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    /// FK → `cuadrilla.insumo_id`.
    pub cuadrilla_id: String,
    pub region_id: Option<String>,
    pub sub_total_mano_obra: Decimal,
    pub sub_total_herramienta: Decimal,
    pub costo_total: Decimal,
    /// Foto de la `fecha_vigencia_desde` más reciente entre los salarios que
    /// respaldan esta valuación (`cuadrilla_costo_detalle.fecha_precio` de
    /// mano de obra; herramienta no aporta fecha). No es una vigencia de la
    /// valuación: es el dato que necesita quien consume el costo para saber
    /// qué tan fresco es. `None` si ningún integrante tiene salario.
    pub fecha_costo: Option<String>,
    /// Última vez que se recalcularon los costos desde los insumos vigentes
    /// (el ⟳ de Costo por región). No es `updated_at`: editar clave/descripción o
    /// la receta no cuenta como sincronización.
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
        belongs_to = "super::cuadrilla::Entity",
        from = "Column::CuadrillaId",
        to = "super::cuadrilla::Column::InsumoId"
    )]
    Cuadrilla,
    #[sea_orm(
        belongs_to = "super::region::Entity",
        from = "Column::RegionId",
        to = "super::region::Column::Id"
    )]
    Region,
    #[sea_orm(has_many = "super::cuadrilla_costo_detalle::Entity")]
    CuadrillaCostoDetalle,
}

impl Related<super::cuadrilla::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Cuadrilla.def()
    }
}

impl Related<super::region::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Region.def()
    }
}

impl Related<super::cuadrilla_costo_detalle::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CuadrillaCostoDetalle.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
