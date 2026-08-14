use obrix_db::entities::salario_categoria_fasar::Model;

use crate::AppState;
use obrix_services::salario_categoria_fasar::{
    SalarioCategoriaFasarData, SalarioCategoriaFasarService, SalarioLoteItem,
};

#[tauri::command]
pub async fn list_salarios_categoria_fasar(
    state: tauri::State<'_, AppState>,
    insumo_id: String,
) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    SalarioCategoriaFasarService::listar_por_categoria(activo.portafolio.as_ref(), &insumo_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_salario_categoria_fasar(
    state: tauri::State<'_, AppState>,
    insumo_id: String,
    salario: SalarioCategoriaFasarData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    SalarioCategoriaFasarService::crear(
        activo.portafolio.as_ref(),
        &insumo_id,
        salario,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_salarios_categoria_fasar_lote(
    state: tauri::State<'_, AppState>,
    salarios: Vec<SalarioLoteItem>,
) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    SalarioCategoriaFasarService::crear_lote(
        activo.portafolio.as_ref(),
        salarios,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}
