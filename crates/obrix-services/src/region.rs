use obrix_db::entities::region::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait, QueryOrder};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

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

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for RegionService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let regiones = [
            ("Zona Metropolitana CDMX", "Ciudad de México"),
            ("Frontera Norte", "Baja California"),
            ("Sureste", "Quintana Roo"),
        ];
        for (nombre, estado) in regiones {
            Self::crear(
                repo,
                RegionData {
                    nombre: nombre.to_string(),
                    estado: estado.to_string(),
                    factor_ajuste: None,
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}
