mod auth;
mod suscripciones;
mod usuarios;

use axum::{
    routing::{get, post},
    Router,
};
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

pub fn router(state: AppState, frontend_dist: &str) -> Router {
    let index = format!("{frontend_dist}/index.html");
    let static_service = ServeDir::new(frontend_dist).fallback(ServeFile::new(index));

    Router::new()
        .route("/api/login", post(auth::login))
        .route("/api/logout", post(auth::logout))
        .route("/api/me", get(auth::me))
        .route(
            "/api/suscripciones",
            get(suscripciones::listar).post(suscripciones::activar),
        )
        .route(
            "/api/suscripciones/{correo}/cancelar",
            post(suscripciones::cancelar),
        )
        .route("/api/usuarios", get(usuarios::listar))
        .route("/api/usuarios/{usuario_id}/banear", post(usuarios::banear))
        .route(
            "/api/usuarios/{usuario_id}/desbanear",
            post(usuarios::desbanear),
        )
        .with_state(state)
        .fallback_service(static_service)
}
