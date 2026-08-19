mod admin;
mod entitlements;

use axum::{
    routing::{get, post},
    Router,
};
use sea_orm::DatabaseConnection;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
}

pub fn router(db: DatabaseConnection) -> Router {
    let state = AppState { db };
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route(
            "/organizaciones/{organizacion_id}/entitlements",
            get(entitlements::obtener_entitlements),
        )
        .route(
            "/admin/suscripciones",
            get(admin::listar_suscripciones).post(admin::activar_suscripcion),
        )
        .route(
            "/admin/suscripciones/{organizacion_id}/cancelar",
            post(admin::cancelar_suscripcion),
        )
        .with_state(state)
}
