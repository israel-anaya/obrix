use obrix_db::entities::categoria_fsr::Model;

use obrix_services::categoria_fsr::{CategoriaFsrData, CategoriaFsrService};
use crate::AppState;

#[tauri::command]
pub async fn list_categorias_fsr(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFsrService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_categoria_fsr(
    state: tauri::State<'_, AppState>,
    categoria: CategoriaFsrData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFsrService::crear(
        activo.portafolio.as_ref(),
        categoria,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_categoria_fsr(
    state: tauri::State<'_, AppState>,
    id: String,
    categoria: CategoriaFsrData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFsrService::actualizar(
        activo.portafolio.as_ref(),
        id,
        categoria,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_categoria_fsr(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFsrService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
