use crate::{commands, AppState};
use obrix_services::categoria_fasar::{CategoriaFasarCompleto, CategoriaFasarData, CategoriaFasarService};
use obrix_services::material::ResultadoImportacion;
use tauri::{AppHandle, Emitter};

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
    CategoriaFasarService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn importar_categorias_fasar_csv(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<ResultadoImportacion, String> {
    let contenido = std::fs::read_to_string(&path).map_err(|e| format!("no se pudo leer el archivo: {e}"))?;
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CategoriaFasarService::importar_csv_con_progreso(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        &contenido,
        activo.usuario_id_activo.clone(),
        move |actual, total| {
            let _ = app.emit(
                commands::EVENTO_CSV_PROGRESO,
                commands::CsvProgresoPayload { actual, total },
            );
        },
    )
    .await
    .map_err(|e| e.to_string())
}
