use serde_json::Value;

use crate::state::AppState;

pub async fn listar_suscripciones(state: &AppState) -> Result<Vec<Value>, reqwest::Error> {
    state
        .http
        .get(format!("{}/admin/suscripciones", state.licensing_server_url))
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<Value>>()
        .await
}

pub async fn activar_suscripcion(state: &AppState, payload: &Value) -> Result<Value, reqwest::Error> {
    state
        .http
        .post(format!("{}/admin/suscripciones", state.licensing_server_url))
        .json(payload)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}

pub async fn cancelar_suscripcion(
    state: &AppState,
    organizacion_id: &str,
) -> Result<Value, reqwest::Error> {
    state
        .http
        .post(format!(
            "{}/admin/suscripciones/{organizacion_id}/cancelar",
            state.licensing_server_url
        ))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}
