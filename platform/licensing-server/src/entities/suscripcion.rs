use sea_orm::entity::prelude::*;

use super::plan::Plan;

/// Suscripción vigente de una cuenta (identificada por su correo de GoTrue).
/// El plan es por cuenta individual, no por la `organizacion` de negocio del
/// desktop (esa es solo un concepto de organización de datos dentro de un
/// portafolio — ver `README.md`). La colaboración multi-cuenta bajo un
/// mismo plan Enterprise es un concepto aparte, todavía sin construir.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "suscripcion")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub correo: String,
    pub plan: Plan,
    pub estado: EstadoSuscripcion,
    /// Mockup: la integración real con Stripe aún no está implementada —
    /// estos campos solo documentan dónde colgará el id de Stripe cuando
    /// se conecte, sin que nada los llene todavía.
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    pub fecha_inicio: String,
    pub fecha_renovacion: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(
    Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, serde::Serialize, serde::Deserialize,
)]
#[sea_orm(
    rs_type = "String",
    db_type = "String(StringLen::None)",
    rename_all = "snake_case"
)]
#[serde(rename_all = "snake_case")]
pub enum EstadoSuscripcion {
    Activa,
    Cancelada,
    Vencida,
}
