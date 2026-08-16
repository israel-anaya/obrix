use obrix_db::entities::usuario::{ActiveModel, Column, Entity, Model, RolUsuario};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter,
};

use crate::{nuevo_id, DatosIniciales, ServiceError};

#[derive(serde::Deserialize)]
pub struct UsuarioData {
    pub nombre: String,
    pub correo: String,
    pub rol: RolUsuario,
    pub activo: bool,
}

pub struct UsuarioService;

/// Correo fijo del usuario "sistema" sembrado en cada portafolio nuevo —
/// se usa como atribución de `created_by`/`updated_by` cuando aún no hay
/// otro usuario real que la provea.
pub const CORREO_ADMIN_OBRIX: &str = "admin@obrix.local";

impl UsuarioService {
    /// `usuario` es una identidad global (ver `organizacion_usuario`) — no
    /// cuelga de una organización, así que se listan todos sin filtro.
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .all(repo.conexion())
            .await?)
    }

    /// `correo` es único globalmente (`usuario` no cuelga de una
    /// organización) — usado para resolver el `usuario_id_activo` de la
    /// sesión a partir de la cuenta que inició sesión.
    pub async fn buscar_por_correo(
        repo: &dyn PortafolioRepository,
        correo: &str,
    ) -> Result<Option<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::Correo.eq(correo))
            .one(repo.conexion())
            .await?)
    }

    /// El usuario "sistema" (`admin@obrix.local`) sembrado en cada
    /// portafolio — usado como atribución de `created_by`/`updated_by`
    /// para los primeros usuarios reales que se dan de alta.
    pub async fn buscar_admin_obrix(repo: &dyn PortafolioRepository) -> Result<Model, ServiceError> {
        Self::buscar_por_correo(repo, CORREO_ADMIN_OBRIX)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado("usuario admin sembrado".to_string()))
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: UsuarioData,
        creado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            nombre: Set(datos.nombre),
            correo: Set(datos.correo),
            rol: Set(datos.rol),
            activo: Set(datos.activo),
            created_at: Set(crate::ahora()),
            created_by: Set(creado_por),
            updated_at: Set(None),
            updated_by: Set(None),
        };
        Ok(modelo.insert(repo.conexion()).await?)
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: UsuarioData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("usuario {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.correo = Set(datos.correo);
        modelo.rol = Set(datos.rol);
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

impl DatosIniciales for UsuarioService {
    /// Solo crea el usuario "sistema" (`admin@obrix.local`) — es una
    /// identidad global, no depende de que ya exista una organización. Su
    /// membresía en la organización sembrada se crea aparte, en
    /// `seed::sembrar_catalogos_generales`, una vez que ambas existen.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        Self::crear(
            repo,
            UsuarioData {
                nombre: "Admin".to_string(),
                correo: CORREO_ADMIN_OBRIX.to_string(),
                rol: RolUsuario::Admin,
                activo: true,
            },
            None,
        )
        .await?;
        Ok(())
    }
}
