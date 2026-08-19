use axum::extract::{FromRef, FromRequestParts};
use axum::http::{request::Parts, StatusCode};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

pub const COOKIE_NAME: &str = "admin_session";

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

/// Login propio del panel — desacoplado de GoTrue a propósito: GoTrue es
/// identidad de *clientes*, esto es acceso del operador del negocio.
pub fn crear_cookie_sesion(secret: &str, username: &str) -> Cookie<'static> {
    let exp = (Utc::now() + Duration::hours(8)).timestamp() as usize;
    let claims = Claims {
        sub: username.to_string(),
        exp,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("firmar el JWT de sesión no debería fallar");

    let mut cookie = Cookie::new(COOKIE_NAME, token);
    cookie.set_path("/");
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_max_age(time::Duration::hours(8));
    cookie
}

pub fn cookie_logout() -> Cookie<'static> {
    let mut cookie = Cookie::new(COOKIE_NAME, "");
    cookie.set_path("/");
    cookie.set_max_age(time::Duration::seconds(0));
    cookie
}

/// Extractor que exige una sesión de admin válida — úsalo como argumento
/// de cualquier handler que deba estar protegido.
pub struct SesionAdmin {
    pub username: String,
}

impl<S> FromRequestParts<S> for SesionAdmin
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);
        let jar = CookieJar::from_request_parts(parts, state)
            .await
            .expect("CookieJar no debería fallar al extraerse");
        let token = jar.get(COOKIE_NAME).ok_or(StatusCode::UNAUTHORIZED)?;
        let data = decode::<Claims>(
            token.value(),
            &DecodingKey::from_secret(app_state.admin_session_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

        Ok(SesionAdmin {
            username: data.claims.sub,
        })
    }
}
