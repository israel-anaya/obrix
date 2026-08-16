//! `herramienta` es una extensión 1:1 de `insumo` (ver diccionario de
//! datos) — este servicio administra ambas tablas juntas como si fueran una
//! sola entidad "Herramienta", igual que `material`/`categoria_fasar` hacen
//! con `insumo`. Sin precio propio: `porcentaje_mano_obra` es el porcentaje
//! por default con el que esta herramienta entra a una cuadrilla (su costo
//! ahí se resuelve como `porcentaje_mano_obra` × `cuadrilla.sub_total_mano_obra`).

use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{familia_insumo, herramienta, unidad_medida};
use obrix_db::PortafolioRepository;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait};

use crate::organizacion::OrganizacionService;
use crate::unidad_medida::UnidadMedidaService;
use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

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
            let Some(her) = herramienta::Entity::find_by_id(&ins.id).one(repo.conexion()).await? else {
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
        if herramienta::Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let organizacion = OrganizacionService::buscar_admin_obrix(repo).await?;

        let unidades = unidad_medida::Entity::find()
            .filter(unidad_medida::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let unidad_id_por_texto: std::collections::HashMap<String, String> = unidades
            .iter()
            .flat_map(|u| {
                UnidadMedidaService::variantes(u)
                    .into_iter()
                    .map(|t| (t, u.id.clone()))
            })
            .collect();

        let familias = familia_insumo::Entity::find()
            .filter(familia_insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let raiz_id_por_nombre: std::collections::HashMap<String, String> = familias
            .iter()
            .filter(|f| f.parent_id.is_none())
            .map(|f| (f.nombre.to_lowercase(), f.id.clone()))
            .collect();
        let hija_id_por_padre_y_nombre: std::collections::HashMap<(String, String), String> = familias
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
            let Some(unidad_id) = unidad_id_por_texto.get(&unidad_texto.to_lowercase()).cloned() else {
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

        let organizacion = crate::organizacion::OrganizacionService::buscar_admin_obrix(&portafolio)
            .await
            .expect("organización sembrada");

        let listado = HerramientaService::listar(&portafolio, &organizacion.id)
            .await
            .expect("listar herramientas");
        assert_eq!(listado.len(), 2, "2 herramientas de data/initial/herramienta.csv");

        let mano = listado
            .iter()
            .find(|h| h.descripcion == "Herramienta de mano")
            .expect("Herramienta de mano");
        assert_eq!(mano.clave, "HER-001");
        assert_eq!(mano.porcentaje_mano_obra, Some(3));
        assert!(mano.sub_familia_id.is_some(), "Herramienta manual sí existe como subfamilia");

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
        assert_eq!(listado_repetido.len(), 2, "no debe duplicar al sembrar dos veces");
    }
}
