use obrix_db::entities::precio_material::Model;

use crate::AppState;
use obrix_services::precio_material::{PrecioMaterialData, PrecioMaterialService};

#[tauri::command]
pub async fn list_precios_material(
    state: tauri::State<'_, AppState>,
    insumo_id: String,
) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PrecioMaterialService::listar_por_material(activo.portafolio.as_ref(), &insumo_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_precio_material(
    state: tauri::State<'_, AppState>,
    insumo_id: String,
    precio: PrecioMaterialData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PrecioMaterialService::crear(
        activo.portafolio.as_ref(),
        &insumo_id,
        precio,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}
