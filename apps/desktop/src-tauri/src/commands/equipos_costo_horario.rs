use obrix_db::entities::equipo_costo_horario_costo::Model as EquipoCostoHorarioCostoModel;
use obrix_db::entities::equipo_costo_horario_costo_detalle::Model as EquipoCostoHorarioCostoDetalleModel;
use obrix_db::entities::equipo_costo_horario_detalle::Model as EquipoCostoHorarioDetalleModel;

use crate::{commands, AppState};
use obrix_services::equipo_costo_horario::{EquipoCostoHorarioCompleto, EquipoCostoHorarioData, EquipoCostoHorarioService};
use obrix_services::equipo_costo_horario_costo::EquipoCostoHorarioCostoService;
use obrix_services::equipo_costo_horario_costo_detalle::EquipoCostoHorarioCostoDetalleService;
use obrix_services::equipo_costo_horario_detalle::{
    DireccionMovimiento, EquipoCostoHorarioDetalleData, EquipoCostoHorarioDetalleService,
};
use obrix_services::material::ResultadoImportacion;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn list_equipos_costo_horario(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<EquipoCostoHorarioCompleto>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_equipo_costo_horario(
    state: tauri::State<'_, AppState>,
    equipo: EquipoCostoHorarioData,
) -> Result<EquipoCostoHorarioCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        equipo,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_equipo_costo_horario(
    state: tauri::State<'_, AppState>,
    id: String,
    equipo: EquipoCostoHorarioData,
) -> Result<EquipoCostoHorarioCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioService::actualizar(
        activo.portafolio.as_ref(),
        id,
        equipo,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_equipo_costo_horario(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_equipo_costo_horario_detalles(
    state: tauri::State<'_, AppState>,
    equipo_costo_horario_insumo_id: String,
) -> Result<Vec<EquipoCostoHorarioDetalleModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioDetalleService::listar_por_equipo(activo.portafolio.as_ref(), &equipo_costo_horario_insumo_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_equipo_costo_horario_detalle(
    state: tauri::State<'_, AppState>,
    equipo_costo_horario_insumo_id: String,
    detalle: EquipoCostoHorarioDetalleData,
) -> Result<EquipoCostoHorarioCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioDetalleService::crear(
        activo.portafolio.as_ref(),
        &equipo_costo_horario_insumo_id,
        detalle,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_equipo_costo_horario_detalle(
    state: tauri::State<'_, AppState>,
    id: String,
    detalle: EquipoCostoHorarioDetalleData,
) -> Result<EquipoCostoHorarioCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioDetalleService::actualizar(
        activo.portafolio.as_ref(),
        id,
        detalle,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_equipo_costo_horario_detalle(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<EquipoCostoHorarioCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioDetalleService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_equipo_costo_horario_detalle(
    state: tauri::State<'_, AppState>,
    id: String,
    direccion: DireccionMovimiento,
) -> Result<EquipoCostoHorarioCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioDetalleService::mover(activo.portafolio.as_ref(), id, direccion)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_equipo_costo_horario_costos(
    state: tauri::State<'_, AppState>,
    equipo_costo_horario_id: String,
) -> Result<Vec<EquipoCostoHorarioCostoModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioCostoService::listar_por_equipo(activo.portafolio.as_ref(), &equipo_costo_horario_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recalculate_equipo_costo_horario_zonas(
    state: tauri::State<'_, AppState>,
    equipo_costo_horario_id: String,
) -> Result<Vec<EquipoCostoHorarioCostoModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioCostoService::recalcular_zonas(
        activo.portafolio.as_ref(),
        &equipo_costo_horario_id,
        &activo.usuario_id_activo,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_equipo_costo_horario_costo_detalles(
    state: tauri::State<'_, AppState>,
    equipo_costo_horario_costo_id: String,
) -> Result<Vec<EquipoCostoHorarioCostoDetalleModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioCostoDetalleService::listar_por_costo(
        activo.portafolio.as_ref(),
        &equipo_costo_horario_costo_id,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn importar_equipos_costo_horario_csv(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<ResultadoImportacion, String> {
    let contenido = std::fs::read_to_string(&path).map_err(|e| format!("no se pudo leer el archivo: {e}"))?;
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    EquipoCostoHorarioService::importar_csv_con_progreso(
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
