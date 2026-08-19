//! `herramienta` es una extensión 1:1 de `insumo` (ver diccionario de
//! datos) — este servicio administra ambas tablas juntas como si fueran una
//! sola entidad "Herramienta", igual que `material`/`categoria_fasar` hacen
//! con `insumo`. Sin precio propio: `porcentaje_mano_obra` es el porcentaje
//! por default con el que esta herramienta entra a una cuadrilla (su costo
//! ahí se resuelve como `porcentaje_mano_obra` × `cuadrilla.sub_total_mano_obra`).

use obrix_db::PortafolioRepository;
use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{familia_insumo, herramienta, unidad_medida};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};

use crate::organizacion::OrganizacionService;
use crate::unidad_medida::UnidadMedidaService;
use crate::usuario::UsuarioService;
use crate::{DatosIniciales, ServiceError, nuevo_id};

/// Herramienta menor de referencia — fuente de verdad en
/// `data/initial/herramienta.csv`, embebido tal cual en el binario (mismo
/// patrón que `categoria_fasar.csv` en `CategoriaFasarService`).
const HERRAMIENTAS_CSV: &str = include_str!("../../../data/initial/herramienta.csv");

#[derive(serde::Deserialize)]
pub struct HerramientaData {
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    /// Debe ser hija (`parent_id`) de `familia_id` — no se valida aquí, el
    /// frontend ya restringe las opciones mostradas a los hijos de la familia elegida.
    pub sub_familia_id: Option<String>,
    pub porcentaje_mano_obra: Option<i32>,
}

/// `insumo` + `herramienta` combinados en una sola fila — así es como lo ve
/// el frontend, que no necesita saber que internamente son dos tablas.
#[derive(Debug, Clone, serde::Serialize)]
pub struct HerramientaCompleto {
    pub id: String,
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    pub porcentaje_mano_obra: Option<i32>,
    pub deleted: bool,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
    pub deleted_at: Option<String>,
    pub deleted_by: Option<String>,
}

fn combinar(insumo: insumo::Model, herramienta: herramienta::Model) -> HerramientaCompleto {
    HerramientaCompleto {
        id: insumo.id,
        clave: insumo.clave,
        descripcion: insumo.descripcion,
        unidad_id: insumo.unidad_id,
        familia_id: insumo.familia_id,
        sub_familia_id: insumo.sub_familia_id,
        porcentaje_mano_obra: herramienta.porcentaje_mano_obra,
        deleted: insumo.deleted,
        created_at: insumo.created_at,
        created_by: insumo.created_by,
        updated_at: insumo.updated_at,
        updated_by: insumo.updated_by,
        deleted_at: insumo.deleted_at,
        deleted_by: insumo.deleted_by,
    }
}

pub struct HerramientaService;

