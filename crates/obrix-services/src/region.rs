use obrix_db::PortafolioRepository;
use obrix_db::entities::region::{ActiveModel, Column, Entity, Model};
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};

use crate::usuario::UsuarioService;
use crate::{DatosIniciales, ServiceError, nuevo_id};

/// Catálogo de regiones de referencia — fuente de verdad en
/// `data/initial/region.csv`, embebido tal cual en el binario.
const REGIONES_CSV: &str = include_str!("../../../data/initial/region.csv");

#[derive(serde::Deserialize)]
pub struct RegionData {
    pub nombre: String,
    pub estado: String,
    pub factor_ajuste: Option<String>,
    pub visible: bool,
}

pub struct RegionService;

impl RegionService {
    /// Validación de `RegionData` común a `crear`/`actualizar` —
    /// `actualizando` distingue alta de edición por si una regla futura solo
    /// aplica a uno de los dos casos.
    fn validar(datos: &RegionData, actualizando: bool) -> Result<(), ServiceError> {
        let accion = crate::accion(actualizando);
        if datos.nombre.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una región sin nombre."
            )));
        }
        if datos.estado.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una región sin estado."
            )));
        }
        Ok(())
    }

    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: RegionData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        Self::validar(&datos, false)?;
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            nombre: Set(datos.nombre),
            estado: Set(datos.estado),
            factor_ajuste: Set(datos.factor_ajuste),
            visible: Set(datos.visible),
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
        Self::validar(&datos, true)?;
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("región {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.estado = Set(datos.estado);
        modelo.factor_ajuste = Set(datos.factor_ajuste);
        modelo.visible = Set(datos.visible);
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
            let registro = registro
                .map_err(|e| ServiceError::Validacion(format!("region.csv fila {fila}: {e}")))?;
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
                    visible: registro.visible,
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
    #[serde(rename = "Visible")]
    visible: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn datos(nombre: &str, estado: &str) -> RegionData {
        RegionData {
            nombre: nombre.to_string(),
            estado: estado.to_string(),
            factor_ajuste: None,
            visible: true,
        }
    }

    #[test]
    fn validar_rechaza_nombre_vacio_o_solo_espacios() {
        assert!(RegionService::validar(&datos("", "Jalisco"), false).is_err());
        assert!(RegionService::validar(&datos("   ", "Jalisco"), true).is_err());
    }

    #[test]
    fn validar_rechaza_estado_vacio() {
        assert!(RegionService::validar(&datos("Occidente", ""), false).is_err());
    }

    #[test]
    fn validar_acepta_datos_completos() {
        assert!(RegionService::validar(&datos("Occidente", "Jalisco"), false).is_ok());
    }

    #[test]
    fn validar_acepta_region_oculta() {
        let mut oculta = datos("Occidente", "Jalisco");
        oculta.visible = false;
        assert!(RegionService::validar(&oculta, false).is_ok());
    }
}
