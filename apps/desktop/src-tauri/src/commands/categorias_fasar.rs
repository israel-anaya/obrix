use crate::AppState;
use obrix_services::categoria_fasar::{CategoriaFasarCompleto, CategoriaFasarData, CategoriaFasarService};

#[tauri::command]
pub async fn list_categorias_fasar(state: tauri::State<'_, AppState>) -> Result<Vec<CategoriaFasarCompleto>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFasarService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_categoria_fasar(
    state: tauri::State<'_, AppState>,
    categoria: CategoriaFasarData,
) -> Result<CategoriaFasarCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFasarService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        categoria,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_categoria_fasar(
    state: tauri::State<'_, AppState>,
    id: String,
    categoria: CategoriaFasarData,
) -> Result<CategoriaFasarCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFasarService::actualizar(
        activo.portafolio.as_ref(),
        id,
        categoria,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_categoria_fasar(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFasarService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
