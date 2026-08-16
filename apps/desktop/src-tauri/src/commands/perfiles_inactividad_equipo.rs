use obrix_db::entities::perfil_inactividad_equipo::Model;

use obrix_services::perfil_inactividad_equipo::{PerfilInactividadEquipoData, PerfilInactividadEquipoService};

use crate::AppState;

#[tauri::command]
pub async fn list_perfiles_inactividad_equipo(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PerfilInactividadEquipoService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_perfil_inactividad_equipo(
    state: tauri::State<'_, AppState>,
    perfil: PerfilInactividadEquipoData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PerfilInactividadEquipoService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        perfil,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_perfil_inactividad_equipo(
    state: tauri::State<'_, AppState>,
    id: String,
    perfil: PerfilInactividadEquipoData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PerfilInactividadEquipoService::actualizar(
        activo.portafolio.as_ref(),
        id,
        perfil,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_perfil_inactividad_equipo(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PerfilInactividadEquipoService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}
