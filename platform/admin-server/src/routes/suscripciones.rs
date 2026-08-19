use axum::{extract::{Path, State}, http::StatusCode, Json};
use serde_json::Value;

use crate::auth::SesionAdmin;
use crate::licensing;
use crate::state::AppState;

pub async fn listar(
    _sesion: SesionAdmin,
    State(state): State<AppState>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    licensing::listar_suscripciones(&state)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

pub async fn activar(
    _sesion: SesionAdmin,
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    licensing::activar_suscripcion(&state, &payload)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

pub async fn cancelar(
    _sesion: SesionAdmin,
    State(state): State<AppState>,
    Path(organizacion_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    licensing::cancelar_suscripcion(&state, &organizacion_id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_GATEWAY)
}
