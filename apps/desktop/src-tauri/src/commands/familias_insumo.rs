use obrix_db::entities::familia_insumo::Model;

use obrix_services::familia_insumo::{FamiliaInsumoData, FamiliaInsumoService};
use crate::AppState;

#[tauri::command]
pub async fn list_familias_insumo(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FamiliaInsumoService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_familia_insumo(
    state: tauri::State<'_, AppState>,
    familia: FamiliaInsumoData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FamiliaInsumoService::crear(
        activo.portafolio.as_ref(),
        familia,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_familia_insumo(
    state: tauri::State<'_, AppState>,
    id: String,
    familia: FamiliaInsumoData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FamiliaInsumoService::actualizar(
        activo.portafolio.as_ref(),
        id,
        familia,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_familia_insumo(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FamiliaInsumoService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
