//! Membresía: qué organizaciones puede ver un usuario (identidad global, ver
//! `usuario`). Usado internamente para resolver `usuario_id_activo`, y desde
//! el detalle "Organizaciones" del maestro/detalle de usuarios en Ajustes.

use obrix_db::entities::organizacion;
use obrix_db::entities::organizacion::TipoOrganizacion;
use obrix_db::entities::organizacion_usuario::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter,
};

use crate::{nuevo_id, ServiceError};

pub struct OrganizacionUsuarioData {
    pub organizacion_id: String,
    pub usuario_id: String,
    pub activo: bool,
}

/// Una membresía junto con los datos de la organización a la que pertenece —
/// forma que consume el detalle "Organizaciones" de la vista de usuarios.
#[derive(serde::Serialize)]
pub struct OrganizacionMembresia {
    pub membresia_id: String,
    pub organizacion_id: String,
    pub razon_social: String,
    pub rfc: String,
    pub tipo: TipoOrganizacion,
    pub activo: bool,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

pub struct OrganizacionUsuarioService;

impl OrganizacionUsuarioService {
    async fn con_organizacion(
        repo: &dyn PortafolioRepository,
        membresia: Model,
    ) -> Result<OrganizacionMembresia, ServiceError> {
        let org = organizacion::Entity::find_by_id(&membresia.organizacion_id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("organización {}", membresia.organizacion_id))
            })?;
        Ok(OrganizacionMembresia {
            membresia_id: membresia.id,
            organizacion_id: membresia.organizacion_id,
            razon_social: org.razon_social,
            rfc: org.rfc,
            tipo: org.tipo,
            activo: membresia.activo,
            created_at: membresia.created_at,
            created_by: membresia.created_by,
            updated_at: membresia.updated_at,
            updated_by: membresia.updated_by,
        })
    }

    /// Membresías de `usuario_id` con los datos de cada organización — para
    /// el detalle "Organizaciones" del maestro/detalle de usuarios en Ajustes.
    pub async fn listar_detalle_por_usuario(
        repo: &dyn PortafolioRepository,
        usuario_id: &str,
    ) -> Result<Vec<OrganizacionMembresia>, ServiceError> {
        let membresias = Self::listar_por_usuario(repo, usuario_id).await?;
        let mut resultado = Vec::with_capacity(membresias.len());
        for m in membresias {
            resultado.push(Self::con_organizacion(repo, m).await?);
        }
        Ok(resultado)
    }

    pub async fn listar_por_organizacion(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::OrganizacionId.eq(organizacion_id))
            .all(repo.conexion())
            .await?)
    }

    pub async fn listar_por_usuario(
        repo: &dyn PortafolioRepository,
        usuario_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::UsuarioId.eq(usuario_id))
            .all(repo.conexion())
            .await?)
    }

    /// La membresía activa de `usuario_id` en `organizacion_id`, si existe.
    pub async fn buscar_membresia_activa(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        usuario_id: &str,
    ) -> Result<Option<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::OrganizacionId.eq(organizacion_id))
            .filter(Column::UsuarioId.eq(usuario_id))
            .filter(Column::Activo.eq(true))
            .one(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: OrganizacionUsuarioData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            organizacion_id: Set(datos.organizacion_id),
            usuario_id: Set(datos.usuario_id),
            activo: Set(datos.activo),
            created_at: Set(crate::ahora()),
            updated_at: Set(None),
            created_by: Set(creado_por),
            updated_by: Set(None),
        };
        Ok(modelo.insert(repo.conexion()).await?)
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: OrganizacionUsuarioData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("membresía {id}")))?
            .into();
        modelo.organizacion_id = Set(datos.organizacion_id);
        modelo.usuario_id = Set(datos.usuario_id);
        modelo.activo = Set(datos.activo);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(actualizado_por);
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }

    /// Igual que `crear`, pero devuelve la membresía ya combinada con los
    /// datos de la organización — para que el detalle "Organizaciones" de la
    /// vista de usuarios no tenga que volver a pedir la lista completa.
    pub async fn crear_detalle(
        repo: &dyn PortafolioRepository,
        datos: OrganizacionUsuarioData,
        creado_por: String,
    ) -> Result<OrganizacionMembresia, ServiceError> {
        let membresia = Self::crear(repo, datos, creado_por).await?;
        Self::con_organizacion(repo, membresia).await
    }

    /// Igual que `actualizar`, pero devuelve la membresía ya combinada con
    /// los datos de la organización (ver `crear_detalle`).
    pub async fn actualizar_detalle(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: OrganizacionUsuarioData,
        actualizado_por: Option<String>,
    ) -> Result<OrganizacionMembresia, ServiceError> {
        let membresia = Self::actualizar(repo, id, datos, actualizado_por).await?;
        Self::con_organizacion(repo, membresia).await
    }
}
