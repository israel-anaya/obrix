use axum::{extract::{Path, State}, http::StatusCode, Json};
use serde_json::Value;

use crate::auth::SesionAdmin;
use crate::gotrue;
use crate::state::AppState;

pub async fn listar(
    _sesion: SesionAdmin,
    State(state): State<AppState>,
) -> Result<Json<gotrue::UsuariosResponse>, StatusCode> {
    gotrue::listar_usuarios(&state)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

pub async fn banear(
    _sesion: SesionAdmin,
    State(state): State<AppState>,
    Path(usuario_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    gotrue::banear_usuario(&state, &usuario_id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

pub async fn desbanear(
    _sesion: SesionAdmin,
    State(state): State<AppState>,
    Path(usuario_id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    gotrue::desbanear_usuario(&state, &usuario_id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_GATEWAY)
}
