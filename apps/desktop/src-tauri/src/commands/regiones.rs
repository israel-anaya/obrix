use obrix_db::entities::region::Model;

use obrix_services::region::{RegionData, RegionService};
use crate::AppState;

#[tauri::command]
pub async fn list_regiones(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    RegionService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_region(
    state: tauri::State<'_, AppState>,
    region: RegionData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    RegionService::crear(
        activo.portafolio.as_ref(),
        region,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_region(
    state: tauri::State<'_, AppState>,
    id: String,
    region: RegionData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    RegionService::actualizar(
        activo.portafolio.as_ref(),
        id,
        region,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_region(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    RegionService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}
