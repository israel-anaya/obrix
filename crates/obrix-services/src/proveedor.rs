use obrix_db::entities::proveedor::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};

use crate::organizacion::OrganizacionService;
use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

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

/// Proveedores reconocidos de la industria de la construcción en México —
/// cemento, acero, pinturas, recubrimientos, tubería, herramienta y
/// distribución. El RFC genérico (`XAXX010101000`) es el mismo placeholder
/// de "público en general" ya usado en el resto de los datos demo — no se
/// inventan RFCs reales de estas empresas.
const PROVEEDORES_DEMO: &[(&str, &str)] = &[
    ("CEMEX", "5"),
    ("Holcim México", "5"),
    ("Cementos Moctezuma", "4.5"),
    ("Grupo Cementos de Chihuahua (GCC)", "4.5"),
    ("Cementos Fortaleza", "4"),
    ("Deacero", "4.5"),
    ("Ternium México", "5"),
    ("Grupo Simec", "4"),
    ("ArcelorMittal México", "4.5"),
    ("Grupo Collado", "4"),
    ("Comex", "4.5"),
    ("Sika México", "4.5"),
    ("Interceramic", "4"),
    ("Vitromex", "4"),
    ("Orbia (Mexichem)", "4.5"),
    ("Grupo Industrial Saltillo (GIS)", "4"),
    ("Truper", "4.5"),
    ("Pochteca", "4"),
    ("Grupo Cuprum", "4"),
    ("The Home Depot México", "4"),
];

impl DatosIniciales for ProveedorService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let Ok(organizacion) = OrganizacionService::buscar_admin_obrix(repo).await else {
            return Ok(());
        };
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        for (razon_social, calificacion) in PROVEEDORES_DEMO {
            Self::crear(
                repo,
                &organizacion.id,
                ProveedorData {
                    razon_social: razon_social.to_string(),
                    rfc: "XAXX010101000".to_string(),
                    contacto: None,
                    calificacion: Some(calificacion.to_string()),
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}
