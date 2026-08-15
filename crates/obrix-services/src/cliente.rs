use obrix_db::entities::cliente::{ActiveModel, Column, Entity, Model, TipoCliente};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};

use crate::organizacion::OrganizacionService;
use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

#[derive(serde::Deserialize)]
pub struct ClienteData {
    pub razon_social: String,
    pub rfc: String,
    pub tipo: TipoCliente,
    pub contacto_nombre: Option<String>,
    pub contacto_correo: Option<String>,
    pub contacto_telefono: Option<String>,
    pub domicilio_fiscal: Option<String>,
}

pub struct ClienteService;

impl ClienteService {
    pub async fn listar(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::OrganizacionId.eq(organizacion_id))
            .filter(Column::Deleted.eq(false))
            .order_by_asc(Column::RazonSocial)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: ClienteData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            organizacion_id: Set(organizacion_id.to_string()),
            razon_social: Set(datos.razon_social),
            rfc: Set(datos.rfc),
            tipo: Set(datos.tipo),
            contacto_nombre: Set(datos.contacto_nombre),
            contacto_correo: Set(datos.contacto_correo),
            contacto_telefono: Set(datos.contacto_telefono),
            domicilio_fiscal: Set(datos.domicilio_fiscal),
            deleted: Set(false),
            created_at: Set(crate::ahora()),
            created_by: Set(creado_por),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        };
        Ok(modelo.insert(repo.conexion()).await?)
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: ClienteData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cliente {id}")))?
            .into();
        modelo.razon_social = Set(datos.razon_social);
        modelo.rfc = Set(datos.rfc);
        modelo.tipo = Set(datos.tipo);
        modelo.contacto_nombre = Set(datos.contacto_nombre);
        modelo.contacto_correo = Set(datos.contacto_correo);
        modelo.contacto_telefono = Set(datos.contacto_telefono);
        modelo.domicilio_fiscal = Set(datos.domicilio_fiscal);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(actualizado_por);
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .filter(Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cliente {id}")))?
            .into();
        modelo.deleted = Set(true);
        modelo.deleted_at = Set(Some(crate::ahora()));
        modelo.deleted_by = Set(Some(eliminado_por));
        modelo.update(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for ClienteService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let Ok(organizacion) = OrganizacionService::buscar_admin_obrix(repo).await else {
            return Ok(());
        };
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        Self::crear(
            repo,
            &organizacion.id,
            ClienteData {
                razon_social: "ClienteData demo".to_string(),
                rfc: "XAXX010101000".to_string(),
                tipo: TipoCliente::Privado,
                contacto_nombre: None,
                contacto_correo: None,
                contacto_telefono: None,
                domicilio_fiscal: None,
            },
            admin.id,
        )
        .await?;
        Ok(())
    }
}