impl HerramientaService {
    fn validar(datos: &HerramientaData, actualizando: bool) -> Result<(), ServiceError> {
        if datos.clave.trim().is_empty() {
            let accion = crate::accion(actualizando);
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una herramienta sin clave."
            )));
        }
        if datos.descripcion.trim().is_empty() {
            let accion = crate::accion(actualizando);
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una herramienta sin descripción."
            )));
        }
        if datos.unidad_id.trim().is_empty() {
            let accion = crate::accion(actualizando);
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una herramienta sin unidad de medida."
            )));
        }
        crate::validar_opcionales_no_vacios(&[
            (&datos.familia_id, "familia_id"),
            (&datos.sub_familia_id, "sub_familia_id"),
        ])?;
        Ok(())
    }

    pub async fn listar(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
    ) -> Result<Vec<HerramientaCompleto>, ServiceError> {
        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::EquipoHerramienta))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;

        let mut resultado = Vec::with_capacity(insumos.len());
        for ins in insumos {
            let Some(her) = herramienta::Entity::find_by_id(&ins.id)
                .one(repo.conexion())
                .await?
            else {
                // No debería pasar (la extensión se crea siempre junto con el
                // insumo) — se omite en vez de reventar el listado completo.
                continue;
            };
            resultado.push(combinar(ins, her));
        }
        Ok(resultado)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: HerramientaData,
        creado_por: String,
    ) -> Result<HerramientaCompleto, ServiceError> {
        Self::validar(&datos, false)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        let txn = repo.conexion().begin().await?;
        let id = nuevo_id();
        let ahora = crate::ahora();

        let ins = insumo::ActiveModel {
            id: Set(id.clone()),
            organizacion_id: Set(organizacion_id.to_string()),
            clave: Set(datos.clave),
            tipo: Set(TipoInsumo::EquipoHerramienta),
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

        let her = herramienta::ActiveModel {
            insumo_id: Set(id),
            porcentaje_mano_obra: Set(datos.porcentaje_mano_obra),
        }
        .insert(&txn)
        .await?;

        txn.commit().await?;
        Ok(combinar(ins, her))
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: HerramientaData,
        actualizado_por: Option<String>,
    ) -> Result<HerramientaCompleto, ServiceError> {
        Self::validar(&datos, true)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        let txn = repo.conexion().begin().await?;
        let ahora = crate::ahora();

        let mut ins: insumo::ActiveModel = insumo::Entity::find_by_id(&id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("herramienta {id}")))?
            .into();
        ins.clave = Set(datos.clave);
        ins.descripcion = Set(datos.descripcion);
        ins.unidad_id = Set(datos.unidad_id);
        ins.familia_id = Set(datos.familia_id);
        ins.sub_familia_id = Set(datos.sub_familia_id);
        ins.updated_at = Set(Some(ahora));
        ins.updated_by = Set(actualizado_por);
        let ins = ins.update(&txn).await?;

        let mut her: herramienta::ActiveModel = herramienta::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("herramienta {id}")))?
            .into();
        her.porcentaje_mano_obra = Set(datos.porcentaje_mano_obra);
        let her = her.update(&txn).await?;

        txn.commit().await?;
        Ok(combinar(ins, her))
    }

    /// Borrado lógico del `insumo` — la fila de `herramienta` se queda.
    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        crate::marcar_insumo_eliminado(repo, &id, "herramienta", eliminado_por).await
    }

    pub async fn importar_csv(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        contenido_csv: &str,
        creado_por: String,
    ) -> Result<crate::material::ResultadoImportacion, ServiceError> {
        Self::importar_csv_con_progreso(repo, organizacion_id, contenido_csv, creado_por, |_, _| {})
            .await
    }

    pub async fn importar_csv_con_progreso(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        contenido_csv: &str,
        creado_por: String,
        mut on_progreso: impl FnMut(u32, u32) + Send,
    ) -> Result<crate::material::ResultadoImportacion, ServiceError> {
        use crate::material::ResultadoImportacion;
        use crate::{
            id_insumo_existente, mapas_familia, recordar_insumo, resolver_familia_csv,
            siguiente_consecutivo,
        };
        use std::collections::HashMap;

        let unidades = unidad_medida::Entity::find()
            .filter(unidad_medida::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let unidad_id_por_texto = UnidadMedidaService::mapa_id_por_texto(&unidades);

        let familias = familia_insumo::Entity::find()
            .filter(familia_insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let (raiz_id_por_nombre, hija_id_por_padre_y_nombre) = mapas_familia(&familias);

        let extension: std::collections::HashSet<String> = herramienta::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|h| h.insumo_id)
            .collect();
        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let mut clave_por_id: HashMap<String, String> = HashMap::new();
        let mut por_clave: HashMap<String, String> = HashMap::new();
        let mut por_descripcion: HashMap<String, String> = HashMap::new();
        for ins in &insumos {
            if !extension.contains(&ins.id) {
                continue;
            }
            clave_por_id.insert(ins.id.clone(), ins.clave.clone());
            recordar_insumo(
                &mut por_clave,
                &mut por_descripcion,
                &ins.id,
                &ins.clave,
                &ins.descripcion,
            );
        }
        let mut siguiente =
            siguiente_consecutivo(clave_por_id.values().map(String::as_str), "HER-");

        let mut lector = csv::ReaderBuilder::new().from_reader(contenido_csv.as_bytes());
        let mut creados = 0u32;
        let mut actualizados = 0u32;
        let mut se_autogenero_clave = false;
        let mut errores = Vec::new();
        let tiene_columna_clave = lector
            .headers()
            .map(|h| {
                h.iter()
                    .any(|columna| columna.trim().eq_ignore_ascii_case("clave"))
            })
            .unwrap_or(false);

        let registros: Vec<Result<RegistroCsvImportHerramienta, csv::Error>> = lector
            .deserialize::<RegistroCsvImportHerramienta>()
            .collect();
        let total = registros.len() as u32;
        for (i, registro) in registros.into_iter().enumerate() {
            on_progreso(i as u32 + 1, total);
            let fila = i + 2;
            let registro = match registro {
                Ok(r) => r,
                Err(e) => {
                    errores.push(format!("fila {fila}: {e}"));
                    continue;
                }
            };
            let descripcion = registro.herramienta.trim().to_string();
            if descripcion.is_empty() {
                errores.push(format!("fila {fila}: herramienta vacía, se omitió"));
                continue;
            }
            let unidad_texto = registro.unidad.trim().to_lowercase();
            let Some(unidad_id) = unidad_id_por_texto.get(&unidad_texto).cloned() else {
                errores.push(format!(
                    "fila {fila}: unidad \"{}\" no encontrada, se omitió",
                    registro.unidad.trim()
                ));
                continue;
            };
            let (familia_id, sub_familia_id) = resolver_familia_csv(
                registro.familia.as_deref().unwrap_or(""),
                registro.subfamilia.as_deref().unwrap_or(""),
                &raiz_id_por_nombre,
                &hija_id_por_padre_y_nombre,
                fila,
                &mut errores,
            );
            let clave_archivo = registro
                .clave
                .as_deref()
                .map(str::trim)
                .filter(|c| !c.is_empty());
            let existente_id =
                id_insumo_existente(clave_archivo, &descripcion, &por_clave, &por_descripcion);
            let clave = match (clave_archivo, existente_id.as_deref()) {
                (Some(clave_archivo), _) => clave_archivo.to_string(),
                (None, Some(id)) => clave_por_id
                    .get(id)
                    .cloned()
                    .unwrap_or_else(|| id.to_string()),
                (None, None) => {
                    let clave = format!("HER-{siguiente:03}");
                    siguiente += 1;
                    se_autogenero_clave = true;
                    clave
                }
            };
            let datos = HerramientaData {
                clave: clave.clone(),
                descripcion: descripcion.clone(),
                unidad_id,
                familia_id,
                sub_familia_id,
                porcentaje_mano_obra: parsear_porcentaje_mo(
                    registro.porcentaje_mano_obra.as_deref().unwrap_or(""),
                ),
            };
            let item = if let Some(id) = existente_id {
                match Self::actualizar(repo, id, datos, Some(creado_por.clone())).await {
                    Ok(h) => {
                        actualizados += 1;
                        h
                    }
                    Err(e) => {
                        errores.push(format!(
                            "fila {fila}: no se pudo actualizar la herramienta ({e})"
                        ));
                        continue;
                    }
                }
            } else {
                match Self::crear(repo, organizacion_id, datos, creado_por.clone()).await {
                    Ok(h) => {
                        creados += 1;
                        h
                    }
                    Err(e) => {
                        errores.push(format!(
                            "fila {fila}: no se pudo crear la herramienta ({e})"
                        ));
                        continue;
                    }
                }
            };
            clave_por_id.insert(item.id.clone(), item.clave.clone());
            recordar_insumo(
                &mut por_clave,
                &mut por_descripcion,
                &item.id,
                &item.clave,
                &item.descripcion,
            );
        }
        let aviso = if !tiene_columna_clave && se_autogenero_clave {
            Some(
                "El archivo no tiene columna \"Clave\"; se generarán claves automáticas con el prefijo HER-."
                    .to_string(),
            )
        } else {
            None
        };
        Ok(ResultadoImportacion::nuevo(
            creados,
            actualizados,
            errores,
            aviso,
        ))
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvImportHerramienta {
    #[serde(rename = "Clave", default)]
    clave: Option<String>,
    #[serde(rename = "Herramienta")]
    herramienta: String,
    #[serde(rename = "Unidad")]
    unidad: String,
    #[serde(rename = "Familia", default)]
    familia: Option<String>,
    #[serde(rename = "Subfamilia", default)]
    subfamilia: Option<String>,
    #[serde(rename = "PorcentajeManoObra", default)]
    porcentaje_mano_obra: Option<String>,
}

fn parsear_porcentaje_mo(texto: &str) -> Option<i32> {
    let limpio: String = texto
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();
    if limpio.is_empty() {
        return None;
    }
    let n: f64 = limpio.parse().ok()?;
    Some(n.round().clamp(0.0, 100.0) as i32)
}

#[derive(serde::Deserialize)]
struct RegistroCsvHerramienta {
    #[serde(rename = "Herramienta")]
    herramienta: String,
    #[serde(rename = "Unidad")]
    unidad: String,
    #[serde(rename = "Familia")]
    familia: String,
    /// Vacía cuando la herramienta no cae dentro de ninguna subfamilia
    /// existente (p. ej. "Equipo de seguridad") — a diferencia de
    /// `categoria_fasar.csv`, aquí es opcional.
    #[serde(rename = "Subfamilia")]
    subfamilia: String,
    #[serde(rename = "PorcentajeManoObra")]
    porcentaje_mano_obra: i32,
}

impl DatosIniciales for HerramientaService {
    /// Una herramienta por cada fila de `data/initial/herramienta.csv` —
    /// hoy solo cubre "Herramienta de mano" y "Equipo de seguridad", los dos
    /// rubros que CMIC/CFE/SCT reconocen como porcentaje sobre mano de obra
    /// en el costo directo. Depende de `organizacion`, `unidad_medida` y
    /// `familia_insumo` ya sembradas — ver orden en
    /// `seed::sembrar_catalogos_generales`. Clave `HER-001`… en el orden del archivo.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if herramienta::Entity::find()
            .one(repo.conexion())
            .await?
            .is_some()
        {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let organizacion = OrganizacionService::buscar_admin_obrix(repo).await?;

        let unidades = unidad_medida::Entity::find()
            .filter(unidad_medida::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let unidad_id_por_texto = UnidadMedidaService::mapa_id_por_texto(&unidades);

        let familias = familia_insumo::Entity::find()
            .filter(familia_insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let raiz_id_por_nombre: std::collections::HashMap<String, String> = familias
            .iter()
            .filter(|f| f.parent_id.is_none())
            .map(|f| (f.nombre.to_lowercase(), f.id.clone()))
            .collect();
        let hija_id_por_padre_y_nombre: std::collections::HashMap<(String, String), String> =
            familias
                .iter()
                .filter_map(|f| {
                    f.parent_id
                        .as_ref()
                        .map(|padre| ((padre.clone(), f.nombre.to_lowercase()), f.id.clone()))
                })
                .collect();

        let mut lector = csv::ReaderBuilder::new().from_reader(HERRAMIENTAS_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvHerramienta>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!("herramienta.csv fila {fila}: {e}"))
            })?;
            let descripcion = registro.herramienta.trim().to_string();
            if descripcion.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "herramienta.csv fila {fila}: herramienta vacía"
                )));
            }

            let unidad_texto = registro.unidad.trim();
            if unidad_texto.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "herramienta.csv fila {fila}: unidad vacía"
                )));
            }
            let Some(unidad_id) = unidad_id_por_texto
                .get(&unidad_texto.to_lowercase())
                .cloned()
            else {
                return Err(ServiceError::Validacion(format!(
                    "herramienta.csv fila {fila}: unidad \"{unidad_texto}\" no encontrada"
                )));
            };

            let familia_texto = registro.familia.trim();
            let familia_id = raiz_id_por_nombre
                .get(&familia_texto.to_lowercase())
                .cloned()
                .ok_or_else(|| {
                    ServiceError::NoEncontrado(format!(
                        "herramienta.csv fila {fila}: familia \"{familia_texto}\" no encontrada"
                    ))
                })?;

            let subfamilia_texto = registro.subfamilia.trim();
            let sub_familia_id = if subfamilia_texto.is_empty() {
                None
            } else {
                Some(
                    hija_id_por_padre_y_nombre
                        .get(&(familia_id.clone(), subfamilia_texto.to_lowercase()))
                        .cloned()
                        .ok_or_else(|| {
                            ServiceError::NoEncontrado(format!(
                                "herramienta.csv fila {fila}: subfamilia \"{subfamilia_texto}\" no encontrada dentro de \"{familia_texto}\""
                            ))
                        })?,
                )
            };

            Self::crear(
                repo,
                &organizacion.id,
                HerramientaData {
                    clave: format!("HER-{:03}", i + 1),
                    descripcion,
                    unidad_id,
                    familia_id: Some(familia_id),
                    sub_familia_id,
                    porcentaje_mano_obra: Some(registro.porcentaje_mano_obra),
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
    use obrix_db::PortafolioSqliteRepository;
    use rust_decimal::Decimal;
    use std::path::Path;

    #[tokio::test]
    async fn crear_listar_actualizar_eliminar_herramienta() {
        use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
        use sea_orm::{ActiveModelTrait, ActiveValue::Set};

        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-14T00:00:00Z".to_string();

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
            horas_jornada: Set(Decimal::from(8)),
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
            simbolo: Set("pza".into()),
            simbolo_impresion: Set("pza".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Pieza".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Otro),
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

        let creado = HerramientaService::crear(
            &portafolio,
            "org-1",
            HerramientaData {
                clave: "HER-1".into(),
                descripcion: "Rotomartillo".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
                porcentaje_mano_obra: Some(3),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear herramienta");
        assert_eq!(creado.clave, "HER-1");
        assert_eq!(creado.porcentaje_mano_obra, Some(3));

        let listado = HerramientaService::listar(&portafolio, "org-1")
            .await
            .expect("listar herramientas");
        assert_eq!(listado.len(), 1);
        assert_eq!(listado[0].descripcion, "Rotomartillo");

        let actualizado = HerramientaService::actualizar(
            &portafolio,
            creado.id.clone(),
            HerramientaData {
                clave: "HER-1".into(),
                descripcion: "Rotomartillo eléctrico".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
                porcentaje_mano_obra: Some(5),
            },
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar herramienta");
        assert_eq!(actualizado.descripcion, "Rotomartillo eléctrico");
        assert_eq!(actualizado.porcentaje_mano_obra, Some(5));

        HerramientaService::eliminar(&portafolio, creado.id.clone(), "usr-1".into())
            .await
            .expect("eliminar herramienta");

        let insumo_restante = obrix_db::entities::insumo::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap()
            .expect("el insumo debe seguir existiendo");
        assert!(insumo_restante.deleted);
        assert_eq!(insumo_restante.deleted_by.as_deref(), Some("usr-1"));

        let herramienta_restante = obrix_db::entities::herramienta::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap();
        assert!(
            herramienta_restante.is_some(),
            "la extensión herramienta no se borra; el listado la oculta con deleted"
        );

        let listado_tras_borrar = HerramientaService::listar(&portafolio, "org-1")
            .await
            .expect("listar tras borrar");
        assert!(listado_tras_borrar.iter().all(|h| h.id != creado.id));
    }

    fn datos(clave: &str, descripcion: &str) -> HerramientaData {
        HerramientaData {
            clave: clave.to_string(),
            descripcion: descripcion.to_string(),
            unidad_id: "um-1".into(),
            familia_id: None,
            sub_familia_id: None,
            porcentaje_mano_obra: Some(3),
        }
    }

    #[test]
    fn validar_rechaza_clave_vacia_o_solo_espacios() {
        assert!(HerramientaService::validar(&datos("", "Rotomartillo"), false).is_err());
        assert!(HerramientaService::validar(&datos("   ", "Rotomartillo"), true).is_err());
    }

    #[test]
    fn validar_rechaza_descripcion_vacia() {
        assert!(HerramientaService::validar(&datos("HER-1", ""), false).is_err());
    }

    #[test]
    fn validar_acepta_datos_completos() {
        assert!(HerramientaService::validar(&datos("HER-1", "Rotomartillo"), false).is_ok());
    }

    #[test]
    fn validar_rechaza_unidad_id_vacio() {
        let mut d = datos("HER-1", "Rotomartillo");
        d.unidad_id = String::new();
        assert!(HerramientaService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_familia_id_vacio() {
        let mut d = datos("HER-1", "Rotomartillo");
        d.familia_id = Some(String::new());
        assert!(HerramientaService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_sub_familia_id_vacio() {
        let mut d = datos("HER-1", "Rotomartillo");
        d.sub_familia_id = Some(String::new());
        assert!(HerramientaService::validar(&d, false).is_err());
    }

    async fn portafolio_con_unidad_y_familia() -> (PortafolioSqliteRepository, String, String) {
        use obrix_db::entities::{familia_insumo, usuario};
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
            simbolo: Set("pza".into()),
            simbolo_impresion: Set("pza".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Pieza".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Otro),
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
            nombre: Set("Herramienta de mano".into()),
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
        assert!(
            crate::validar_unidad_existe(&portafolio, &unidad_id)
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn validar_unidad_existe_rechaza_unidad_inexistente() {
        let (portafolio, _, _) = portafolio_con_unidad_y_familia().await;
        assert!(
            crate::validar_unidad_existe(&portafolio, "no-existe")
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn validar_familia_existe_acepta_familia_existente() {
        let (portafolio, _, familia_id) = portafolio_con_unidad_y_familia().await;
        assert!(
            crate::validar_familia_existe(&portafolio, &Some(familia_id))
                .await
                .is_ok()
        );
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

    /// El CSV trae "Herramienta de mano" (3%) y "Equipo de seguridad" (2%) —
    /// los dos únicos rubros que CMIC/CFE/SCT reconocen como porcentaje sobre
    /// mano de obra. Corre el sembrado completo (no solo `sembrar` de este
    /// servicio) porque depende de `organizacion`/`unidad_medida`/`familia_insumo`
    /// ya sembradas — mismo patrón que las pruebas de sembrado de otros servicios.
    #[tokio::test]
    async fn sembrar_carga_herramienta_csv_y_es_idempotente() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");

        crate::seed::sembrar_catalogos_generales(&portafolio)
            .await
            .expect("sembrar catálogos generales");

        let organizacion =
            crate::organizacion::OrganizacionService::buscar_admin_obrix(&portafolio)
                .await
                .expect("organización sembrada");

        let listado = HerramientaService::listar(&portafolio, &organizacion.id)
            .await
            .expect("listar herramientas");
        assert_eq!(
            listado.len(),
            2,
            "2 herramientas de data/initial/herramienta.csv"
        );

        let mano = listado
            .iter()
            .find(|h| h.descripcion == "Herramienta de mano")
            .expect("Herramienta de mano");
        assert_eq!(mano.clave, "HER-001");
        assert_eq!(mano.porcentaje_mano_obra, Some(3));
        assert!(
            mano.sub_familia_id.is_some(),
            "Herramienta manual sí existe como subfamilia"
        );

        let seguridad = listado
            .iter()
            .find(|h| h.descripcion == "Equipo de seguridad")
            .expect("Equipo de seguridad");
        assert_eq!(seguridad.clave, "HER-002");
        assert_eq!(seguridad.porcentaje_mano_obra, Some(2));
        assert!(
            seguridad.sub_familia_id.is_none(),
            "no hay subfamilia \"Equipo de seguridad\" en familia_insumo.csv — se deja sin subfamilia"
        );

        // Sembrar de nuevo no debe duplicar — `sembrar` corta temprano si ya
        // hay al menos una fila en `herramienta`.
        HerramientaService::sembrar(&portafolio)
            .await
            .expect("sembrar herramienta de nuevo debe ser un no-op");
        let listado_repetido = HerramientaService::listar(&portafolio, &organizacion.id)
            .await
            .expect("listar herramientas de nuevo");
        assert_eq!(
            listado_repetido.len(),
            2,
            "no debe duplicar al sembrar dos veces"
        );
    }

    #[tokio::test]
    async fn importar_csv_resuelve_unidad_por_variantes() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        crate::seed::sembrar_catalogos_generales(&portafolio)
            .await
            .expect("sembrar");
        let org = crate::organizacion::OrganizacionService::buscar_admin_obrix(&portafolio)
            .await
            .expect("org");
        let admin = crate::usuario::UsuarioService::buscar_admin_obrix(&portafolio)
            .await
            .expect("admin");

        let csv = "Herramienta,Unidad,PorcentajeManoObra\n\
                    Rotomartillo de prueba,% de MO,4\n";
        let resultado =
            HerramientaService::importar_csv(&portafolio, &org.id, csv, admin.id.clone())
                .await
                .expect("importar");
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);
        assert_eq!(resultado.creados, 1);

        let item = HerramientaService::listar(&portafolio, &org.id)
            .await
            .unwrap()
            .into_iter()
            .find(|h| h.descripcion == "Rotomartillo de prueba")
            .expect("importada");
        let unidades = unidad_medida::Entity::find()
            .all(portafolio.conexion())
            .await
            .unwrap();
        let mapa = UnidadMedidaService::mapa_id_por_texto(&unidades);
        assert_eq!(item.unidad_id, mapa["%mo"]);
        assert_eq!(item.unidad_id, mapa["% de mo"]);
        assert_eq!(item.porcentaje_mano_obra, Some(4));
    }
}
