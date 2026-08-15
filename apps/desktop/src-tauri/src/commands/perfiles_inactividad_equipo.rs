use obrix_db::entities::perfil_inactividad_equipo::Model;
use rust_decimal::Decimal;

use obrix_services::perfil_inactividad_equipo::PerfilInactividadEquipoService;

use crate::AppState;

#[tauri::command]
pub async fn list_perfiles_inactividad_equipo(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PerfilInactividadEquipoService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_perfil_inactividad_equipo(
    state: tauri::State<'_, AppState>,
    id: String,
    valor: Decimal,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PerfilInactividadEquipoService::actualizar_valor(
        activo.portafolio.as_ref(),
        id,
        valor,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_perfil_inactividad_equipo_columna(
    state: tauri::State<'_, AppState>,
    perfil: String,
) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PerfilInactividadEquipoService::agregar_columna(
        activo.portafolio.as_ref(),
        perfil,
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_perfil_inactividad_equipo_columna(
    state: tauri::State<'_, AppState>,
    perfil: String,
) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    PerfilInactividadEquipoService::eliminar_columna(activo.portafolio.as_ref(), perfil)
        .await
        .map_err(|e| e.to_string())
}
