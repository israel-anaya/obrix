use obrix_db::entities::categoria_fsr::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait, QueryOrder};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

#[derive(serde::Deserialize)]
pub struct CategoriaFsrData {
    pub nombre: String,
}

pub struct CategoriaFsrService;

impl CategoriaFsrService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .order_by_asc(Column::Nombre)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: CategoriaFsrData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            nombre: Set(datos.nombre),
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
        datos: CategoriaFsrData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("categoría FSR {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(actualizado_por);
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

/// Categorías de mano de obra en construcción — ver `data/categorias.csv`.
const CATEGORIAS_DEMO: &[&str] = &[
    "Aluminero",
    "Auxiliar topógrafo",
    "Ayudante de instalación",
    "Ayudante oficial",
    "Cabo de ayudantes",
    "Cabo de oficios",
    "Cadenero",
    "Carpintero de banco",
    "Carpintero de obra negra",
    "Herrero de campo",
    "Oficial albañil",
    "Oficial azulejero",
    "Oficial colocador",
    "Oficial electricista",
    "Oficial fierrero",
    "Oficial pintor",
    "Oficial plomero",
    "Oficial vidriero",
    "Oficial yesero",
    "Operador de camión",
    "Operador de cargador",
    "Operador de carpeteador",
    "Operador de duo-pactor",
    "Operador de equipo ligero",
    "Operador de motoconformadora",
    "Operador de petrolizadora",
    "Operador de plancha",
    "Operador de retroexcavadora",
    "Operador de tractor",
    "Operador de vehículo con grúa",
    "Rastrillero",
    "Tornillero",
    "Tubero",
];

impl DatosIniciales for CategoriaFsrService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        for nombre in CATEGORIAS_DEMO {
            Self::crear(
                repo,
                CategoriaFsrData { nombre: nombre.to_string() },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}
