use obrix_db::entities::{
    moneda,
    organizacion::{ActiveModel, Column, Entity, Model, TipoOrganizacion},
};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};

use crate::organizacion_usuario::OrganizacionUsuarioService;
use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

#[derive(serde::Deserialize)]
pub struct OrganizacionData {
    pub razon_social: String,
    pub rfc: String,
    pub tipo: TipoOrganizacion,
    pub moneda_default_id: String,
}

pub struct OrganizacionService;

impl OrganizacionService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .order_by_asc(Column::RazonSocial)
            .all(repo.conexion())
            .await?)
    }

    /// Organizaciones donde `usuario_id` tiene membresía activa — usado para
    /// poblar el selector de organización activa en el sidebar.
    pub async fn listar_por_usuario(
        repo: &dyn PortafolioRepository,
        usuario_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        let membresias = OrganizacionUsuarioService::listar_por_usuario(repo, usuario_id).await?;
        let ids: Vec<String> = membresias
            .into_iter()
            .filter(|m| m.activo)
            .map(|m| m.organizacion_id)
            .collect();
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        Ok(Entity::find()
            .filter(Column::Id.is_in(ids))
            .order_by_asc(Column::RazonSocial)
            .all(repo.conexion())
            .await?)
    }

    pub async fn buscar_por_id(
        repo: &dyn PortafolioRepository,
        id: &str,
    ) -> Result<Model, ServiceError> {
        Entity::find_by_id(id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("organización {id}")))
    }

    /// La organización sembrada por el usuario "sistema" (`admin@obrix.local`)
    /// — es decir, la organización demo creada junto con el portafolio.
    pub async fn buscar_admin_obrix(repo: &dyn PortafolioRepository) -> Result<Model, ServiceError> {
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        Entity::find()
            .filter(Column::CreatedBy.eq(admin.id))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado("organización sembrada".to_string()))
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: OrganizacionData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            razon_social: Set(datos.razon_social),
            rfc: Set(datos.rfc),
            tipo: Set(datos.tipo),
            moneda_default_id: Set(datos.moneda_default_id),
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
        datos: OrganizacionData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("organización {id}")))?
            .into();
        modelo.razon_social = Set(datos.razon_social);
        modelo.rfc = Set(datos.rfc);
        modelo.tipo = Set(datos.tipo);
        modelo.moneda_default_id = Set(datos.moneda_default_id);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(actualizado_por);
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for OrganizacionService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        // `moneda` ya se sembró antes que `organizacion` (ver orden en
        // `seed::sembrar_catalogos_generales`), así que MXN ya existe aquí.
        let mxn = moneda::Entity::find()
            .filter(moneda::Column::Codigo.eq("MXN"))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado("moneda MXN (debe sembrarse antes que organizacion)".to_string()))?;
        Self::crear(
            repo,
            OrganizacionData {
                razon_social: "Despacho demo".to_string(),
                rfc: "XAXX010101000".to_string(),
                tipo: TipoOrganizacion::Despacho,
                moneda_default_id: mxn.id,
            },
            admin.id,
        )
        .await?;
        Ok(())
    }
}
