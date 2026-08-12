use obrix_db::entities::proveedor::Model;

use crate::AppState;
use obrix_services::proveedor::{ProveedorData, ProveedorService};

#[tauri::command]
pub async fn list_proveedores(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    ProveedorService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_proveedor(
    state: tauri::State<'_, AppState>,
    proveedor: ProveedorData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    ProveedorService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        proveedor,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_proveedor(
    state: tauri::State<'_, AppState>,
    id: String,
    proveedor: ProveedorData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    ProveedorService::actualizar(
        activo.portafolio.as_ref(),
        id,
        proveedor,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_proveedor(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    ProveedorService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
