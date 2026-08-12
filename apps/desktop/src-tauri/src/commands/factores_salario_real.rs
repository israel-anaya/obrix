use obrix_db::entities::factor_salario_real::Model;

use obrix_services::factor_salario_real::{FactorSalarioRealData, FactorSalarioRealService};
use crate::AppState;

#[tauri::command]
pub async fn list_factores_salario_real(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FactorSalarioRealService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_factor_salario_real(state: tauri::State<'_, AppState>, id: String) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FactorSalarioRealService::obtener(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_factor_salario_real(
    state: tauri::State<'_, AppState>,
    factor: FactorSalarioRealData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FactorSalarioRealService::crear(
        activo.portafolio.as_ref(),
        activo.organizacion_id.clone(),
        factor,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_factor_salario_real(
    state: tauri::State<'_, AppState>,
    id: String,
    factor: FactorSalarioRealData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FactorSalarioRealService::actualizar(
        activo.portafolio.as_ref(),
        id,
        factor,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_factor_salario_real(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    FactorSalarioRealService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
