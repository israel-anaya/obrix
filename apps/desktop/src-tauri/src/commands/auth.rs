use crate::auth::{self, AccountInfo};
use crate::AppState;

/// Llamado al arrancar la app: si ya hay una cuenta cacheada la devuelve tal
/// cual; si no, intenta resolverla desde `auth.json`. `Ok(None)` significa
/// que no hay sesión — el frontend debe mostrar el botón de inicio de sesión.
#[tauri::command]
pub async fn obtener_sesion(state: tauri::State<'_, AppState>) -> Result<Option<AccountInfo>, String> {
    if let Some(cuenta) = state.cuenta().await {
        return Ok(Some(cuenta));
    }
    let sesion = auth::sesion_actual()?;
    if let Some(cuenta) = &sesion {
        state.set_cuenta(cuenta.clone()).await;
    }
    Ok(sesion)
}

#[tauri::command]
pub async fn iniciar_sesion(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<AccountInfo, String> {
    let cuenta = auth::iniciar_sesion_mock(&app)?;
    state.set_cuenta(cuenta.clone()).await;
    Ok(cuenta)
}
