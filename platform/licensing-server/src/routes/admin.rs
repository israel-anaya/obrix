use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{Duration, Utc};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::Deserialize;
use uuid::Uuid;

use crate::entities::plan::Plan;
use crate::entities::suscripcion::{self, EstadoSuscripcion};
use crate::routes::AppState;

/// Lista todas las suscripciones — para el panel de administración
/// (`admin-panel`, servicio aparte). No pagina todavía: el volumen de
/// organizaciones no lo justifica en esta etapa.
pub async fn listar_suscripciones(
    State(state): State<AppState>,
) -> Result<Json<Vec<suscripcion::Model>>, StatusCode> {
    let filas = suscripcion::Entity::find()
        .all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(filas))
}

#[derive(Deserialize)]
pub struct ActivarSuscripcionRequest {
    pub organizacion_id: String,
    pub plan: Plan,
}

/// Mockup del webhook `checkout.session.completed` de Stripe — activa o
/// cambia el plan de una organización sin cobrar nada todavía. Cuando se
/// conecte Stripe de verdad, esto se reemplaza por el handler del webhook;
/// la forma de la tabla `suscripcion` no cambia.
pub async fn activar_suscripcion(
    State(state): State<AppState>,
    Json(payload): Json<ActivarSuscripcionRequest>,
) -> Result<Json<suscripcion::Model>, StatusCode> {
    let existente = suscripcion::Entity::find()
        .filter(suscripcion::Column::OrganizacionId.eq(payload.organizacion_id.clone()))
        .one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let ahora = Utc::now().to_rfc3339();
    let renovacion = (Utc::now() + Duration::days(30)).to_rfc3339();

    let modelo = match existente {
        Some(fila) => {
            let mut activo: suscripcion::ActiveModel = fila.into();
            activo.plan = Set(payload.plan);
            activo.estado = Set(EstadoSuscripcion::Activa);
            activo.fecha_renovacion = Set(Some(renovacion));
            activo.updated_at = Set(Some(ahora));
            activo
                .update(&state.db)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        }
        None => {
            let nuevo = suscripcion::ActiveModel {
                id: Set(Uuid::new_v4().to_string()),
                organizacion_id: Set(payload.organizacion_id),
                plan: Set(payload.plan),
                estado: Set(EstadoSuscripcion::Activa),
                stripe_customer_id: Set(None),
                stripe_subscription_id: Set(None),
                fecha_inicio: Set(ahora.clone()),
                fecha_renovacion: Set(Some(renovacion)),
                created_at: Set(ahora),
                updated_at: Set(None),
            };
            nuevo
                .insert(&state.db)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        }
    };

    Ok(Json(modelo))
}

/// Mockup del webhook `customer.subscription.deleted` de Stripe.
pub async fn cancelar_suscripcion(
    State(state): State<AppState>,
    Path(organizacion_id): Path<String>,
) -> Result<Json<suscripcion::Model>, StatusCode> {
    let fila = suscripcion::Entity::find()
        .filter(suscripcion::Column::OrganizacionId.eq(organizacion_id))
        .one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let mut activo: suscripcion::ActiveModel = fila.into();
    activo.estado = Set(EstadoSuscripcion::Cancelada);
    activo.updated_at = Set(Some(Utc::now().to_rfc3339()));

    let modelo = activo
        .update(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(modelo))
}
