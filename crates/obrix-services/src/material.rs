//! `material` es una extensión 1:1 de `insumo` (ver diccionario de datos) —
//! este servicio administra ambas tablas juntas como si fueran una sola
//! entidad "Material", porque hoy es el único tipo de insumo implementado.
//! Cuando se agreguen mano_obra/equipo_herramienta/basico_auxiliar, `insumo`
//! deberá separarse en su propio servicio reutilizable.

use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{material, moneda, organizacion};
use obrix_db::PortafolioRepository;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter,
    TransactionTrait,
};

use crate::precio_material::{PrecioMaterialData, PrecioMaterialService};
use crate::unidad_medida::UnidadMedidaService;
use crate::{id_insumo_existente, nuevo_id, recordar_insumo, ServiceError};
use std::collections::HashMap;

#[derive(serde::Deserialize)]
pub struct MaterialData {
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    /// Debe ser hija (`parent_id`) de `familia_id` — no se valida aquí, el
    /// frontend ya restringe las opciones mostradas a los hijos de la familia elegida.
    pub sub_familia_id: Option<String>,
    pub proveedor_id: Option<String>,
    pub merma_porcentaje: Option<i32>,
    pub marca: Option<String>,
}

/// `insumo` + `material` combinados en una sola fila — así es como lo ve el
/// frontend, que no necesita saber que internamente son dos tablas.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MaterialCompleto {
    pub id: String,
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    pub proveedor_id: Option<String>,
    pub merma_porcentaje: Option<i32>,
    pub marca: Option<String>,
    /// Precio nacional vigente (`precio_material`, `region_id` nulo) — `None`
    /// si nunca se le ha registrado un precio.
    pub precio_vigente: Option<Decimal>,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

fn combinar(insumo: insumo::Model, material: material::Model, precio_vigente: Option<Decimal>) -> MaterialCompleto {
    MaterialCompleto {
        id: insumo.id,
        clave: insumo.clave,
        descripcion: insumo.descripcion,
        unidad_id: insumo.unidad_id,
        familia_id: insumo.familia_id,
        sub_familia_id: insumo.sub_familia_id,
        proveedor_id: material.proveedor_id,
        merma_porcentaje: material.merma_porcentaje,
        marca: material.marca,
        precio_vigente,
        created_at: insumo.created_at,
        created_by: insumo.created_by,
        updated_at: insumo.updated_at,
        updated_by: insumo.updated_by,
    }
}

/// Código de la moneda default de una organización (p. ej. "MXN") — el
/// "costo actual" de un material solo debe considerar precios vigentes
/// capturados en esa moneda; `None` solo si la organización o su moneda ya
/// no existen (no debería pasar, `moneda_default_id` es requerido).
async fn moneda_default_organizacion(
    repo: &dyn PortafolioRepository,
    organizacion_id: &str,
) -> Result<Option<String>, ServiceError> {
    let Some(org) = organizacion::Entity::find_by_id(organizacion_id)
        .one(repo.conexion())
        .await?
    else {
        return Ok(None);
    };
    Ok(moneda::Entity::find_by_id(&org.moneda_default_id)
        .one(repo.conexion())
        .await?
        .map(|m| m.codigo))
}

pub struct MaterialService;

