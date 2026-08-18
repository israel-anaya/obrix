use obrix_plugins::PortafolioFactory;

use obrix_db::entities::usuario::RolUsuario;
use obrix_services::organizacion::OrganizacionService;
use obrix_services::organizacion_usuario::{OrganizacionUsuarioData, OrganizacionUsuarioService};
use obrix_services::seed::sembrar_catalogos_generales;
use obrix_services::usuario::{UsuarioData, UsuarioService};
use crate::{resolver_organizacion_id, AppState, PortafolioActivo, PortafolioPendiente};

#[derive(serde::Serialize)]
#[serde(tag = "estado")]
pub enum ResultadoAbrirPortafolio {
    Activado { path: String },
    /// La cuenta activa no tiene membresía activa en este portafolio — hay
    /// que preguntarle si de verdad quiere entrar a uno ajeno antes de
    /// dársela (ver `confirmar_apertura_portafolio_ajeno`).
    RequiereConfirmacion { path: String },
}

#[tauri::command]
pub async fn crear_portafolio(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let path = std::path::PathBuf::from(path);
    let cuenta = state.requerir_cuenta().await?;

    let portafolio = PortafolioFactory::crear(&path)
        .await
        .map_err(|e| e.to_string())?;
    sembrar_catalogos_generales(portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    let admin = UsuarioService::buscar_admin_obrix(portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())?;
    let organizacion_id = OrganizacionService::buscar_admin_obrix(portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())?
        .id;

    let usuario = UsuarioService::crear(
        portafolio.as_ref(),
        UsuarioData {
            nombre: cuenta.nombre,
            correo: cuenta.correo,
            rol: RolUsuario::Propietario,
            activo: true,
        },
        Some(admin.id.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;
    OrganizacionUsuarioService::crear(
        portafolio.as_ref(),
        OrganizacionUsuarioData {
            organizacion_id: organizacion_id.clone(),
            usuario_id: usuario.id.clone(),
            activo: true,
        },
        admin.id,
    )
    .await
    .map_err(|e| e.to_string())?;

    let path_str = path.display().to_string();
    state
        .reemplazar(PortafolioActivo {
            portafolio,
            organizacion_id,
            usuario_id_activo: usuario.id,
        })
        .await;
    crate::recientes::registrar(&path_str);
    Ok(path_str)
}

#[tauri::command]
pub async fn abrir_portafolio(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<ResultadoAbrirPortafolio, String> {
    let path = std::path::PathBuf::from(path);
    let cuenta = state.requerir_cuenta().await?;

    let portafolio = PortafolioFactory::abrir(&path)
        .await
        .map_err(|e| e.to_string())?;
    let organizacion_id = resolver_organizacion_id(portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    let usuario = UsuarioService::buscar_por_correo(portafolio.as_ref(), &cuenta.correo)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(usuario) = usuario {
        let membresia = OrganizacionUsuarioService::buscar_membresia_activa(
            portafolio.as_ref(),
            &organizacion_id,
            &usuario.id,
        )
        .await
        .map_err(|e| e.to_string())?;
        if membresia.is_some() {
            let path_str = path.display().to_string();
            state
                .reemplazar(PortafolioActivo {
                    portafolio,
                    organizacion_id,
                    usuario_id_activo: usuario.id,
                })
                .await;
            crate::recientes::registrar(&path_str);
            return Ok(ResultadoAbrirPortafolio::Activado { path: path_str });
        }
    }

    let resultado = ResultadoAbrirPortafolio::RequiereConfirmacion {
        path: path.display().to_string(),
    };
    state
        .dejar_pendiente(PortafolioPendiente {
            portafolio,
            organizacion_id,
            path,
        })
        .await;
    Ok(resultado)
}

/// Responde a `ResultadoAbrirPortafolio::RequiereConfirmacion`. `confirmar =
/// false` descarta el portafolio pendiente (cierra la conexión) y devuelve
/// `None`; `confirmar = true` le da a la cuenta activa membresía como
/// `editor` en ese portafolio ajeno (reusando el `usuario` global si ya
/// existía con otro rol, o creándolo si es la primera vez que aparece en
/// este archivo) y lo activa.
#[tauri::command]
pub async fn confirmar_apertura_portafolio_ajeno(
    state: tauri::State<'_, AppState>,
    confirmar: bool,
) -> Result<Option<String>, String> {
    let pendiente = state
        .tomar_pendiente()
        .await
        .ok_or("no hay una apertura de portafolio pendiente de confirmación")?;

    if !confirmar {
        return Ok(None);
    }

    let cuenta = state.requerir_cuenta().await?;
    let admin = UsuarioService::buscar_admin_obrix(pendiente.portafolio.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    let usuario_existente = UsuarioService::buscar_por_correo(pendiente.portafolio.as_ref(), &cuenta.correo)
        .await
        .map_err(|e| e.to_string())?;
    let usuario = match usuario_existente {
        Some(usuario) => usuario,
        None => UsuarioService::crear(
            pendiente.portafolio.as_ref(),
            UsuarioData {
                nombre: cuenta.nombre,
                correo: cuenta.correo,
                rol: RolUsuario::Editor,
                activo: true,
            },
            Some(admin.id.clone()),
        )
        .await
        .map_err(|e| e.to_string())?,
    };

    OrganizacionUsuarioService::crear(
        pendiente.portafolio.as_ref(),
        OrganizacionUsuarioData {
            organizacion_id: pendiente.organizacion_id.clone(),
            usuario_id: usuario.id.clone(),
            activo: true,
        },
        admin.id,
    )
    .await
    .map_err(|e| e.to_string())?;

    let path = pendiente.path.display().to_string();
    state
        .reemplazar(PortafolioActivo {
            portafolio: pendiente.portafolio,
            organizacion_id: pendiente.organizacion_id,
            usuario_id_activo: usuario.id,
        })
        .await;
    crate::recientes::registrar(&path);
    Ok(Some(path))
}

#[tauri::command]
pub async fn cerrar_portafolio(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.cerrar().await;
    Ok(())
}

#[tauri::command]
pub fn listar_portafolios_recientes() -> Result<Vec<crate::recientes::PortafolioReciente>, String> {
    crate::recientes::listar()
}

/// Cambia la organización activa del portafolio abierto — falla si la
/// cuenta activa no tiene membresía activa en `organizacion_id` (no se
/// puede saltar a una organización ajena desde el selector).
#[tauri::command]
pub async fn set_organizacion_activa(
    state: tauri::State<'_, AppState>,
    organizacion_id: String,
) -> Result<(), String> {
    let membresia = {
        let guard = state.requerir().await?;
        let activo = guard.as_ref().unwrap();
        OrganizacionUsuarioService::buscar_membresia_activa(
            activo.portafolio.as_ref(),
            &organizacion_id,
            &activo.usuario_id_activo,
        )
        .await
        .map_err(|e| e.to_string())?
    };
    if membresia.is_none() {
        return Err("No tienes membresía activa en esa organización".to_string());
    }
    state.set_organizacion_activa(organizacion_id).await
}
