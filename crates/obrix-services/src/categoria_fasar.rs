//! `categoria_fasar` es una extensión 1:1 de `insumo` (ver diccionario de
//! datos) — este servicio administra ambas tablas juntas como si fueran una
//! sola entidad "Categoría FASAR", igual que `material` hace con `insumo`.

use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{categoria_fasar, familia_insumo, salario_categoria_fasar, unidad_medida};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter,
    TransactionTrait,
};

use crate::organizacion::OrganizacionService;
use crate::salario_categoria_fasar::SalarioCategoriaFasarService;
use crate::unidad_medida::UnidadMedidaService;
use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

/// Catálogo de categorías FASAR de referencia — fuente de verdad en
/// `data/initial/categoria_fasar.csv`, embebido tal cual en el binario (mismo
/// patrón que `factor_salario_real.json` en `FactorSalarioRealService`).
const CATEGORIAS_CSV: &str = include_str!("../../../data/initial/categoria_fasar.csv");

#[derive(serde::Deserialize)]
pub struct CategoriaFasarData {
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    /// Debe ser hija (`parent_id`) de `familia_id` — no se valida aquí, el
    /// frontend ya restringe las opciones mostradas a los hijos de la familia elegida.
    pub sub_familia_id: Option<String>,
}

/// `insumo` + `categoria_fasar` combinados en una sola fila — así es como lo
/// ve el frontend, que no necesita saber que internamente son dos tablas.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CategoriaFasarCompleto {
    pub id: String,
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    /// Vigencia nacional vigente de `salario_categoria_fasar`
    /// (`region_id` nulo) — `None` si nunca se le ha registrado un salario.
    pub salario_vigente: Option<salario_categoria_fasar::Model>,
    pub deleted: bool,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
    pub deleted_at: Option<String>,
    pub deleted_by: Option<String>,
}

fn combinar(
    insumo: insumo::Model,
    salario_vigente: Option<salario_categoria_fasar::Model>,
) -> CategoriaFasarCompleto {
    CategoriaFasarCompleto {
        id: insumo.id,
        clave: insumo.clave,
        descripcion: insumo.descripcion,
        unidad_id: insumo.unidad_id,
        familia_id: insumo.familia_id,
        sub_familia_id: insumo.sub_familia_id,
        salario_vigente,
        deleted: insumo.deleted,
        created_at: insumo.created_at,
        created_by: insumo.created_by,
        updated_at: insumo.updated_at,
        updated_by: insumo.updated_by,
        deleted_at: insumo.deleted_at,
        deleted_by: insumo.deleted_by,
    }
}

pub struct CategoriaFasarService;

