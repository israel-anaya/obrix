//! Sesión de usuario contra GoTrue (ver `platform/docker-compose.yml`).
//! `$HOME/.obrix/auth.json` guarda `access_token`/`refresh_token`; la
//! identidad (`AccountInfo`) nunca se persiste — se re-deriva del `user`
//! que devuelve GoTrue en cada login/registro/refresh, así que siempre
//! refleja el estado real de la cuenta, no una copia local que pueda
//! quedar desactualizada.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub correo: String,
    pub nombre: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ArchivoAuth {
    access_token: String,
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
struct GoTrueUser {
    email: Option<String>,
    #[serde(default)]
    user_metadata: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct GoTrueSesion {
    access_token: String,
    refresh_token: String,
    user: GoTrueUser,
}

#[derive(Debug, Deserialize)]
struct GoTrueError {
    #[serde(alias = "error_description", alias = "msg")]
    mensaje: Option<String>,
}

/// URL base de GoTrue — `platform/docker-compose.yml` lo expone en
/// `:9999` en local. Configurable por si el desktop apunta a otro entorno
/// (staging, producción) sin recompilar.
fn auth_url() -> String {
    std::env::var("OBRIX_AUTH_URL").unwrap_or_else(|_| "http://localhost:9999".to_string())
}

/// `platform/docker-compose.yml` lo expone en `:8081` en local.
fn licensing_url() -> String {
    std::env::var("OBRIX_LICENSING_URL").unwrap_or_else(|_| "http://localhost:8081".to_string())
}

/// Best-effort: si el correo de bienvenida falla (SMTP caído, red, etc.) no
/// debe bloquear ni fallar el registro de la cuenta.
async fn enviar_bienvenida_best_effort(correo: &str, nombre: &str) {
    let cliente = reqwest::Client::new();
    let _ = cliente
        .post(format!("{}/notificaciones/bienvenida", licensing_url()))
        .json(&serde_json::json!({ "correo": correo, "nombre": nombre }))
        .send()
        .await;
}

fn auth_json_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "no se pudo resolver el directorio home".to_string())?;
    Ok(home.join(".obrix").join("auth.json"))
}

fn cuenta_desde_usuario(user: &GoTrueUser) -> AccountInfo {
    let correo = user.email.clone().unwrap_or_default();
    let nombre = user
        .user_metadata
        .get("nombre")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| correo.split('@').next().unwrap_or(&correo).to_string());
    AccountInfo { correo, nombre }
}

fn guardar_tokens(sesion: &GoTrueSesion) -> Result<(), String> {
    let archivo = ArchivoAuth {
        access_token: sesion.access_token.clone(),
        refresh_token: sesion.refresh_token.clone(),
    };
    let path = auth_json_path()?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let contenido = serde_json::to_string_pretty(&archivo).map_err(|e| e.to_string())?;
    std::fs::write(&path, contenido).map_err(|e| e.to_string())
}

async fn extraer_error(respuesta: reqwest::Response) -> String {
    let status = respuesta.status();
    match respuesta.json::<GoTrueError>().await {
        Ok(err) => err.mensaje.unwrap_or_else(|| status.to_string()),
        Err(_) => status.to_string(),
    }
}

/// Login real contra GoTrue (email + password).
pub async fn iniciar_sesion(correo: &str, password: &str) -> Result<AccountInfo, String> {
    let cliente = reqwest::Client::new();
    let respuesta = cliente
        .post(format!("{}/token?grant_type=password", auth_url()))
        .json(&serde_json::json!({ "email": correo, "password": password }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !respuesta.status().is_success() {
        return Err(extraer_error(respuesta).await);
    }

    let sesion: GoTrueSesion = respuesta.json().await.map_err(|e| e.to_string())?;
    let cuenta = cuenta_desde_usuario(&sesion.user);
    guardar_tokens(&sesion)?;
    Ok(cuenta)
}

/// Alta de cuenta nueva. Con `GOTRUE_MAILER_AUTOCONFIRM` activo (como en
/// dev) la sesión queda iniciada de inmediato; en un entorno con
/// verificación de correo real, GoTrue no devuelve tokens todavía y hay
/// que confirmar el correo antes de poder iniciar sesión.
pub async fn registrar_cuenta(correo: &str, nombre: &str, password: &str) -> Result<AccountInfo, String> {
    let cliente = reqwest::Client::new();
    let respuesta = cliente
        .post(format!("{}/signup", auth_url()))
        .json(&serde_json::json!({
            "email": correo,
            "password": password,
            "data": { "nombre": nombre },
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !respuesta.status().is_success() {
        return Err(extraer_error(respuesta).await);
    }

    enviar_bienvenida_best_effort(correo, nombre).await;

    let sesion: GoTrueSesion = respuesta.json().await.map_err(|_| {
        "Cuenta creada — confirma tu correo antes de iniciar sesión".to_string()
    })?;
    let cuenta = cuenta_desde_usuario(&sesion.user);
    guardar_tokens(&sesion)?;
    Ok(cuenta)
}

/// Llamado al arrancar la app: si hay tokens guardados, los refresca
/// contra GoTrue — valida que la sesión siga viva y trae la identidad al
/// día en el mismo viaje. `Ok(None)` si no hay tokens o el refresh falla
/// (sesión expirada o revocada); el frontend debe mostrar el login. GoTrue
/// rota el `refresh_token` en cada uso, por eso se reemplaza el archivo
/// completo con la respuesta, nunca solo el `access_token`.
pub async fn sesion_actual() -> Result<Option<AccountInfo>, String> {
    let path = auth_json_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let contenido = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let archivo: ArchivoAuth = match serde_json::from_str(&contenido) {
        Ok(a) => a,
        Err(_) => return Ok(None),
    };

    let cliente = reqwest::Client::new();
    let respuesta = cliente
        .post(format!("{}/token?grant_type=refresh_token", auth_url()))
        .json(&serde_json::json!({ "refresh_token": archivo.refresh_token }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !respuesta.status().is_success() {
        let _ = std::fs::remove_file(&path);
        return Ok(None);
    }

    let sesion: GoTrueSesion = respuesta.json().await.map_err(|e| e.to_string())?;
    let cuenta = cuenta_desde_usuario(&sesion.user);
    guardar_tokens(&sesion)?;
    Ok(Some(cuenta))
}

/// Revoca el `access_token` en GoTrue (best-effort — si la red falla, de
/// todos modos se borra la sesión local) y borra `auth.json`.
pub async fn cerrar_sesion() -> Result<(), String> {
    let path = auth_json_path()?;
    if let Ok(contenido) = std::fs::read_to_string(&path) {
        if let Ok(archivo) = serde_json::from_str::<ArchivoAuth>(&contenido) {
            let cliente = reqwest::Client::new();
            let _ = cliente
                .post(format!("{}/logout", auth_url()))
                .bearer_auth(&archivo.access_token)
                .send()
                .await;
        }
    }
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
