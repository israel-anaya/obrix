use obrix_db::entities::moneda::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait, QueryOrder};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

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
        Ok(Entity::find().order_by_asc(Column::Codigo).all(repo.conexion()).await?)
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

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for MonedaService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let monedas = [
            ("MXN", "Peso mexicano", "$", 2),
            ("USD", "Dólar estadounidense", "US$", 2),
        ];
        for (codigo, nombre, simbolo, decimales) in monedas {
            Self::crear(
                repo,
                MonedaData {
                    codigo: codigo.to_string(),
                    nombre: nombre.to_string(),
                    simbolo: simbolo.to_string(),
                    decimales,
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}
