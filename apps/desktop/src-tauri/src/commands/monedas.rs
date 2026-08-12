use obrix_db::entities::moneda::Model;

use obrix_services::moneda::{MonedaData, MonedaService};
use crate::AppState;

#[tauri::command]
pub async fn list_monedas(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MonedaService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_moneda(
    state: tauri::State<'_, AppState>,
    moneda: MonedaData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MonedaService::crear(
        activo.portafolio.as_ref(),
        moneda,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_moneda(
    state: tauri::State<'_, AppState>,
    id: String,
    moneda: MonedaData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MonedaService::actualizar(
        activo.portafolio.as_ref(),
        id,
        moneda,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_moneda(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MonedaService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