impl MaterialService {
    /// Validación de `MaterialData` común a `crear`/`actualizar` —
    /// `actualizando` distingue alta de edición por si una regla futura solo
    /// aplica a uno de los dos casos.
    fn validar(datos: &MaterialData, actualizando: bool) -> Result<(), ServiceError> {
        let accion = crate::accion(actualizando);
        if datos.clave.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un material sin clave."
            )));
        }
        if datos.descripcion.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un material sin descripción."
            )));
        }
        if datos.unidad_id.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un material sin unidad."
            )));
        }
        crate::validar_opcionales_no_vacios(&[
            (&datos.familia_id, "familia_id"),
            (&datos.sub_familia_id, "sub_familia_id"),
            (&datos.proveedor_id, "proveedor_id"),
        ])?;
        Ok(())
    }

    pub async fn listar(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
    ) -> Result<Vec<MaterialCompleto>, ServiceError> {
        let moneda_default = moneda_default_organizacion(repo, organizacion_id).await?;

        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::Material))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;

        let mut resultado = Vec::with_capacity(insumos.len());
        for ins in insumos {
            let Some(mat) = material::Entity::find_by_id(&ins.id)
                .one(repo.conexion())
                .await?
            else {
                // No debería pasar (la extensión se crea siempre junto con el
                // insumo) — se omite en vez de reventar el listado completo.
                continue;
            };
            let precio = match &moneda_default {
                Some(codigo) => PrecioMaterialService::vigente_nacional(repo, &ins.id, codigo)
                    .await?
                    .map(|p| p.precio),
                None => None,
            };
            resultado.push(combinar(ins, mat, precio));
        }
        Ok(resultado)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: MaterialData,
        creado_por: String,
    ) -> Result<MaterialCompleto, ServiceError> {
        Self::validar(&datos, false)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        crate::validar_proveedor_existe(repo, &datos.proveedor_id).await?;
        let txn = repo.conexion().begin().await?;
        let id = nuevo_id();
        let ahora = crate::ahora();

        let ins = insumo::ActiveModel {
            id: Set(id.clone()),
            organizacion_id: Set(organizacion_id.to_string()),
            clave: Set(datos.clave),
            tipo: Set(TipoInsumo::Material),
            descripcion: Set(datos.descripcion),
            unidad_id: Set(datos.unidad_id),
            familia_id: Set(datos.familia_id),
            sub_familia_id: Set(datos.sub_familia_id),
            deleted: Set(false),
            created_at: Set(ahora),
            created_by: Set(creado_por),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(&txn)
        .await?;

        let mat = material::ActiveModel {
            insumo_id: Set(id),
            proveedor_id: Set(datos.proveedor_id),
            merma_porcentaje: Set(datos.merma_porcentaje),
            marca: Set(datos.marca),
        }
        .insert(&txn)
        .await?;

        txn.commit().await?;
        Ok(combinar(ins, mat, None))
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: MaterialData,
        actualizado_por: Option<String>,
    ) -> Result<MaterialCompleto, ServiceError> {
        Self::validar(&datos, true)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        crate::validar_proveedor_existe(repo, &datos.proveedor_id).await?;
        let txn = repo.conexion().begin().await?;
        let ahora = crate::ahora();

        let mut ins: insumo::ActiveModel = insumo::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("material {id}")))?
            .into();
        ins.clave = Set(datos.clave);
        ins.descripcion = Set(datos.descripcion);
        ins.unidad_id = Set(datos.unidad_id);
        ins.familia_id = Set(datos.familia_id);
        ins.sub_familia_id = Set(datos.sub_familia_id);
        ins.updated_at = Set(Some(ahora));
        ins.updated_by = Set(actualizado_por);
        let ins = ins.update(&txn).await?;

        let mut mat: material::ActiveModel = material::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("material {id}")))?
            .into();
        mat.proveedor_id = Set(datos.proveedor_id);
        mat.merma_porcentaje = Set(datos.merma_porcentaje);
        mat.marca = Set(datos.marca);
        let mat = mat.update(&txn).await?;

        txn.commit().await?;
        let precio = match moneda_default_organizacion(repo, &ins.organizacion_id).await? {
            Some(codigo) => PrecioMaterialService::vigente_nacional(repo, &ins.id, &codigo)
                .await?
                .map(|p| p.precio),
            None => None,
        };
        Ok(combinar(ins, mat, precio))
    }

    /// Borrado lógico del `insumo` — la fila de `material` se queda.
    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        crate::marcar_insumo_eliminado(repo, &id, "material", eliminado_por).await
    }

    /// Importa materiales desde un CSV con columnas
    /// `Clave,Descripción,Unidad,Costo,Familia,Subfamilia` (Clave/Familia/Subfamilia
    /// opcionales). Si la fila coincide con un material ya registrado (por
    /// clave o, si no hay match, por descripción; ambas sin distinguir
    /// mayúsculas) se actualiza; si no, se crea. Si la fila trae `Clave` y no
    /// hay match, se usa tal cual; si no trae clave y es alta, se genera una
    /// consecutiva `MAT-<n>` continuando desde la clave `MAT-` más alta ya
    /// registrada para la organización. El costo abre una vigencia nueva de
    /// `precio_material`. No falla la operación completa por una fila mala —
    /// cada fila se procesa de forma independiente y los problemas se
    /// acumulan en `errores` en vez de abortar el resto del archivo.
    pub async fn importar_csv(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        contenido_csv: &str,
        creado_por: String,
    ) -> Result<ResultadoImportacion, ServiceError> {
        Self::importar_csv_con_progreso(repo, organizacion_id, contenido_csv, creado_por, |_, _| {}).await
    }

    pub async fn importar_csv_con_progreso(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        contenido_csv: &str,
        creado_por: String,
        mut on_progreso: impl FnMut(u32, u32) + Send,
    ) -> Result<ResultadoImportacion, ServiceError> {
        let mut siguiente_consecutivo_mat = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Clave.starts_with("MAT-"))
            .all(repo.conexion())
            .await?
            .iter()
            .filter_map(|i| i.clave.strip_prefix("MAT-")?.parse::<u32>().ok())
            .max()
            .unwrap_or(0)
            + 1;

        let unidades = obrix_db::entities::unidad_medida::Entity::find()
            .filter(obrix_db::entities::unidad_medida::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        // Token de la columna Unidad → id. Se arma en memoria con
        // `UnidadMedidaService::variantes`; no hay WHERE sobre `variantes`.
        let unidad_id_por_texto: std::collections::HashMap<String, String> = unidades
            .iter()
            .flat_map(|u| {
                UnidadMedidaService::variantes(u)
                    .into_iter()
                    .map(|t| (t, u.id.clone()))
            })
            .collect();

        let familias = obrix_db::entities::familia_insumo::Entity::find()
            .filter(obrix_db::entities::familia_insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let raiz_id_por_nombre: std::collections::HashMap<String, String> = familias
            .iter()
            .filter(|f| f.parent_id.is_none())
            .map(|f| (f.nombre.to_lowercase(), f.id.clone()))
            .collect();
        let hija_id_por_padre_y_nombre: std::collections::HashMap<(String, String), String> = familias
            .iter()
            .filter_map(|f| f.parent_id.as_ref().map(|padre| ((padre.clone(), f.nombre.to_lowercase()), f.id.clone())))
            .collect();

        let insumos_material = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::Material))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let extras: HashMap<String, material::Model> = material::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|m| (m.insumo_id.clone(), m))
            .collect();
        let mut clave_por_id: HashMap<String, String> = HashMap::new();
        let mut por_clave: HashMap<String, String> = HashMap::new();
        let mut por_descripcion: HashMap<String, String> = HashMap::new();
        for ins in &insumos_material {
            clave_por_id.insert(ins.id.clone(), ins.clave.clone());
            recordar_insumo(&mut por_clave, &mut por_descripcion, &ins.id, &ins.clave, &ins.descripcion);
        }

        let mut lector = csv::ReaderBuilder::new().from_reader(contenido_csv.as_bytes());
        let mut creados = 0u32;
        let mut actualizados = 0u32;
        let mut se_autogenero_clave = false;
        let mut errores = Vec::new();

        let tiene_columna_clave = lector
            .headers()
            .map(|h| h.iter().any(|columna| columna.trim().eq_ignore_ascii_case("clave")))
            .unwrap_or(false);

        let registros: Vec<Result<RegistroCsvMaterial, csv::Error>> =
            lector.deserialize::<RegistroCsvMaterial>().collect();
        let total = registros.len() as u32;
        for (i, registro) in registros.into_iter().enumerate() {
            on_progreso(i as u32 + 1, total);
            let fila = i + 2; // +1 por índice 0-based, +1 por la fila de encabezados
            let registro = match registro {
                Ok(r) => r,
                Err(e) => {
                    errores.push(format!("fila {fila}: {e}"));
                    continue;
                }
            };

            let descripcion = registro.descripcion.trim().to_string();
            if descripcion.is_empty() {
                errores.push(format!("fila {fila}: descripción vacía, se omitió"));
                continue;
            }

            let unidad_texto = registro.unidad.trim().to_lowercase();
            let Some(unidad_id) = unidad_id_por_texto.get(&unidad_texto).cloned() else {
                errores.push(format!("fila {fila}: unidad \"{}\" no encontrada, se omitió", registro.unidad.trim()));
                continue;
            };

            let costo_texto = registro.costo.trim();
            let Some(costo) = parsear_decimal(costo_texto) else {
                errores.push(format!("fila {fila}: costo \"{costo_texto}\" no es un número válido, se omitió"));
                continue;
            };

            let familia_texto = registro.familia.as_deref().unwrap_or("").trim();
            let familia_id = if familia_texto.is_empty() {
                None
            } else {
                match raiz_id_por_nombre.get(&familia_texto.to_lowercase()) {
                    Some(id) => Some(id.clone()),
                    None => {
                        errores.push(format!(
                            "fila {fila}: familia \"{familia_texto}\" no encontrada, se importó sin familia"
                        ));
                        None
                    }
                }
            };

            let subfamilia_texto = registro.subfamilia.as_deref().unwrap_or("").trim();
            let sub_familia_id = if subfamilia_texto.is_empty() {
                None
            } else if let Some(familia_id) = &familia_id {
                match hija_id_por_padre_y_nombre.get(&(familia_id.clone(), subfamilia_texto.to_lowercase())) {
                    Some(id) => Some(id.clone()),
                    None => {
                        errores.push(format!(
                            "fila {fila}: subfamilia \"{subfamilia_texto}\" no encontrada dentro de \"{familia_texto}\", se importó sin subfamilia"
                        ));
                        None
                    }
                }
            } else {
                errores.push(format!(
                    "fila {fila}: subfamilia \"{subfamilia_texto}\" indicada sin familia válida, se ignoró"
                ));
                None
            };

            let clave_archivo = registro.clave.as_deref().map(str::trim).filter(|c| !c.is_empty());
            let existente_id = id_insumo_existente(clave_archivo, &descripcion, &por_clave, &por_descripcion);
            let clave = match (clave_archivo, existente_id.as_deref()) {
                (Some(clave_archivo), _) => clave_archivo.to_string(),
                (None, Some(id)) => clave_por_id
                    .get(id)
                    .cloned()
                    .unwrap_or_else(|| id.to_string()),
                (None, None) => {
                    let clave = format!("MAT-{siguiente_consecutivo_mat}");
                    siguiente_consecutivo_mat += 1;
                    se_autogenero_clave = true;
                    clave
                }
            };

            let extra = existente_id.as_ref().and_then(|id| extras.get(id));
            let datos = MaterialData {
                clave: clave.clone(),
                descripcion: descripcion.clone(),
                unidad_id,
                familia_id,
                sub_familia_id,
                proveedor_id: extra.and_then(|e| e.proveedor_id.clone()),
                merma_porcentaje: extra.and_then(|e| e.merma_porcentaje),
                marca: extra.and_then(|e| e.marca.clone()),
            };

            let material = if let Some(id) = existente_id {
                match Self::actualizar(repo, id, datos, Some(creado_por.clone())).await {
                    Ok(m) => {
                        actualizados += 1;
                        m
                    }
                    Err(e) => {
                        errores.push(format!("fila {fila}: no se pudo actualizar el material ({e})"));
                        continue;
                    }
                }
            } else {
                match Self::crear(repo, organizacion_id, datos, creado_por.clone()).await {
                    Ok(m) => {
                        creados += 1;
                        m
                    }
                    Err(e) => {
                        errores.push(format!("fila {fila}: no se pudo crear el material ({e})"));
                        continue;
                    }
                }
            };

            clave_por_id.insert(material.id.clone(), material.clave.clone());
            recordar_insumo(
                &mut por_clave,
                &mut por_descripcion,
                &material.id,
                &material.clave,
                &material.descripcion,
            );

            if let Err(e) = PrecioMaterialService::crear(
                repo,
                &material.id,
                PrecioMaterialData {
                    precio: costo,
                    moneda: "MXN".to_string(),
                    region_id: None,
                    fecha_vigencia_desde: crate::hoy(),
                },
                creado_por.clone(),
            )
            .await
            {
                let verbo = if extra.is_some() { "actualizado" } else { "creado" };
                errores.push(format!(
                    "fila {fila}: material {verbo} pero no se pudo registrar el costo ({e})"
                ));
            }
        }

        let aviso = if !tiene_columna_clave && se_autogenero_clave {
            Some(
                "El archivo no tiene columna \"Clave\"; se generarán claves automáticas con el prefijo MAT-."
                    .to_string(),
            )
        } else {
            None
        };

        Ok(ResultadoImportacion::nuevo(creados, actualizados, errores, aviso))
    }
}

