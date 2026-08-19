mod admin;
mod entitlements;
mod notificaciones;

use axum::{
    routing::{get, post},
    Router,
};
use sea_orm::DatabaseConnection;
use tower_http::cors::CorsLayer;

use crate::mail::Mailer;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub mailer: Mailer,
}

pub fn router(db: DatabaseConnection, mailer: Mailer) -> Router {
    let state = AppState { db, mailer };
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route(
            "/cuentas/{correo}/entitlements",
            get(entitlements::obtener_entitlements),
        )
        .route(
            "/admin/suscripciones",
            get(admin::listar_suscripciones).post(admin::activar_suscripcion),
        )
        .route(
            "/admin/suscripciones/{correo}/cancelar",
            post(admin::cancelar_suscripcion),
        )
        .route(
            "/notificaciones/bienvenida",
            post(notificaciones::enviar_bienvenida),
        )
        // El landing (apps/landing) llama a `/notificaciones/bienvenida` desde
        // el navegador tras el registro — necesita CORS abierto igual que GoTrue.
        .layer(CorsLayer::permissive())
        .with_state(state)
}
