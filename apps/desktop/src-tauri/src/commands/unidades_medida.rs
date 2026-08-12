use obrix_db::entities::unidad_medida::Model;

use obrix_services::unidad_medida::{UnidadMedidaData, UnidadMedidaService};
use crate::AppState;

#[tauri::command]
pub async fn list_unidades_medida(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    UnidadMedidaService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_unidad_medida(
    state: tauri::State<'_, AppState>,
    unidad: UnidadMedidaData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    UnidadMedidaService::crear(
        activo.portafolio.as_ref(),
        unidad,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_unidad_medida(
    state: tauri::State<'_, AppState>,
    id: String,
    unidad: UnidadMedidaData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    UnidadMedidaService::actualizar(
        activo.portafolio.as_ref(),
        id,
        unidad,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_unidad_medida(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    UnidadMedidaService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
