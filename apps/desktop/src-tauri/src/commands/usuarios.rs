use obrix_db::entities::usuario::Model;

use obrix_services::organizacion_usuario::{
    OrganizacionMembresia, OrganizacionUsuarioData, OrganizacionUsuarioService,
};
use obrix_services::usuario::{UsuarioData, UsuarioService};
use crate::AppState;

#[tauri::command]
pub async fn list_usuarios(state: tauri::State<'_, AppState>) -> Result<Vec<Model>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    UsuarioService::listar(activo.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())
}

/// `usuario` es una identidad global — crear uno desde el catálogo de esta
/// organización también le da membresía activa en ella.
#[tauri::command]
pub async fn create_usuario(
    state: tauri::State<'_, AppState>,
    usuario: UsuarioData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    let creado_por = activo.usuario_id_activo.clone();
    let nuevo = UsuarioService::crear(
        activo.portafolio.as_ref(),
        usuario,
        Some(creado_por.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;
    OrganizacionUsuarioService::crear(
        activo.portafolio.as_ref(),
        OrganizacionUsuarioData {
            organizacion_id: activo.organizacion_id.clone(),
            usuario_id: nuevo.id.clone(),
            activo: true,
        },
        creado_por,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(nuevo)
}

#[tauri::command]
pub async fn update_usuario(
    state: tauri::State<'_, AppState>,
    id: String,
    usuario: UsuarioData,
) -> Result<Model, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    UsuarioService::actualizar(
        activo.portafolio.as_ref(),
        id,
        usuario,
        Some(activo.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_usuario(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    UsuarioService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}

/// Organizaciones de las que `usuario_id` es miembro — detalle de la vista
/// maestro/detalle de usuarios en Ajustes.
#[tauri::command]
pub async fn list_organizaciones_de_usuario(
    state: tauri::State<'_, AppState>,
    usuario_id: String,
) -> Result<Vec<OrganizacionMembresia>, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionUsuarioService::listar_detalle_por_usuario(activo.portafolio.as_ref(), &usuario_id)
        .await
        .map_err(|e| e.to_string())
}

/// Da de alta a `usuario_id` como miembro de `organizacion_id` — alta desde
/// el detalle "Organizaciones" del maestro/detalle de usuarios en Ajustes.
#[tauri::command]
pub async fn create_organizacion_usuario(
    state: tauri::State<'_, AppState>,
    usuario_id: String,
    organizacion_id: String,
) -> Result<OrganizacionMembresia, String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionUsuarioService::crear_detalle(
        activo.portafolio.as_ref(),
        OrganizacionUsuarioData {
            organizacion_id,
            usuario_id,
            activo: true,
        },
        activo.usuario_id_activo.clone(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_organizacion_usuario(
    state: tauri::State<'_, AppState>,
    id: String,
    usuario_id: String,
    organizacion_id: String,
    activo: bool,
) -> Result<OrganizacionMembresia, String> {
    let guard = state.requerir().await?;
    let ctx = guard.as_ref().unwrap();
    OrganizacionUsuarioService::actualizar_detalle(
        ctx.portafolio.as_ref(),
        id,
        OrganizacionUsuarioData {
            organizacion_id,
            usuario_id,
            activo,
        },
        Some(ctx.usuario_id_activo.clone()),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_organizacion_usuario(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let guard = state.requerir().await?;
    let activo = guard.as_ref().unwrap();
    OrganizacionUsuarioService::eliminar(activo.portafolio.as_ref(), id)
        .await
        .map_err(|e| e.to_string())
}
