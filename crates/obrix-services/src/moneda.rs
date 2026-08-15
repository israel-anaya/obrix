use obrix_db::entities::moneda::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

/// Catálogo de monedas de referencia — fuente de verdad en
/// `data/initial/moneda.csv`, embebido tal cual en el binario.
const MONEDAS_CSV: &str = include_str!("../../../data/initial/moneda.csv");

#[derive(serde::Deserialize)]
pub struct MonedaData {
    pub codigo: String,
    pub nombre: String,
    pub simbolo: String,
    pub decimales: i32,
}

pub struct MonedaService;

impl MonedaService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::Deleted.eq(false))
            .order_by_asc(Column::Codigo)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: MonedaData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            codigo: Set(datos.codigo),
            nombre: Set(datos.nombre),
            simbolo: Set(datos.simbolo),
            decimales: Set(datos.decimales),
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
        datos: MonedaData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("moneda {id}")))?
            .into();
        modelo.codigo = Set(datos.codigo);
        modelo.nombre = Set(datos.nombre);
        modelo.simbolo = Set(datos.simbolo);
        modelo.decimales = Set(datos.decimales);
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
            .ok_or_else(|| ServiceError::NoEncontrado(format!("moneda {id}")))?
            .into();
        modelo.deleted = Set(true);
        modelo.deleted_at = Set(Some(crate::ahora()));
        modelo.deleted_by = Set(Some(eliminado_por));
        modelo.update(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for MonedaService {
    /// Una moneda por cada fila de `data/initial/moneda.csv`.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let mut lector = csv::ReaderBuilder::new().from_reader(MONEDAS_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvMoneda>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!("moneda.csv fila {fila}: {e}"))
            })?;
            let codigo = registro.codigo.trim().to_string();
            if codigo.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "moneda.csv fila {fila}: código vacío"
                )));
            }
            Self::crear(
                repo,
                MonedaData {
                    codigo,
                    nombre: registro.nombre.trim().to_string(),
                    simbolo: registro.simbolo.trim().to_string(),
                    decimales: registro.decimales,
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvMoneda {
    #[serde(rename = "Código")]
    codigo: String,
    #[serde(rename = "Nombre")]
    nombre: String,
    #[serde(rename = "Símbolo")]
    simbolo: String,
    #[serde(rename = "Decimales")]
    decimales: i32,
}