impl CategoriaFasarService {
    /// Validación de `CategoriaFasarData` común a `crear`/`actualizar` —
    /// `actualizando` distingue alta de edición por si una regla futura solo
    /// aplica a uno de los dos casos.
    fn validar(datos: &CategoriaFasarData, actualizando: bool) -> Result<(), ServiceError> {
        let accion = crate::accion(actualizando);
        if datos.clave.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una categoría FASAR sin clave."
            )));
        }
        if datos.descripcion.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una categoría FASAR sin descripción."
            )));
        }
        if datos.unidad_id.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una categoría FASAR sin unidad."
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
    ) -> Result<Vec<CategoriaFasarCompleto>, ServiceError> {
        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::ManoObra))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;

        let mut resultado = Vec::with_capacity(insumos.len());
        for ins in insumos {
            let existe = categoria_fasar::Entity::find_by_id(&ins.id)
                .one(repo.conexion())
                .await?
                .is_some();
            if !existe {
                // No debería pasar (la extensión se crea siempre junto con el
                // insumo) — se omite en vez de reventar el listado completo.
                continue;
            }
            let salario_vigente = SalarioCategoriaFasarService::vigente_nacional(repo, &ins.id).await?;
            resultado.push(combinar(ins, salario_vigente));
        }
        Ok(resultado)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: CategoriaFasarData,
        creado_por: String,
    ) -> Result<CategoriaFasarCompleto, ServiceError> {
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
            tipo: Set(TipoInsumo::ManoObra),
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

        categoria_fasar::ActiveModel { insumo_id: Set(id) }
            .insert(&txn)
            .await?;

        txn.commit().await?;
        Ok(combinar(ins, None))
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: CategoriaFasarData,
        actualizado_por: Option<String>,
    ) -> Result<CategoriaFasarCompleto, ServiceError> {
        Self::validar(&datos, true)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        let ahora = crate::ahora();

        let mut ins: insumo::ActiveModel = insumo::Entity::find_by_id(&id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("categoría FASAR {id}")))?
            .into();
        ins.clave = Set(datos.clave);
        ins.descripcion = Set(datos.descripcion);
        ins.unidad_id = Set(datos.unidad_id);
        ins.familia_id = Set(datos.familia_id);
        ins.sub_familia_id = Set(datos.sub_familia_id);
        ins.updated_at = Set(Some(ahora));
        ins.updated_by = Set(actualizado_por);
        let ins = ins.update(repo.conexion()).await?;

        let salario_vigente = SalarioCategoriaFasarService::vigente_nacional(repo, &ins.id).await?;
        Ok(combinar(ins, salario_vigente))
    }

    /// Borrado lógico del `insumo` — `categoria_fasar` y su historial de
    /// `salario_categoria_fasar` se quedan.
    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        crate::marcar_insumo_eliminado(repo, &id, "categoría FASAR", eliminado_por).await
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvCategoria {
    #[serde(rename = "Categoría")]
    categoria: String,
    #[serde(rename = "Unidad")]
    unidad: String,
    #[serde(rename = "Familia")]
    familia: String,
    #[serde(rename = "Subfamilia")]
    subfamilia: String,
}

impl DatosIniciales for CategoriaFasarService {
    /// Una categoría por cada fila de `data/initial/categoria_fasar.csv`. Depende de
    /// `organizacion`, `unidad_medida` y `familia_insumo` ya sembradas — ver
    /// orden en `seed::sembrar_catalogos_generales`. Unidad del CSV se
    /// resuelve con `UnidadMedidaService::variantes`; Familia/Subfamilia por
    /// nombre. Clave `MO-001`… en el orden del archivo. Sin salario: eso
    /// vive en `salario_categoria_fasar` y lo carga el usuario después.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if categoria_fasar::Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let organizacion = OrganizacionService::buscar_admin_obrix(repo).await?;

