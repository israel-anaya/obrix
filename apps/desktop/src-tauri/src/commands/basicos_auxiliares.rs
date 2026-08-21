use obrix_db::entities::basico_auxiliar_componente::Model as BasicoAuxiliarComponenteModel;
use obrix_db::entities::basico_auxiliar_costo::Model as BasicoAuxiliarCostoModel;
use obrix_db::entities::basico_auxiliar_costo_detalle::Model as BasicoAuxiliarCostoDetalleModel;

use crate::{commands, AppState};
use obrix_services::basico_auxiliar::{BasicoAuxiliarCompleto, BasicoAuxiliarData, BasicoAuxiliarService};
use obrix_services::basico_auxiliar_componente::{
    BasicoAuxiliarComponenteData, BasicoAuxiliarComponenteEditarData,
    BasicoAuxiliarComponenteService, DireccionMovimiento,
};
use obrix_services::basico_auxiliar_costo::BasicoAuxiliarCostoService;
use obrix_services::basico_auxiliar_costo_detalle::{
    BasicoAuxiliarCostoDetalleCantidadData, BasicoAuxiliarCostoDetalleRendimientoData,
    BasicoAuxiliarCostoDetalleService,
};
use obrix_services::material::ResultadoImportacion;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn list_basicos_auxiliares(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<BasicoAuxiliarCompleto>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarService::listar(activo.portafolio.as_ref(), &activo.organizacion_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_basico_auxiliar(
    state: tauri::State<'_, AppState>,
    basico_auxiliar: BasicoAuxiliarData,
) -> Result<BasicoAuxiliarCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarService::crear(
        activo.portafolio.as_ref(),
        &activo.organizacion_id,
        basico_auxiliar,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_basico_auxiliar(
    state: tauri::State<'_, AppState>,
    id: String,
    basico_auxiliar: BasicoAuxiliarData,
) -> Result<BasicoAuxiliarCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarService::actualizar(
        activo.portafolio.as_ref(),
        id,
        basico_auxiliar,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_basico_auxiliar(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn importar_basicos_auxiliares_csv(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<ResultadoImportacion, String> {
    let contenido = std::fs::read_to_string(&path).map_err(|e| format!("no se pudo leer el archivo: {e}"))?;
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarService::importar_csv_con_progreso(
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

#[tauri::command]
pub async fn list_basico_auxiliar_componentes(
    state: tauri::State<'_, AppState>,
    basico_auxiliar_id: String,
) -> Result<Vec<BasicoAuxiliarComponenteModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarComponenteService::listar_por_auxiliar(
        activo.portafolio.as_ref(),
        &basico_auxiliar_id,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_basico_auxiliar_componente(
    state: tauri::State<'_, AppState>,
    basico_auxiliar_id: String,
    componente: BasicoAuxiliarComponenteData,
) -> Result<BasicoAuxiliarCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarComponenteService::crear(
        activo.portafolio.as_ref(),
        &basico_auxiliar_id,
        componente,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_basico_auxiliar_componente(
    state: tauri::State<'_, AppState>,
    id: String,
    componente: BasicoAuxiliarComponenteEditarData,
) -> Result<BasicoAuxiliarCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarComponenteService::actualizar(
        activo.portafolio.as_ref(),
        id,
        componente,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_basico_auxiliar_componente(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<BasicoAuxiliarCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarComponenteService::eliminar(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_basico_auxiliar_componente(
    state: tauri::State<'_, AppState>,
    id: String,
    direccion: DireccionMovimiento,
) -> Result<BasicoAuxiliarCompleto, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarComponenteService::mover(activo.portafolio.as_ref(), id, direccion)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_basico_auxiliar_costos(
    state: tauri::State<'_, AppState>,
    basico_auxiliar_id: String,
) -> Result<Vec<BasicoAuxiliarCostoModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarCostoService::listar_por_auxiliar(activo.portafolio.as_ref(), &basico_auxiliar_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_basico_auxiliar_costo_regional(
    state: tauri::State<'_, AppState>,
    basico_auxiliar_id: String,
    region_id: String,
) -> Result<BasicoAuxiliarCostoModel, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarCostoService::crear_regional(
        activo.portafolio.as_ref(),
        &basico_auxiliar_id,
        region_id,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_basico_auxiliar_costo(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarCostoService::eliminar_regional(
        activo.portafolio.as_ref(),
        id,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recalculate_basico_auxiliar_zonas(
    state: tauri::State<'_, AppState>,
    basico_auxiliar_id: String,
) -> Result<Vec<BasicoAuxiliarCostoModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarCostoService::recalcular_zonas(
        activo.portafolio.as_ref(),
        &basico_auxiliar_id,
        &activo.usuario_id_activo,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_basico_auxiliar_costo_detalles(
    state: tauri::State<'_, AppState>,
    basico_auxiliar_costo_id: String,
) -> Result<Vec<BasicoAuxiliarCostoDetalleModel>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarCostoDetalleService::listar_por_costo(
        activo.portafolio.as_ref(),
        &basico_auxiliar_costo_id,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_basico_auxiliar_costo_detalle_cantidad(
    state: tauri::State<'_, AppState>,
    id: String,
    detalle: BasicoAuxiliarCostoDetalleCantidadData,
) -> Result<BasicoAuxiliarCostoModel, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarCostoDetalleService::actualizar_cantidad(
        activo.portafolio.as_ref(),
        id,
        detalle,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_basico_auxiliar_costo_detalle_rendimiento(
    state: tauri::State<'_, AppState>,
    id: String,
    detalle: BasicoAuxiliarCostoDetalleRendimientoData,
) -> Result<BasicoAuxiliarCostoModel, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    BasicoAuxiliarCostoDetalleService::actualizar_rendimiento(
        activo.portafolio.as_ref(),
        id,
        detalle,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}
