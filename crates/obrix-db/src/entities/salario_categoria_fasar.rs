use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Historial de salario+FSR de `categoria_fasar` — nunca se sobrescribe,
/// cada vigencia nueva es una fila. Mismo patrón que `precio_material`:
/// llave `(insumo_id, region_id)`, `region_id` nullable = nacional.
///
/// `factor_salario_real` (el número) y `salario_real_diario` no los deriva
/// el backend — el cálculo del FSR vive en el cliente
/// (`apps/desktop/src/lib/formulaEngine.ts`/`modeloCalculo.ts`); el cliente
/// los calcula y los envía al registrar una vigencia, igual que
/// `precio_material.precio` es "lo que se entró".
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "salario_categoria_fasar")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    /// FK → `categoria_fasar.insumo_id`.
    pub insumo_id: String,
    pub region_id: Option<String>,
    pub salario_base_diario: Decimal,
    pub factor_salario_real_id: String,
    pub factor_salario_real: Decimal,
    pub salario_real_diario: Decimal,
    pub fecha_vigencia_desde: String,
    pub fecha_vigencia_hasta: Option<String>,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::categoria_fasar::Entity",
        from = "Column::InsumoId",
        to = "super::categoria_fasar::Column::InsumoId"
    )]
    CategoriaFasar,
    #[sea_orm(
        belongs_to = "super::region::Entity",
        from = "Column::RegionId",
        to = "super::region::Column::Id"
    )]
    Region,
    #[sea_orm(
        belongs_to = "super::factor_salario_real::Entity",
        from = "Column::FactorSalarioRealId",
        to = "super::factor_salario_real::Column::Id"
    )]
    FactorSalarioReal,
}

impl Related<super::categoria_fasar::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CategoriaFasar.def()
    }
}

impl Related<super::region::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Region.def()
    }
}

impl Related<super::factor_salario_real::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::FactorSalarioReal.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