        let unidades = unidad_medida::Entity::find()
            .filter(unidad_medida::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        // Igual que el import de materiales: mapa en memoria, no un LIKE.
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

        let mut lector = csv::ReaderBuilder::new().from_reader(CATEGORIAS_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvCategoria>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!("categoria_fasar.csv fila {fila}: {e}"))
            })?;
            let descripcion = registro.categoria.trim().to_string();
            if descripcion.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "categoria_fasar.csv fila {fila}: categoría vacía"
                )));
            }

            let unidad_texto = registro.unidad.trim();
            if unidad_texto.is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "categoria_fasar.csv fila {fila}: unidad vacía"
                )));
            }
            let Some(unidad_id) = unidad_id_por_texto.get(&unidad_texto.to_lowercase()).cloned() else {
                return Err(ServiceError::Validacion(format!(
                    "categoria_fasar.csv fila {fila}: unidad \"{unidad_texto}\" no encontrada"
                )));
            };

            let familia_texto = registro.familia.trim();
            let familia_id = raiz_id_por_nombre
                .get(&familia_texto.to_lowercase())
                .cloned()
                .ok_or_else(|| {
                    ServiceError::NoEncontrado(format!(
                        "categoria_fasar.csv fila {fila}: familia \"{familia_texto}\" no encontrada"
                    ))
                })?;

            let subfamilia_texto = registro.subfamilia.trim();
            let sub_familia_id = hija_id_por_padre_y_nombre
                .get(&(familia_id.clone(), subfamilia_texto.to_lowercase()))
                .cloned()
                .ok_or_else(|| {
                    ServiceError::NoEncontrado(format!(
                        "categoria_fasar.csv fila {fila}: subfamilia \"{subfamilia_texto}\" no encontrada dentro de \"{familia_texto}\""
                    ))
                })?;

            Self::crear(
                repo,
                &organizacion.id,
                CategoriaFasarData {
                    clave: format!("MO-{:03}", i + 1),
                    descripcion,
                    unidad_id,
                    familia_id: Some(familia_id),
                    sub_familia_id: Some(sub_familia_id),
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
    use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
    use obrix_db::PortafolioSqliteRepository;
    use sea_orm::ActiveModelTrait;
    use std::path::Path;

    fn datos(clave: &str, descripcion: &str) -> CategoriaFasarData {
        CategoriaFasarData {
            clave: clave.to_string(),
            descripcion: descripcion.to_string(),
            unidad_id: "um-1".to_string(),
            familia_id: None,
            sub_familia_id: None,
        }
    }

    #[test]
    fn validar_rechaza_clave_vacia_o_solo_espacios() {
        assert!(CategoriaFasarService::validar(&datos("", "Oficial albañil"), false).is_err());
        assert!(CategoriaFasarService::validar(&datos("   ", "Oficial albañil"), true).is_err());
    }

    #[test]
    fn validar_rechaza_descripcion_vacia() {
        assert!(CategoriaFasarService::validar(&datos("CAT-1", ""), false).is_err());
    }

    #[test]
    fn validar_rechaza_unidad_id_vacio() {
        let mut sin_unidad = datos("CAT-1", "Oficial albañil");
        sin_unidad.unidad_id = String::new();
        assert!(CategoriaFasarService::validar(&sin_unidad, false).is_err());
    }

    #[test]
    fn validar_acepta_datos_completos() {
        assert!(CategoriaFasarService::validar(&datos("CAT-1", "Oficial albañil"), false).is_ok());
    }

    #[test]
    fn validar_acepta_familia_id_y_sub_familia_id_nulos() {
        assert!(CategoriaFasarService::validar(&datos("CAT-1", "Oficial albañil"), false).is_ok());
    }

    #[test]
    fn validar_rechaza_familia_id_vacio() {
        let mut d = datos("CAT-1", "Oficial albañil");
        d.familia_id = Some(String::new());
        assert!(CategoriaFasarService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_sub_familia_id_vacio() {
        let mut d = datos("CAT-1", "Oficial albañil");
        d.sub_familia_id = Some(String::new());
        assert!(CategoriaFasarService::validar(&d, false).is_err());
    }

    async fn portafolio_con_unidad() -> (PortafolioSqliteRepository, String) {
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
            simbolo: Set("jor".into()),
            simbolo_impresion: Set("jor".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Jornal".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Otro),
            created_at: Set(now),
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

        (portafolio, "um-1".to_string())
    }

    #[tokio::test]
    async fn validar_unidad_existe_acepta_unidad_existente() {
        let (portafolio, unidad_id) = portafolio_con_unidad().await;
        assert!(crate::validar_unidad_existe(&portafolio, &unidad_id).await.is_ok());
    }

    #[tokio::test]
    async fn validar_unidad_existe_rechaza_unidad_inexistente() {
        let (portafolio, _) = portafolio_con_unidad().await;
        assert!(crate::validar_unidad_existe(&portafolio, "no-existe").await.is_err());
    }

    async fn portafolio_con_familia() -> (PortafolioSqliteRepository, String) {
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

        familia_insumo::ActiveModel {
            id: Set("fam-1".into()),
            parent_id: Set(None),
            nombre: Set("Materiales eléctricos".into()),
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

        (portafolio, "fam-1".to_string())
    }

    #[tokio::test]
    async fn validar_familia_existe_acepta_nulo() {
        let (portafolio, _) = portafolio_con_familia().await;
        assert!(crate::validar_familia_existe(&portafolio, &None).await.is_ok());
    }

    #[tokio::test]
    async fn validar_familia_existe_acepta_familia_existente() {
        let (portafolio, familia_id) = portafolio_con_familia().await;
        assert!(
            crate::validar_familia_existe(&portafolio, &Some(familia_id))
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn validar_familia_existe_rechaza_familia_inexistente() {
        let (portafolio, _) = portafolio_con_familia().await;
        assert!(
            crate::validar_familia_existe(&portafolio, &Some("no-existe".to_string()))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn crear_listar_actualizar_eliminar_categoria_fasar() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-12T00:00:00Z".to_string();

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
            simbolo: Set("jor".into()),
            simbolo_impresion: Set("jor".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Jornal".into()),
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

        let creado = CategoriaFasarService::crear(
            &portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial albañil".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria_fasar");
        assert_eq!(creado.clave, "CAT-1");
        assert!(creado.salario_vigente.is_none());

        let listado = CategoriaFasarService::listar(&portafolio, "org-1")
            .await
            .expect("listar categorias_fasar");
        assert_eq!(listado.len(), 1);
        assert_eq!(listado[0].descripcion, "Oficial albañil");

        let actualizado = CategoriaFasarService::actualizar(
            &portafolio,
            creado.id.clone(),
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial albañil, primera".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar categoria_fasar");
        assert_eq!(actualizado.descripcion, "Oficial albañil, primera");

        CategoriaFasarService::eliminar(&portafolio, creado.id.clone(), "usr-1".into())
            .await
            .expect("eliminar categoria_fasar");

        let insumo_restante = obrix_db::entities::insumo::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap()
            .expect("el insumo debe seguir existiendo");
        assert!(insumo_restante.deleted);
        assert_eq!(insumo_restante.deleted_by.as_deref(), Some("usr-1"));

        let categoria_restante = obrix_db::entities::categoria_fasar::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap();
        assert!(
            categoria_restante.is_some(),
            "la extensión categoria_fasar no se borra; el listado la oculta con deleted"
        );

        let listado_tras_borrar = CategoriaFasarService::listar(&portafolio, "org-1")
            .await
            .expect("listar tras borrar");
        assert!(listado_tras_borrar.iter().all(|c| c.id != creado.id));
    }

    /// El CSV pide `jor` en cada fila — si esa unidad no está sembrada, el
    /// sembrado debe abortar con `Validacion`, no crear categorías a medias.
    #[tokio::test]
    async fn sembrar_falla_si_la_unidad_del_csv_no_existe() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-13T00:00:00Z".to_string();

        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set(crate::usuario::CORREO_ADMIN_OBRIX.into()),
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

        // Hay unidades, pero ninguna es `jor` — el CSV no debe resolverse
        // contra "cualquier unidad", sino contra el símbolo de cada fila.
        unidad_medida::ActiveModel {
            id: Set("um-m".into()),
            simbolo: Set("m".into()),
            simbolo_impresion: Set("m".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Metro".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Longitud),
            created_at: Set(now),
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

        let err = CategoriaFasarService::sembrar(&portafolio)
            .await
            .expect_err("debe fallar si jor no está en unidad_medida");
        match err {
            ServiceError::Validacion(mensaje) => {
                assert!(
                    mensaje.contains("unidad \"jor\" no encontrada"),
                    "mensaje inesperado: {mensaje}"
                );
            }
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }

        let creadas = categoria_fasar::Entity::find()
            .all(portafolio.conexion())
            .await
            .unwrap();
        assert!(creadas.is_empty(), "no debe quedar ninguna categoría a medias");
    }
}
