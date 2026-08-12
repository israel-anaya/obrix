//! Sesión de usuario, mock — la plataforma de autenticación real todavía no
//! existe. `$HOME/.obrix/auth.json` guarda solo tokens; `AccountInfo`
//! (correo, nombre) nunca se persiste: se deriva de los tokens vía
//! `login_mock`, que hoy siempre devuelve la misma identidad fija porque no
//! hay servidor contra el cual decodificarlos.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub correo: String,
    pub nombre: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ArchivoAuth {
    tokens: Tokens,
}

#[derive(Debug, Serialize, Deserialize)]
struct Tokens {
    id_token: String,
    access_token: String,
    account_id: String,
}

fn auth_json_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "no se pudo resolver el directorio home".to_string())?;
    Ok(home.join(".obrix").join("auth.json"))
}

/// No hay plataforma real contra la cual validar los tokens, así que
/// cualquier `auth.json` presente resuelve siempre a la misma identidad.
fn login_mock(_tokens: &Tokens) -> AccountInfo {
    AccountInfo {
        correo: "demo@obrix.local".to_string(),
        nombre: "Usuario Demo".to_string(),
    }
}

/// Lee `auth.json` si existe y resuelve la cuenta activa. `Ok(None)` significa
/// que no hay sesión — el frontend debe mostrar el botón de inicio de sesión.
pub fn sesion_actual() -> Result<Option<AccountInfo>, String> {
    let path = auth_json_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let contenido = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let archivo: ArchivoAuth = serde_json::from_str(&contenido).map_err(|e| e.to_string())?;
    Ok(Some(login_mock(&archivo.tokens)))
}

/// Simula el flujo de "iniciar sesión": abre la URL de la plataforma (mock,
/// no responde nada real) y escribe un `auth.json` con tokens inventados
/// para poder probar el resto del flujo sin depender de un servidor.
pub fn iniciar_sesion_mock(app: &tauri::AppHandle) -> Result<AccountInfo, String> {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url("https://obrix.app/auth", None::<&str>);

    let tokens = Tokens {
        id_token: format!("mock-id-{}", uuid::Uuid::new_v4()),
        access_token: format!("mock-access-{}", uuid::Uuid::new_v4()),
        account_id: uuid::Uuid::new_v4().to_string(),
    };
    let cuenta = login_mock(&tokens);
    let archivo = ArchivoAuth { tokens };

    let path = auth_json_path()?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let contenido = serde_json::to_string_pretty(&archivo).map_err(|e| e.to_string())?;
    std::fs::write(&path, contenido).map_err(|e| e.to_string())?;

    Ok(cuenta)
}
