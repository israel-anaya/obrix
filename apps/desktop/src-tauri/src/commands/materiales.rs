use crate::AppState;
use obrix_services::material::{MaterialCompleto, MaterialData, MaterialService, ResultadoImportacion};

#[tauri::command]
pub async fn list_materiales(state: tauri::State<'_, AppState>) -> Result<Vec<MaterialCompleto>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MaterialService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_material(
    state: tauri::State<'_, AppState>,
    material: MaterialData,
) -> Result<MaterialCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MaterialService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        material,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_material(
    state: tauri::State<'_, AppState>,
    id: String,
    material: MaterialData,
) -> Result<MaterialCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MaterialService::actualizar(
        activo.portafolio.as_ref(),
        id,
        material,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_material(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MaterialService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn importar_materiales_csv(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<ResultadoImportacion, String> {
    let contenido = std::fs::read_to_string(&path).map_err(|e| format!("no se pudo leer el archivo: {e}"))?;
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    MaterialService::importar_csv(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        &contenido,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}
