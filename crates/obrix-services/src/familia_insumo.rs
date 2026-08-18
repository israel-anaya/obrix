use obrix_db::PortafolioRepository;
use obrix_db::entities::familia_insumo::{ActiveModel, Column, Entity, Model};
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};

use crate::usuario::UsuarioService;
use crate::{DatosIniciales, ServiceError, nuevo_id};

/// Árbol de familias de insumo de referencia — fuente de verdad en
/// `data/initial/familia_insumo.csv`, embebido tal cual en el binario.
const FAMILIAS_CSV: &str = include_str!("../../../data/initial/familia_insumo.csv");

#[derive(serde::Deserialize)]
pub struct FamiliaInsumoData {
    pub nombre: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub insumos_asociados: Option<String>,
    #[serde(default)]
    pub icono: Option<String>,
}

pub struct FamiliaInsumoService;

impl FamiliaInsumoService {
    /// Validación de `FamiliaInsumoData` común a `crear`/`actualizar` —
    /// `actualizando` distingue alta de edición por si una regla futura solo
    /// aplica a uno de los dos casos.
    fn validar(datos: &FamiliaInsumoData, actualizando: bool) -> Result<(), ServiceError> {
        if datos.nombre.trim().is_empty() {
            let accion = crate::accion(actualizando);
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una familia de insumo sin nombre."
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
        datos: FamiliaInsumoData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        Self::validar(&datos, false)?;
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            parent_id: Set(datos.parent_id),
            nombre: Set(datos.nombre),
            insumos_asociados: Set(datos.insumos_asociados),
            icono: Set(datos.icono),
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
        datos: FamiliaInsumoData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        Self::validar(&datos, true)?;
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("familia de insumo {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.insumos_asociados = Set(datos.insumos_asociados);
        modelo.icono = Set(datos.icono);
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
            .ok_or_else(|| ServiceError::NoEncontrado(format!("familia de insumo {id}")))?
            .into();
        modelo.deleted = Set(true);
        modelo.deleted_at = Set(Some(crate::ahora()));
        modelo.deleted_by = Set(Some(eliminado_por));
        modelo.update(repo.conexion()).await?;
        Ok(())
    }

    async fn crear_hija(
        repo: &dyn PortafolioRepository,
        parent_id: &str,
        nombre: &str,
        insumos_asociados: Option<String>,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            parent_id: Set(Some(parent_id.to_string())),
            nombre: Set(nombre.to_string()),
            insumos_asociados: Set(insumos_asociados),
            icono: Set(None),
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
}

impl DatosIniciales for FamiliaInsumoService {
    /// Un padre por cada valor distinto de `Familia` y una hija por cada
    /// fila de `data/initial/familia_insumo.csv`.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let mut padre_id_por_nombre: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        let mut icono_por_familia: std::collections::HashMap<String, Option<String>> =
            std::collections::HashMap::new();
        let mut lector = csv::ReaderBuilder::new().from_reader(FAMILIAS_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvFamilia>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!("familia_insumo.csv fila {fila}: {e}"))
            })?;
            let familia = registro.familia.trim().to_string();
            let subfamilia = registro.subfamilia.trim().to_string();
            if familia.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "familia_insumo.csv fila {fila}: familia vacía"
                )));
            }
            if subfamilia.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "familia_insumo.csv fila {fila}: subfamilia vacía"
                )));
            }
            let icono = {
                let t = registro.icono.trim();
                (!t.is_empty()).then(|| t.to_string())
            };
            let padre_id = if let Some(id) = padre_id_por_nombre.get(&familia) {
                let previo = icono_por_familia.get(&familia).cloned().flatten();
                if icono.is_some() && icono != previo {
                    return Err(ServiceError::Validacion(format!(
                        "familia_insumo.csv fila {fila}: Icono distinto para la familia `{familia}`"
                    )));
                }
                id.clone()
            } else {
                let padre = Self::crear(
                    repo,
                    FamiliaInsumoData {
                        nombre: familia.clone(),
                        parent_id: None,
                        insumos_asociados: None,
                        icono: icono.clone(),
                    },
                    admin.id.clone(),
                )
                .await?;
                padre_id_por_nombre.insert(familia.clone(), padre.id.clone());
                icono_por_familia.insert(familia, icono);
                padre.id
            };
            let insumos_asociados = registro.insumos_asociados.trim().to_string();
            Self::crear_hija(
                repo,
                &padre_id,
                &subfamilia,
                (!insumos_asociados.is_empty()).then_some(insumos_asociados),
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvFamilia {
    #[serde(rename = "Familia")]
    familia: String,
    #[serde(rename = "Subfamilia")]
    subfamilia: String,
    #[serde(rename = "Insumos_asociados")]
    insumos_asociados: String,
    #[serde(rename = "Icono", default)]
    icono: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn datos(nombre: &str) -> FamiliaInsumoData {
        FamiliaInsumoData {
            nombre: nombre.to_string(),
            parent_id: None,
            insumos_asociados: None,
            icono: None,
        }
    }

    #[test]
    fn validar_rechaza_nombre_vacio_o_solo_espacios() {
        assert!(FamiliaInsumoService::validar(&datos(""), false).is_err());
        assert!(FamiliaInsumoService::validar(&datos("   "), true).is_err());
    }

    #[test]
    fn validar_acepta_nombre_no_vacio() {
        assert!(FamiliaInsumoService::validar(&datos("Materiales eléctricos"), false).is_ok());
    }
}
