use obrix_db::entities::organizacion::Model;

use obrix_services::organizacion::{OrganizacionData, OrganizacionService};
use crate::AppState;

#[tauri::command]
pub async fn list_organizaciones(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

/// Organizaciones donde la cuenta activa tiene membresía — alimenta el
/// selector de organización activa del sidebar.
#[tauri::command]
pub async fn list_organizaciones_activas(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionService::listar_por_usuario(activo.portafolio.as_ref(), &activo.usuario_id_activo)
        .await
        .map_err(|e| e.to_string())
}

/// La organización activa del portafolio abierto — para que el selector del
/// sidebar sepa cuál marcar como seleccionada.
#[tauri::command]
pub async fn organizacion_activa(state: tauri::State<'_, AppState>) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionService::buscar_por_id(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_organizacion(
    state: tauri::State<'_, AppState>,
    organizacion: OrganizacionData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionService::crear(
        activo.portafolio.as_ref(),
        organizacion,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_organizacion(
    state: tauri::State<'_, AppState>,
    id: String,
    organizacion: OrganizacionData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionService::actualizar(
        activo.portafolio.as_ref(),
        id,
        organizacion,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_organizacion(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}