#[derive(Debug, serde::Serialize)]
pub struct ResultadoImportacion {
    pub importados: u32,
    pub creados: u32,
    pub actualizados: u32,
    pub errores: Vec<String>,
    /// Aviso informativo (no error) — hoy se usa cuando el archivo no trae
    /// columna `Clave` y se autogeneraron claves con prefijo `MAT-`/`CUA-`.
    pub aviso: Option<String>,
}

impl ResultadoImportacion {
    pub fn nuevo(creados: u32, actualizados: u32, errores: Vec<String>, aviso: Option<String>) -> Self {
        Self {
            importados: creados + actualizados,
            creados,
            actualizados,
            errores,
            aviso,
        }
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvMaterial {
    #[serde(rename = "Clave")]
    clave: Option<String>,
    #[serde(rename = "Descripción")]
    descripcion: String,
    #[serde(rename = "Unidad")]
    unidad: String,
    #[serde(rename = "Costo")]
    costo: String,
    #[serde(rename = "Familia")]
    familia: Option<String>,
    #[serde(rename = "Subfamilia")]
    subfamilia: Option<String>,
}

/// Acepta separador decimal `.`, símbolo `$` y separadores de miles `,`/espacios.
fn parsear_decimal(texto: &str) -> Option<Decimal> {
    let limpio: String = texto.chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-').collect();
    if limpio.is_empty() {
        return None;
    }
    limpio.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use obrix_db::PortafolioSqliteRepository;
    use std::path::Path;

    fn datos(clave: &str, descripcion: &str) -> MaterialData {
        MaterialData {
            clave: clave.to_string(),
            descripcion: descripcion.to_string(),
            unidad_id: "um-1".to_string(),
            familia_id: None,
            sub_familia_id: None,
            proveedor_id: None,
            merma_porcentaje: None,
            marca: None,
        }
    }

    #[test]
    fn validar_rechaza_clave_vacia_o_solo_espacios() {
        assert!(MaterialService::validar(&datos("", "Cemento gris"), false).is_err());
        assert!(MaterialService::validar(&datos("   ", "Cemento gris"), true).is_err());
    }

    #[test]
    fn validar_rechaza_descripcion_vacia() {
        assert!(MaterialService::validar(&datos("MAT-1", ""), false).is_err());
    }

    #[test]
    fn validar_acepta_datos_completos() {
        assert!(MaterialService::validar(&datos("MAT-1", "Cemento gris"), false).is_ok());
    }

    #[test]
    fn validar_rechaza_unidad_id_vacio() {
        let mut d = datos("MAT-1", "Cemento gris");
        d.unidad_id = String::new();
        assert!(MaterialService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_familia_id_vacio() {
        let mut d = datos("MAT-1", "Cemento gris");
        d.familia_id = Some(String::new());
        assert!(MaterialService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_sub_familia_id_vacio() {
        let mut d = datos("MAT-1", "Cemento gris");
        d.sub_familia_id = Some(String::new());
        assert!(MaterialService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_proveedor_id_vacio() {
        let mut d = datos("MAT-1", "Cemento gris");
        d.proveedor_id = Some(String::new());
        assert!(MaterialService::validar(&d, false).is_err());
    }

    async fn portafolio_con_unidad_y_familia() -> (PortafolioSqliteRepository, String, String) {
        use obrix_db::entities::{familia_insumo, unidad_medida, usuario};
        use sea_orm::ActiveModelTrait;

        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-16T00:00:00Z".to_string();

        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set("a@a.com".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(now.clone()),
            created_by: Set(None),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        unidad_medida::ActiveModel {
            id: Set("um-1".into()),
            simbolo: Set("m2".into()),
            simbolo_impresion: Set("m2".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Metro cuadrado".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Area),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        familia_insumo::ActiveModel {
            id: Set("fam-1".into()),
            parent_id: Set(None),
            nombre: Set("Cementos".into()),
            insumos_asociados: Set(None),
            icono: Set(None),
            deleted: Set(false),
            created_at: Set(now),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        (portafolio, "um-1".to_string(), "fam-1".to_string())
    }

    #[tokio::test]
    async fn validar_unidad_existe_acepta_unidad_existente() {
        let (portafolio, unidad_id, _) = portafolio_con_unidad_y_familia().await;
        assert!(crate::validar_unidad_existe(&portafolio, &unidad_id).await.is_ok());
    }

    #[tokio::test]
    async fn validar_unidad_existe_rechaza_unidad_inexistente() {
        let (portafolio, _, _) = portafolio_con_unidad_y_familia().await;
        assert!(crate::validar_unidad_existe(&portafolio, "no-existe").await.is_err());
    }

    #[tokio::test]
    async fn validar_familia_existe_acepta_nulo() {
        let (portafolio, _, _) = portafolio_con_unidad_y_familia().await;
        assert!(crate::validar_familia_existe(&portafolio, &None).await.is_ok());
    }

    #[tokio::test]
    async fn validar_familia_existe_acepta_familia_existente() {
        let (portafolio, _, familia_id) = portafolio_con_unidad_y_familia().await;
        assert!(crate::validar_familia_existe(&portafolio, &Some(familia_id)).await.is_ok());
    }

    #[tokio::test]
    async fn validar_familia_existe_rechaza_familia_inexistente() {
        let (portafolio, _, _) = portafolio_con_unidad_y_familia().await;
        assert!(
            crate::validar_familia_existe(&portafolio, &Some("no-existe".to_string()))
                .await
                .is_err()
        );
    }

    async fn portafolio_con_proveedor() -> (PortafolioSqliteRepository, String) {
        use obrix_db::entities::{moneda, organizacion, proveedor, usuario};
        use sea_orm::ActiveModelTrait;

        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-16T00:00:00Z".to_string();

        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set("a@a.com".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(now.clone()),
            created_by: Set(None),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        moneda::ActiveModel {
            id: Set("mon-1".into()),
            codigo: Set("MXN".into()),
            nombre: Set("Peso mexicano".into()),
            simbolo: Set("$".into()),
            decimales: Set(2),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        organizacion::ActiveModel {
            id: Set("org-1".into()),
            razon_social: Set("Org".into()),
            rfc: Set("XAXX010101000".into()),
            tipo: Set(organizacion::TipoOrganizacion::Despacho),
            moneda_default_id: Set("mon-1".into()),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        proveedor::ActiveModel {
            id: Set("prov-1".into()),
            organizacion_id: Set("org-1".into()),
            razon_social: Set("Proveedor demo".into()),
            rfc: Set("XAXX010101000".into()),
            contacto: Set(None),
            calificacion: Set(None),
            deleted: Set(false),
            created_at: Set(now),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        (portafolio, "prov-1".to_string())
    }

    #[tokio::test]
    async fn validar_proveedor_existe_acepta_nulo() {
        let (portafolio, _) = portafolio_con_proveedor().await;
        assert!(crate::validar_proveedor_existe(&portafolio, &None).await.is_ok());
    }

    #[tokio::test]
    async fn validar_proveedor_existe_acepta_proveedor_existente() {
        let (portafolio, proveedor_id) = portafolio_con_proveedor().await;
        assert!(
            crate::validar_proveedor_existe(&portafolio, &Some(proveedor_id))
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn validar_proveedor_existe_rechaza_proveedor_inexistente() {
        let (portafolio, _) = portafolio_con_proveedor().await;
        assert!(
            crate::validar_proveedor_existe(&portafolio, &Some("no-existe".to_string()))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn crear_listar_actualizar_eliminar_material() {
        use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
        use sea_orm::{ActiveModelTrait, ActiveValue::Set};

        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-10T00:00:00Z".to_string();

        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set("a@a.com".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(now.clone()),
            created_by: Set(None),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        moneda::ActiveModel {
            id: Set("mon-1".into()),
            codigo: Set("MXN".into()),
            nombre: Set("Peso mexicano".into()),
            simbolo: Set("$".into()),
            decimales: Set(2),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        organizacion::ActiveModel {
            id: Set("org-1".into()),
            razon_social: Set("Org".into()),
            rfc: Set("XAXX010101000".into()),
            tipo: Set(organizacion::TipoOrganizacion::Despacho),
            moneda_default_id: Set("mon-1".into()),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        unidad_medida::ActiveModel {
            id: Set("um-1".into()),
            simbolo: Set("m2".into()),
            simbolo_impresion: Set("m2".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Metro cuadrado".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Area),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        let creado = MaterialService::crear(
            &portafolio,
            "org-1",
            MaterialData {
                clave: "MAT-1".into(),
                descripcion: "Cemento gris".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
                proveedor_id: None,
                merma_porcentaje: Some(3),
                marca: Some("Cemex".into()),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear material");
        assert_eq!(creado.clave, "MAT-1");

        let listado = MaterialService::listar(&portafolio, "org-1")
            .await
            .expect("listar materiales");
        assert_eq!(listado.len(), 1);
        assert_eq!(listado[0].marca.as_deref(), Some("Cemex"));

        let actualizado = MaterialService::actualizar(
            &portafolio,
            creado.id.clone(),
            MaterialData {
                clave: "MAT-1".into(),
                descripcion: "Cemento gris tipo I".into(),
                unidad_id: "um-1".into(),
                proveedor_id: None,
                familia_id: None,
                sub_familia_id: None,
                merma_porcentaje: Some(5),
                marca: Some("Cemex".into()),
            },
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar material");
        assert_eq!(actualizado.descripcion, "Cemento gris tipo I");

        MaterialService::eliminar(&portafolio, creado.id.clone(), "usr-1".into())
            .await
            .expect("eliminar material");

        let insumo_restante = obrix_db::entities::insumo::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap()
            .expect("el insumo debe seguir existiendo");
        assert!(insumo_restante.deleted);
        assert_eq!(insumo_restante.deleted_by.as_deref(), Some("usr-1"));

        let material_restante = obrix_db::entities::material::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap();
        assert!(
            material_restante.is_some(),
            "la extensión material no se borra; el listado la oculta con deleted"
        );

        let listado_tras_borrar = MaterialService::listar(&portafolio, "org-1")
            .await
            .expect("listar tras borrar");
        assert!(listado_tras_borrar.iter().all(|m| m.id != creado.id));
    }

    #[tokio::test]
    async fn importar_csv_resuelve_unidad_y_familia_y_reporta_filas_invalidas() {
        use obrix_db::entities::{familia_insumo, moneda, organizacion, unidad_medida, usuario};
        use sea_orm::{ActiveModelTrait, ActiveValue::Set};

        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-10T00:00:00Z".to_string();

        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set("a@a.com".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(now.clone()),
            created_by: Set(None),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        moneda::ActiveModel {
            id: Set("mon-1".into()),
            codigo: Set("MXN".into()),
            nombre: Set("Peso mexicano".into()),
            simbolo: Set("$".into()),
            decimales: Set(2),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        organizacion::ActiveModel {
            id: Set("org-1".into()),
            razon_social: Set("Org".into()),
            rfc: Set("XAXX010101000".into()),
            tipo: Set(organizacion::TipoOrganizacion::Despacho),
            moneda_default_id: Set("mon-1".into()),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        unidad_medida::ActiveModel {
            id: Set("um-1".into()),
            simbolo: Set("m2".into()),
            simbolo_impresion: Set("m2".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Metro cuadrado".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Area),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        familia_insumo::ActiveModel {
            id: Set("fam-1".into()),
            parent_id: Set(None),
            nombre: Set("Cementos".into()),
            insumos_asociados: Set(None),
            icono: Set(None),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        familia_insumo::ActiveModel {
            id: Set("fam-2".into()),
            parent_id: Set(Some("fam-1".into())),
            nombre: Set("Cemento gris".into()),
            insumos_asociados: Set(None),
            icono: Set(None),
            created_at: Set(now.clone()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        let csv = "Descripción,Unidad,Costo,Familia,Subfamilia\n\
                    Cemento Portland,m2,$125.50,Cementos,Cemento gris\n\
                    Arena de río,m2,80,,\n\
                    Grava,unidad-inexistente,50,,\n\
                    Cal,m2,no-es-numero,,\n";

        let resultado = MaterialService::importar_csv(&portafolio, "org-1", csv, "usr-1".into())
            .await
            .expect("importar csv");

        assert_eq!(resultado.importados, 2, "solo las 2 filas válidas deben importarse");
        assert_eq!(resultado.creados, 2);
        assert_eq!(resultado.actualizados, 0);
        assert_eq!(resultado.errores.len(), 2, "las 2 filas inválidas deben reportarse como error");
        assert!(
            resultado.aviso.is_some_and(|a| a.contains("MAT-")),
            "sin columna Clave debe avisarse que se autogeneran claves MAT-"
        );

        let materiales = MaterialService::listar(&portafolio, "org-1")
            .await
            .expect("listar materiales");
        assert_eq!(materiales.len(), 2);

        let cemento = materiales
            .iter()
            .find(|m| m.descripcion == "Cemento Portland")
            .expect("cemento importado");
        assert_eq!(cemento.familia_id.as_deref(), Some("fam-1"));
        assert_eq!(cemento.sub_familia_id.as_deref(), Some("fam-2"));
        assert_eq!(cemento.precio_vigente, Some("125.50".parse().unwrap()));

        let arena = materiales
            .iter()
            .find(|m| m.descripcion == "Arena de río")
            .expect("arena importada");
        assert_eq!(arena.familia_id, None);
        assert_eq!(arena.precio_vigente, Some("80".parse().unwrap()));

        assert_eq!(cemento.clave, "MAT-1");
        assert_eq!(arena.clave, "MAT-2");

        // Una segunda importación sin `Clave` para "Yeso" y con `Clave` explícita
        // ("ARE-99") para "Arena fina" debe: usar la clave del archivo cuando
        // viene presente, y continuar la consecutiva `MAT-` desde la más alta
        // ya registrada (MAT-2 → MAT-3), sin verse afectada por la clave ajena.
        let csv2 = "Clave,Descripción,Unidad,Costo\n\
                     ARE-99,Arena fina,m2,90\n\
                     ,Yeso,m2,60\n";
        let resultado2 = MaterialService::importar_csv(&portafolio, "org-1", csv2, "usr-1".into())
            .await
            .expect("importar csv2");
        assert_eq!(resultado2.importados, 2);
        assert_eq!(resultado2.aviso, None, "con columna Clave presente no debe avisarse nada");

        let materiales2 = MaterialService::listar(&portafolio, "org-1")
            .await
            .expect("listar materiales");

        let arena_fina = materiales2
            .iter()
            .find(|m| m.descripcion == "Arena fina")
            .expect("arena fina importada");
        assert_eq!(arena_fina.clave, "ARE-99");

        let yeso = materiales2
            .iter()
            .find(|m| m.descripcion == "Yeso")
            .expect("yeso importado");
        assert_eq!(yeso.clave, "MAT-3");

        // Reimportar por descripción (sin distinguir mayúsculas) actualiza, no duplica.
        let csv3 = "Descripción,Unidad,Costo\n\
                    CEMENTO PORTLAND,m2,200\n\
                    yeso,m2,70\n";
        let resultado3 = MaterialService::importar_csv(&portafolio, "org-1", csv3, "usr-1".into())
            .await
            .expect("reimportar por descripción");
        assert_eq!(resultado3.creados, 0);
        assert_eq!(resultado3.actualizados, 2);
        assert!(
            resultado3.aviso.is_none(),
            "reimportar sin generar claves no debe avisar MAT-: {:?}",
            resultado3.aviso
        );

        let materiales3 = MaterialService::listar(&portafolio, "org-1")
            .await
            .expect("listar tras reimportar");
        assert_eq!(materiales3.len(), 4, "no deben nacer materiales nuevos");
        let cemento3 = materiales3
            .iter()
            .find(|m| m.clave == "MAT-1")
            .expect("cemento actualizado");
        assert_eq!(cemento3.descripcion, "CEMENTO PORTLAND");
        assert_eq!(cemento3.precio_vigente, Some("200".parse().unwrap()));

        // Reimportar por clave (sin distinguir mayúsculas) también actualiza.
        let csv4 = "Clave,Descripción,Unidad,Costo\n\
                    mat-1,Cemento Portland extra,m2,210\n";
        let resultado4 = MaterialService::importar_csv(&portafolio, "org-1", csv4, "usr-1".into())
            .await
            .expect("reimportar por clave");
        assert_eq!(resultado4.creados, 0);
        assert_eq!(resultado4.actualizados, 1);
        let cemento4 = MaterialService::listar(&portafolio, "org-1")
            .await
            .expect("listar tras clave")
            .into_iter()
            .find(|m| m.id == cemento3.id)
            .expect("mismo material");
        assert_eq!(cemento4.descripcion, "Cemento Portland extra");
        assert_eq!(cemento4.precio_vigente, Some("210".parse().unwrap()));
    }
}
