use crate::AppState;
use obrix_services::herramienta::{HerramientaCompleto, HerramientaData, HerramientaService};

#[tauri::command]
pub async fn list_herramientas(state: tauri::State<'_, AppState>) -> Result<Vec<HerramientaCompleto>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_herramienta(
    state: tauri::State<'_, AppState>,
    herramienta: HerramientaData,
) -> Result<HerramientaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        herramienta,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_herramienta(
    state: tauri::State<'_, AppState>,
    id: String,
    herramienta: HerramientaData,
) -> Result<HerramientaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::actualizar(
        activo.portafolio.as_ref(),
        id,
        herramienta,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_herramienta(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}
