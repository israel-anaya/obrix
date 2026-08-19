use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::state::AppState;

#[derive(Serialize)]
struct AdminClaims {
    role: String,
    exp: usize,
}

/// GoTrue autoriza su API `/admin/*` con un JWT propio firmado con
/// `GOTRUE_JWT_SECRET` cuyo claim `role` sea `service_role` — no es un
/// login, es el mismo secreto de firma que ya comparte con el resto del
/// stack. Vive solo en el servidor: nunca llega al navegador.
fn jwt_admin(secret: &str) -> String {
    let exp = (Utc::now() + Duration::minutes(5)).timestamp() as usize;
    let claims = AdminClaims {
        role: "service_role".to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("firmar el JWT admin de GoTrue no debería fallar")
}

#[derive(Deserialize, Serialize)]
pub struct UsuariosResponse {
    #[serde(default)]
    pub users: Vec<Value>,
}

pub async fn listar_usuarios(state: &AppState) -> Result<UsuariosResponse, reqwest::Error> {
    state
        .http
        .get(format!("{}/admin/users", state.gotrue_url))
        .bearer_auth(jwt_admin(&state.gotrue_jwt_secret))
        .send()
        .await?
        .error_for_status()?
        .json::<UsuariosResponse>()
        .await
}

pub async fn banear_usuario(state: &AppState, usuario_id: &str) -> Result<Value, reqwest::Error> {
    state
        .http
        .put(format!("{}/admin/users/{usuario_id}", state.gotrue_url))
        .bearer_auth(jwt_admin(&state.gotrue_jwt_secret))
        .json(&serde_json::json!({ "ban_duration": "876600h" }))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}

pub async fn desbanear_usuario(state: &AppState, usuario_id: &str) -> Result<Value, reqwest::Error> {
    state
        .http
        .put(format!("{}/admin/users/{usuario_id}", state.gotrue_url))
        .bearer_auth(jwt_admin(&state.gotrue_jwt_secret))
        .json(&serde_json::json!({ "ban_duration": "none" }))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}
