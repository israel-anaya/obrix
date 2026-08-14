use obrix_db::entities::proveedor::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};

use crate::organizacion::OrganizacionService;
use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

/// Proveedores de referencia de la industria de la construcción en México.
/// Fuente de verdad en `data/initial/proveedor.csv`, embebido tal cual en el
/// binario. El RFC genérico (`XAXX010101000`) es el placeholder de "público
/// en general" — no se inventan RFCs reales de estas empresas.
const PROVEEDORES_CSV: &str = include_str!("../../../data/initial/proveedor.csv");

#[derive(serde::Deserialize)]
pub struct ProveedorData {
    pub razon_social: String,
    pub rfc: String,
    pub contacto: Option<String>,
    pub calificacion: Option<String>,
}

pub struct ProveedorService;

impl ProveedorService {
    pub async fn listar(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::OrganizacionId.eq(organizacion_id))
            .order_by_asc(Column::RazonSocial)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: ProveedorData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            organizacion_id: Set(organizacion_id.to_string()),
            razon_social: Set(datos.razon_social),
            rfc: Set(datos.rfc),
            contacto: Set(datos.contacto),
            calificacion: Set(datos.calificacion),
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
        datos: ProveedorData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("proveedor {id}")))?
            .into();
        modelo.razon_social = Set(datos.razon_social);
        modelo.rfc = Set(datos.rfc);
        modelo.contacto = Set(datos.contacto);
        modelo.calificacion = Set(datos.calificacion);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(actualizado_por);
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvProveedor {
    #[serde(rename = "Razón social")]
    razon_social: String,
    #[serde(rename = "Calificación")]
    calificacion: String,
}

impl DatosIniciales for ProveedorService {
    /// Un proveedor por cada fila de `data/initial/proveedor.csv`.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let Ok(organizacion) = OrganizacionService::buscar_admin_obrix(repo).await else {
            return Ok(());
        };
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let mut lector = csv::ReaderBuilder::new().from_reader(PROVEEDORES_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvProveedor>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!("proveedor.csv fila {fila}: {e}"))
            })?;
            let razon_social = registro.razon_social.trim().to_string();
            if razon_social.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "proveedor.csv fila {fila}: razón social vacía"
                )));
            }
            let calificacion = registro.calificacion.trim().to_string();
            Self::crear(
                repo,
                &organizacion.id,
                ProveedorData {
                    razon_social,
                    rfc: "XAXX010101000".to_string(),
                    contacto: None,
                    calificacion: if calificacion.is_empty() {
                        None
                    } else {
                        Some(calificacion)
                    },
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}
