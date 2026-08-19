use crate::auth::{self, AccountInfo};
use crate::AppState;

/// Llamado al arrancar la app: si ya hay una cuenta cacheada la devuelve tal
/// cual; si no, intenta resolverla refrescando la sesión contra GoTrue.
/// `Ok(None)` significa que no hay sesión — el frontend debe mostrar el
/// login.
#[tauri::command]
pub async fn obtener_sesion(state: tauri::State<'_, AppState>) -> Result<Option<AccountInfo>, String> {
    if let Some(cuenta) = state.cuenta().await {
        return Ok(Some(cuenta));
    }
    let sesion = auth::sesion_actual().await?;
    if let Some(cuenta) = &sesion {
        state.set_cuenta(cuenta.clone()).await;
    }
    Ok(sesion)
}

#[tauri::command]
pub async fn iniciar_sesion(
    correo: String,
    password: String,
    state: tauri::State<'_, AppState>,
) -> Result<AccountInfo, String> {
    let cuenta = auth::iniciar_sesion(&correo, &password).await?;
    state.set_cuenta(cuenta.clone()).await;
    Ok(cuenta)
}

#[tauri::command]
pub async fn registrar_cuenta(
    correo: String,
    password: String,
    state: tauri::State<'_, AppState>,
) -> Result<AccountInfo, String> {
    let cuenta = auth::registrar_cuenta(&correo, &password).await?;
    state.set_cuenta(cuenta.clone()).await;
    Ok(cuenta)
}

#[tauri::command]
pub async fn cerrar_sesion(state: tauri::State<'_, AppState>) -> Result<(), String> {
    auth::cerrar_sesion().await?;
    state.cerrar().await;
    state.limpiar_cuenta().await;
    Ok(())
}
