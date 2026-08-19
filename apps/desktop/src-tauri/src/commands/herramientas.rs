use crate::{commands, AppState};
use obrix_services::herramienta::{HerramientaCompleto, HerramientaData, HerramientaService};
use obrix_services::material::ResultadoImportacion;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn list_herramientas(state: tauri::State<'_, AppState>) -> Result<Vec<HerramientaCompleto>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_herramienta(
    state: tauri::State<'_, AppState>,
    herramienta: HerramientaData,
) -> Result<HerramientaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        herramienta,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_herramienta(
    state: tauri::State<'_, AppState>,
    id: String,
    herramienta: HerramientaData,
) -> Result<HerramientaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::actualizar(
        activo.portafolio.as_ref(),
        id,
        herramienta,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_herramienta(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn importar_herramientas_csv(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<ResultadoImportacion, String> {
    let contenido = std::fs::read_to_string(&path).map_err(|e| format!("no se pudo leer el archivo: {e}"))?;
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    HerramientaService::importar_csv_con_progreso(
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
