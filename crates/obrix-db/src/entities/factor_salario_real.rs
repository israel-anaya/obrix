use sea_orm::entity::prelude::*;

/// Catalogo de configuraciones de Factor de Salario Real (FSR) — ver
/// `factor_salario_real` en el diccionario de datos. Cada renglon es una
/// configuracion reutilizable entre insumos de mano de obra (ej. "FSR
/// construccion — riesgo clase V, 2026"), no un dato por trabajador.
///
/// `modelo_calculo_json` es `VariableCalculo[]` serializado (ver
/// `apps/desktop/src/lib/formulaEngine.ts` y `modeloCalculo.ts`) — CÓMO se
/// calcula el FSR de este renglón, editable con el ícono "Editar modelo de
/// cálculo". `parametros_json` trae los valores capturados para las
/// variables de entrada que ese modelo declara — QUÉ se captura.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "factor_salario_real")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub organizacion_id: String,
    pub nombre: String,
    /// `None` = nacional (sin región específica).
    pub region_id: Option<String>,
    /// `VariableCalculo[]` serializado — define CÓMO se calcula.
    pub modelo_calculo_json: String,
    /// Valores de las variables de entrada que ese modelo declara.
    pub parametros_json: String,
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
        belongs_to = "super::organizacion::Entity",
        from = "Column::OrganizacionId",
        to = "super::organizacion::Column::Id"
    )]
    Organizacion,
    #[sea_orm(
        belongs_to = "super::region::Entity",
        from = "Column::RegionId",
        to = "super::region::Column::Id"
    )]
    Region,
}

impl Related<super::organizacion::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Organizacion.def()
    }
}

impl Related<super::region::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Region.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
