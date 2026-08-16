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
use crate::{nuevo_id, ServiceError};

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
    /// opcionales). Si la fila trae `Clave`, se usa tal cual; si no, se genera
    /// una consecutiva `MAT-<n>` continuando desde la clave `MAT-` más alta ya
    /// registrada para la organización. No falla la operación completa por una
    /// fila mala — cada fila se procesa de forma independiente y los problemas
    /// se acumulan en `errores` en vez de abortar el resto del archivo.
    pub async fn importar_csv(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        contenido_csv: &str,
        creado_por: String,
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

        let mut lector = csv::ReaderBuilder::new().from_reader(contenido_csv.as_bytes());
        let mut importados = 0u32;
        let mut errores = Vec::new();

        // Si el archivo no trae columna `Clave`, se avisa una sola vez de que
        // todas las filas recibirán una consecutiva `MAT-<n>` autogenerada.
        let tiene_columna_clave = lector
            .headers()
            .map(|h| h.iter().any(|columna| columna.trim().eq_ignore_ascii_case("clave")))
            .unwrap_or(false);
        let aviso = if tiene_columna_clave {
            None
        } else {
            Some(
                "El archivo no tiene columna \"Clave\"; se generarán claves automáticas con el prefijo MAT-."
                    .to_string(),
            )
        };

        for (i, registro) in lector.deserialize::<RegistroCsvMaterial>().enumerate() {
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

            let clave = match registro.clave.as_deref().map(str::trim) {
                Some(clave_archivo) if !clave_archivo.is_empty() => clave_archivo.to_string(),
                _ => {
                    let clave = format!("MAT-{siguiente_consecutivo_mat}");
                    siguiente_consecutivo_mat += 1;
                    clave
                }
            };
            let creacion = Self::crear(
                repo,
                organizacion_id,
                MaterialData {
                    clave,
                    descripcion,
                    unidad_id,
                    familia_id,
                    sub_familia_id,
                    proveedor_id: None,
                    merma_porcentaje: None,
                    marca: None,
                },
                creado_por.clone(),
            )
            .await;

            let material = match creacion {
                Ok(m) => m,
                Err(e) => {
                    errores.push(format!("fila {fila}: no se pudo crear el material ({e})"));
                    continue;
                }
            };

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
                errores.push(format!(
                    "fila {fila}: material creado pero no se pudo registrar el costo ({e})"
                ));
            }

            importados += 1;
        }

        Ok(ResultadoImportacion { importados, errores, aviso })
    }
}

#[derive(Debug, serde::Serialize)]
pub struct ResultadoImportacion {
    pub importados: u32,
    pub errores: Vec<String>,
    /// Aviso informativo (no error) — hoy solo se usa cuando el archivo no
    /// trae columna `Clave` y las claves se autogeneraron con prefijo `MAT-`.
    pub aviso: Option<String>,
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
    }
}
