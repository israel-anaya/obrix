use obrix_db::entities::cuadrilla_costo::Model as CuadrillaCostoModel;
use obrix_db::entities::cuadrilla_costo_detalle::Model as CuadrillaCostoDetalleModel;
use obrix_db::entities::cuadrilla_detalle::Model as CuadrillaDetalleModel;

use crate::{commands, AppState};
use obrix_services::cuadrilla::{CuadrillaCompleto, CuadrillaData, CuadrillaService};
use obrix_services::cuadrilla_costo::CuadrillaCostoService;
use obrix_services::cuadrilla_costo_detalle::CuadrillaCostoDetalleService;
use obrix_services::cuadrilla_detalle::{
    CuadrillaDetalleData, CuadrillaDetalleEditarData, CuadrillaDetalleService, DireccionMovimiento,
};
use obrix_services::material::ResultadoImportacion;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn list_cuadrillas(state: tauri::State<'_, AppState>) -> Result<Vec<CuadrillaCompleto>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_cuadrilla(
    state: tauri::State<'_, AppState>,
    cuadrilla: CuadrillaData,
) -> Result<CuadrillaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        cuadrilla,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_cuadrilla(
    state: tauri::State<'_, AppState>,
    id: String,
    cuadrilla: CuadrillaData,
) -> Result<CuadrillaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaService::actualizar(
        activo.portafolio.as_ref(),
        id,
        cuadrilla,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_cuadrilla(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_cuadrilla_detalles(
    state: tauri::State<'_, AppState>,
    cuadrilla_insumo_id: String,
) -> Result<Vec<CuadrillaDetalleModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaDetalleService::listar_por_cuadrilla(activo.portafolio.as_ref(), &cuadrilla_insumo_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_cuadrilla_detalle(
    state: tauri::State<'_, AppState>,
    cuadrilla_insumo_id: String,
    detalle: CuadrillaDetalleData,
) -> Result<CuadrillaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaDetalleService::crear(
        activo.portafolio.as_ref(),
        &cuadrilla_insumo_id,
        detalle,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_cuadrilla_detalle(
    state: tauri::State<'_, AppState>,
    id: String,
    detalle: CuadrillaDetalleEditarData,
) -> Result<CuadrillaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaDetalleService::actualizar(
        activo.portafolio.as_ref(),
        id,
        detalle,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_cuadrilla_detalle(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<CuadrillaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaDetalleService::eliminar(activo.portafolio.as_ref(), id, activo.usuario_id_activo.clone())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_cuadrilla_detalle(
    state: tauri::State<'_, AppState>,
    id: String,
    direccion: DireccionMovimiento,
) -> Result<CuadrillaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaDetalleService::mover(activo.portafolio.as_ref(), id, direccion)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_cuadrilla_costos(
    state: tauri::State<'_, AppState>,
    cuadrilla_id: String,
) -> Result<Vec<CuadrillaCostoModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaCostoService::listar_por_cuadrilla(activo.portafolio.as_ref(), &cuadrilla_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_cuadrilla_costo_regional(
    state: tauri::State<'_, AppState>,
    cuadrilla_id: String,
    region_id: String,
) -> Result<CuadrillaCostoModel, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaCostoService::crear_regional(
        activo.portafolio.as_ref(),
        &cuadrilla_id,
        region_id,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_cuadrilla_costo(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaCostoService::eliminar_regional(activo.portafolio.as_ref(), id, activo.usuario_id_activo.clone())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recalculate_cuadrilla_zonas(
    state: tauri::State<'_, AppState>,
    cuadrilla_id: String,
) -> Result<Vec<CuadrillaCostoModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaCostoService::recalcular_zonas(
        activo.portafolio.as_ref(),
        &cuadrilla_id,
        &activo.usuario_id_activo,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_cuadrilla_costo_detalles(
    state: tauri::State<'_, AppState>,
    cuadrilla_costo_id: String,
) -> Result<Vec<CuadrillaCostoDetalleModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaCostoDetalleService::listar_por_costo(activo.portafolio.as_ref(), &cuadrilla_costo_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn importar_cuadrillas_csv(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<ResultadoImportacion, String> {
    let contenido = std::fs::read_to_string(&path).map_err(|e| format!("no se pudo leer el archivo: {e}"))?;
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaService::importar_csv_con_progreso(
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
