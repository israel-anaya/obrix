use obrix_db::PortafolioRepository;
use obrix_db::entities::moneda::{ActiveModel, Column, Entity, Model};
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};

use crate::usuario::UsuarioService;
use crate::{DatosIniciales, ServiceError, nuevo_id};

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
    /// Validación de `MonedaData` común a `crear`/`actualizar` —
    /// `actualizando` distingue alta de edición por si una regla futura solo
    /// aplica a uno de los dos casos.
    fn validar(datos: &MonedaData, actualizando: bool) -> Result<(), ServiceError> {
        let accion = crate::accion(actualizando);
        if datos.codigo.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una moneda sin código."
            )));
        }
        if datos.nombre.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una moneda sin nombre."
            )));
        }
        if datos.simbolo.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una moneda sin símbolo."
            )));
        }
        if !(0..=6).contains(&datos.decimales) {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una moneda con decimales fuera del rango 0-6."
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
        datos: MonedaData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        Self::validar(&datos, false)?;
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
        Self::validar(&datos, true)?;
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
            let registro = registro
                .map_err(|e| ServiceError::Validacion(format!("moneda.csv fila {fila}: {e}")))?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn datos(codigo: &str, nombre: &str, simbolo: &str, decimales: i32) -> MonedaData {
        MonedaData {
            codigo: codigo.to_string(),
            nombre: nombre.to_string(),
            simbolo: simbolo.to_string(),
            decimales,
        }
    }

    #[test]
    fn validar_rechaza_codigo_vacio_o_solo_espacios() {
        assert!(MonedaService::validar(&datos("", "Peso mexicano", "$", 2), false).is_err());
        assert!(MonedaService::validar(&datos("   ", "Peso mexicano", "$", 2), true).is_err());
    }

    #[test]
    fn validar_rechaza_nombre_vacio() {
        assert!(MonedaService::validar(&datos("MXN", "", "$", 2), false).is_err());
    }

    #[test]
    fn validar_rechaza_simbolo_vacio() {
        assert!(MonedaService::validar(&datos("MXN", "Peso mexicano", "", 2), false).is_err());
    }

    #[test]
    fn validar_rechaza_decimales_fuera_de_rango() {
        assert!(MonedaService::validar(&datos("MXN", "Peso mexicano", "$", -1), false).is_err());
        assert!(MonedaService::validar(&datos("MXN", "Peso mexicano", "$", 7), false).is_err());
    }

    #[test]
    fn validar_acepta_decimales_en_los_extremos_del_rango() {
        assert!(MonedaService::validar(&datos("MXN", "Peso mexicano", "$", 0), false).is_ok());
        assert!(MonedaService::validar(&datos("MXN", "Peso mexicano", "$", 6), false).is_ok());
    }

    #[test]
    fn validar_acepta_datos_completos() {
        assert!(MonedaService::validar(&datos("MXN", "Peso mexicano", "$", 2), false).is_ok());
    }
}
