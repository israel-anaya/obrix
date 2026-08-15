use obrix_db::entities::cuadrilla_detalle::Model as CuadrillaDetalleModel;

use crate::AppState;
use obrix_services::cuadrilla::{CuadrillaCompleto, CuadrillaData, CuadrillaService};
use obrix_services::cuadrilla_detalle::{CuadrillaDetalleData, CuadrillaDetalleService, DireccionMovimiento};

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
    CuadrillaService::eliminar(activo.portafolio.as_ref(), id)
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
    detalle: CuadrillaDetalleData,
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
    CuadrillaDetalleService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recalculate_cuadrilla(
    state: tauri::State<'_, AppState>,
    cuadrilla_insumo_id: String,
) -> Result<CuadrillaCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    CuadrillaDetalleService::recalcular_costos(activo.portafolio.as_ref(), cuadrilla_insumo_id)
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
