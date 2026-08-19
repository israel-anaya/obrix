use axum::{extract::State, http::StatusCode, Json};
use axum_extra::extract::cookie::CookieJar;
use serde::{Deserialize, Serialize};

use crate::auth::{cookie_logout, crear_cookie_sesion, SesionAdmin};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct MeResponse {
    pub username: String,
}

/// Compara contra ADMIN_USERNAME/ADMIN_PASSWORD (env vars) — sin hashing,
/// sin tabla de usuarios: es un solo operador humano, no una feature de
/// producto. Si el equipo crece, esto se reemplaza por algo real.
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(payload): Json<LoginRequest>,
) -> Result<CookieJar, StatusCode> {
    if payload.username != state.admin_username || payload.password != state.admin_password {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let cookie = crear_cookie_sesion(&state.admin_session_secret, &payload.username);
    Ok(jar.add(cookie))
}

pub async fn logout(jar: CookieJar) -> CookieJar {
    jar.add(cookie_logout())
}

pub async fn me(sesion: SesionAdmin) -> Json<MeResponse> {
    Json(MeResponse {
        username: sesion.username,
    })
}
