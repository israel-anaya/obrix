use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;

use crate::routes::AppState;

#[derive(Deserialize)]
pub struct BienvenidaRequest {
    pub correo: String,
    pub nombre: String,
}

/// Llamado por el desktop justo después de un registro exitoso en GoTrue.
/// Best-effort: el desktop ignora el resultado, así que un fallo aquí solo
/// se registra en el log, nunca bloquea el alta de la cuenta.
pub async fn enviar_bienvenida(
    State(state): State<AppState>,
    Json(body): Json<BienvenidaRequest>,
) -> StatusCode {
    match state.mailer.enviar_bienvenida(&body.correo, &body.nombre).await {
        Ok(()) => StatusCode::OK,
        Err(e) => {
            tracing::warn!("no se pudo enviar correo de bienvenida a {}: {e}", body.correo);
            StatusCode::BAD_GATEWAY
        }
    }
}
