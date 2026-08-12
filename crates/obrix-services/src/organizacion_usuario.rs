//! Membresía: qué organizaciones puede ver un usuario (identidad global, ver
//! `usuario`). Solo capa de servicio por ahora — sin comando de Tauri ni UI
//! todavía; hoy se usa internamente para resolver `usuario_id_activo`.

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

pub struct OrganizacionUsuarioService;

impl OrganizacionUsuarioService {
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
}
