use obrix_db::entities::cliente::Model;

use obrix_services::cliente::{ClienteData, ClienteService};
use crate::AppState;

#[tauri::command]
pub async fn list_clientes(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    ClienteService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_cliente(
    state: tauri::State<'_, AppState>,
    cliente: ClienteData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    ClienteService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        cliente,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_cliente(
    state: tauri::State<'_, AppState>,
    id: String,
    cliente: ClienteData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    ClienteService::actualizar(
        activo.portafolio.as_ref(),
        id,
        cliente,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_cliente(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    ClienteService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
