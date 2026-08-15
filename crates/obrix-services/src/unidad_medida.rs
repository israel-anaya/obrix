use obrix_db::entities::unidad_medida::{ActiveModel, Column, Entity, Model, TipoMagnitud};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

/// Catálogo de unidades de medida de referencia — fuente de verdad en
/// `data/initial/unidad_medida.csv`, embebido tal cual en el binario.
const UNIDADES_CSV: &str = include_str!("../../../data/initial/unidad_medida.csv");

#[derive(serde::Deserialize)]
pub struct UnidadMedidaData {
    pub simbolo: String,
    pub simbolo_impresion: String,
    pub variantes: String,
    pub clave_sat: Option<String>,
    pub descripcion: String,
    pub tipo_magnitud: TipoMagnitud,
}

pub struct UnidadMedidaService;

impl UnidadMedidaService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::Deleted.eq(false))
            .order_by_asc(Column::Simbolo)
            .all(repo.conexion())
            .await?)
    }

    /// Grafías equivalentes de una unidad, en minúsculas.
    /// Expande `simbolo`, `simbolo_impresion`, `descripcion` y el campo
    /// `variantes` (separado por comas). No consulta la base: el import
    /// carga las filas y con esta lista arma el mapa token → id.
    pub fn variantes(unidad: &Model) -> Vec<String> {
        std::iter::once(unidad.simbolo.as_str())
            .chain(std::iter::once(unidad.simbolo_impresion.as_str()))
            .chain(std::iter::once(unidad.descripcion.as_str()))
            .chain(unidad.variantes.split(','))
            .map(|t| t.trim().to_lowercase())
            .filter(|t| !t.is_empty())
            .collect()
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: UnidadMedidaData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            simbolo: Set(datos.simbolo),
            simbolo_impresion: Set(datos.simbolo_impresion),
            variantes: Set(datos.variantes),
            clave_sat: Set(datos.clave_sat),
            descripcion: Set(datos.descripcion),
            tipo_magnitud: Set(datos.tipo_magnitud),
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
        datos: UnidadMedidaData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("unidad de medida {id}")))?
            .into();
        modelo.simbolo = Set(datos.simbolo);
        modelo.simbolo_impresion = Set(datos.simbolo_impresion);
        modelo.variantes = Set(datos.variantes);
        modelo.clave_sat = Set(datos.clave_sat);
        modelo.descripcion = Set(datos.descripcion);
        modelo.tipo_magnitud = Set(datos.tipo_magnitud);
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
            .ok_or_else(|| ServiceError::NoEncontrado(format!("unidad de medida {id}")))?
            .into();
        modelo.deleted = Set(true);
        modelo.deleted_at = Set(Some(crate::ahora()));
        modelo.deleted_by = Set(Some(eliminado_por));
        modelo.update(repo.conexion()).await?;
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvUnidad {
    #[serde(rename = "Símbolo")]
    simbolo: String,
    #[serde(rename = "Símbolo impresión")]
    simbolo_impresion: String,
    #[serde(rename = "Variantes")]
    variantes: String,
    #[serde(rename = "Clave SAT")]
    clave_sat: Option<String>,
    #[serde(rename = "Descripción")]
    descripcion: String,
    #[serde(rename = "Tipo magnitud")]
    tipo_magnitud: TipoMagnitud,
}

impl DatosIniciales for UnidadMedidaService {
    /// Una unidad por cada fila de `data/initial/unidad_medida.csv`.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let mut lector = csv::ReaderBuilder::new().from_reader(UNIDADES_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvUnidad>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!("unidad_medida.csv fila {fila}: {e}"))
            })?;
            let simbolo = registro.simbolo.trim().to_string();
            if simbolo.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "unidad_medida.csv fila {fila}: símbolo vacío"
                )));
            }
            Self::crear(
                repo,
                UnidadMedidaData {
                    simbolo,
                    simbolo_impresion: registro.simbolo_impresion.trim().to_string(),
                    variantes: registro.variantes,
                    clave_sat: registro
                        .clave_sat
                        .map(|c| c.trim().to_string())
                        .filter(|c| !c.is_empty()),
                    descripcion: registro.descripcion.trim().to_string(),
                    tipo_magnitud: registro.tipo_magnitud,
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn variantes_incluye_grafias_separadas_por_coma() {
        let unidad = Model {
            id: "u1".into(),
            simbolo: "pieza".into(),
            simbolo_impresion: "pza".into(),
            variantes: "pieza, pza".into(),
            clave_sat: None,
            descripcion: "Pieza".into(),
            tipo_magnitud: TipoMagnitud::Pieza,
            deleted: false,
            created_at: String::new(),
            created_by: String::new(),
            updated_at: None,
            updated_by: None,
            deleted_at: None,
            deleted_by: None,
        };
        let grafias = UnidadMedidaService::variantes(&unidad);
        assert!(grafias.contains(&"pieza".into()));
        assert!(grafias.contains(&"pza".into()));
    }

    #[test]
    fn primera_variante_es_el_simbolo() {
        let mut lector = csv::ReaderBuilder::new().from_reader(UNIDADES_CSV.as_bytes());
        for registro in lector.deserialize::<RegistroCsvUnidad>() {
            let registro = registro.expect("parsear unidad_medida.csv");
            let primera = registro.variantes.split(',').next().map(str::trim);
            assert_eq!(
                primera,
                Some(registro.simbolo.trim()),
                "{}",
                registro.simbolo
            );
        }
    }
}
