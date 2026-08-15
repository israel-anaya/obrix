use obrix_db::entities::region::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

/// Catálogo de regiones de referencia — fuente de verdad en
/// `data/initial/region.csv`, embebido tal cual en el binario.
const REGIONES_CSV: &str = include_str!("../../../data/initial/region.csv");

#[derive(serde::Deserialize)]
pub struct RegionData {
    pub nombre: String,
    pub estado: String,
    pub factor_ajuste: Option<String>,
}

pub struct RegionService;

impl RegionService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::Deleted.eq(false))
            .order_by_asc(Column::Nombre)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: RegionData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            nombre: Set(datos.nombre),
            estado: Set(datos.estado),
            factor_ajuste: Set(datos.factor_ajuste),
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
        datos: RegionData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("región {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.estado = Set(datos.estado);
        modelo.factor_ajuste = Set(datos.factor_ajuste);
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
            .ok_or_else(|| ServiceError::NoEncontrado(format!("región {id}")))?
            .into();
        modelo.deleted = Set(true);
        modelo.deleted_at = Set(Some(crate::ahora()));
        modelo.deleted_by = Set(Some(eliminado_por));
        modelo.update(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for RegionService {
    /// Una región por cada fila de `data/initial/region.csv`.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let mut lector = csv::ReaderBuilder::new().from_reader(REGIONES_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvRegion>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!("region.csv fila {fila}: {e}"))
            })?;
            let nombre = registro.nombre.trim().to_string();
            if nombre.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "region.csv fila {fila}: nombre vacío"
                )));
            }
            Self::crear(
                repo,
                RegionData {
                    nombre,
                    estado: registro.estado.trim().to_string(),
                    factor_ajuste: None,
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvRegion {
    #[serde(rename = "Nombre")]
    nombre: String,
    #[serde(rename = "Estado")]
    estado: String,
}
