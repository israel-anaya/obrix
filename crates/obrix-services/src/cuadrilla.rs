//! `cuadrilla` es una extensión 1:1 de `insumo` (ver diccionario de datos) —
//! este servicio administra ambas tablas juntas como si fueran una sola
//! entidad "Cuadrilla", igual que `material`/`categoria_fasar`/`herramienta`
//! hacen con `insumo`. Su composición (integrantes y herramienta) vive en
//! `cuadrilla_detalle`, administrada por `CuadrillaDetalleService`; su
//! valuación por región vive en `cuadrilla_costo`/`cuadrilla_costo_detalle`,
//! administrada por `CuadrillaCostoService`/`CuadrillaCostoDetalleService` —
//! `costo_nacional` aquí es solo un reflejo de conveniencia de la valuación
//! nacional, igual que `CategoriaFasar.salario_vigente`.

use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{cuadrilla, cuadrilla_costo};
use obrix_db::PortafolioRepository;
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait};

use crate::{nuevo_id, ServiceError};

#[derive(serde::Deserialize)]
pub struct CuadrillaData {
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    /// Debe ser hija (`parent_id`) de `familia_id` — no se valida aquí, el
    /// frontend ya restringe las opciones mostradas a los hijos de la familia elegida.
    pub sub_familia_id: Option<String>,
}

/// `insumo` + `cuadrilla` combinados en una sola fila — así es como lo ve el
/// frontend, que no necesita saber que internamente son varias tablas.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CuadrillaCompleto {
    pub id: String,
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    /// Valuación nacional (`region_id IS NULL`) — siempre existe salvo un
    /// estado transitorio imposible desde este servicio, toda cuadrilla nace
    /// con ella.
    pub costo_nacional: Option<cuadrilla_costo::Model>,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

pub(crate) fn combinar(
    insumo: insumo::Model,
    _cuadrilla: cuadrilla::Model,
    costo_nacional: Option<cuadrilla_costo::Model>,
) -> CuadrillaCompleto {
    CuadrillaCompleto {
        id: insumo.id,
        clave: insumo.clave,
        descripcion: insumo.descripcion,
        unidad_id: insumo.unidad_id,
        familia_id: insumo.familia_id,
        sub_familia_id: insumo.sub_familia_id,
        costo_nacional,
        created_at: insumo.created_at,
        created_by: insumo.created_by,
        updated_at: insumo.updated_at,
        updated_by: insumo.updated_by,
    }
}

pub struct CuadrillaService;

impl CuadrillaService {
    /// Validación de `CuadrillaData` común a `crear`/`actualizar` —
    /// `actualizando` distingue alta de edición por si una regla futura solo
    /// aplica a uno de los dos casos.
    fn validar(datos: &CuadrillaData, actualizando: bool) -> Result<(), ServiceError> {
        let accion = crate::accion(actualizando);
        if datos.clave.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una cuadrilla sin clave."
            )));
        }
        if datos.descripcion.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una cuadrilla sin descripción."
            )));
        }
        if datos.unidad_id.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una cuadrilla sin unidad."
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
    ) -> Result<Vec<CuadrillaCompleto>, ServiceError> {
        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::ManoObra))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;

        let mut resultado = Vec::with_capacity(insumos.len());
        for ins in insumos {
            // `categoria_fasar` también es `tipo = mano_obra` — solo las que
            // tienen fila en `cuadrilla` pertenecen a este catálogo.
            let Some(cua) = cuadrilla::Entity::find_by_id(&ins.id).one(repo.conexion()).await? else {
                continue;
            };
            let costo_nacional = Self::buscar_costo_nacional(repo, &ins.id).await?;
            resultado.push(combinar(ins, cua, costo_nacional));
        }
        Ok(resultado)
    }

    pub async fn buscar_por_id(
        repo: &dyn PortafolioRepository,
        id: &str,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let ins = insumo::Entity::find_by_id(id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {id}")))?;
        let cua = cuadrilla::Entity::find_by_id(id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {id}")))?;
        let costo_nacional = Self::buscar_costo_nacional(repo, id).await?;
        Ok(combinar(ins, cua, costo_nacional))
    }

    /// Inserta `insumo` + `cuadrilla` + su fila de valuación nacional
    /// (`cuadrilla_costo` con `region_id = NULL`) en la misma transacción —
    /// toda cuadrilla nace con su fila nacional en cero (ver diccionario de
    /// datos).
    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: CuadrillaData,
        creado_por: String,
    ) -> Result<CuadrillaCompleto, ServiceError> {
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
            created_at: Set(ahora.clone()),
            created_by: Set(creado_por.clone()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(&txn)
        .await?;

        let cua = cuadrilla::ActiveModel { insumo_id: Set(id.clone()) }.insert(&txn).await?;

        let costo_nacional = cuadrilla_costo::ActiveModel {
            id: Set(nuevo_id()),
            cuadrilla_id: Set(id),
            region_id: Set(None),
            sub_total_mano_obra: Set(Decimal::ZERO),
            sub_total_herramienta: Set(Decimal::ZERO),
            costo_total: Set(Decimal::ZERO),
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

        txn.commit().await?;
        Ok(combinar(ins, cua, Some(costo_nacional)))
    }

    /// Solo actualiza los datos de catálogo (clave/descripción/unidad/familia)
    /// — la valuación no es editable aquí, la administran
    /// `CuadrillaCostoService`/`CuadrillaCostoDetalleService`.
    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: CuadrillaData,
        actualizado_por: Option<String>,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        Self::validar(&datos, true)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        let ahora = crate::ahora();

        let mut ins: insumo::ActiveModel = insumo::Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {id}")))?
            .into();
        ins.clave = Set(datos.clave);
        ins.descripcion = Set(datos.descripcion);
        ins.unidad_id = Set(datos.unidad_id);
        ins.familia_id = Set(datos.familia_id);
        ins.sub_familia_id = Set(datos.sub_familia_id);
        ins.updated_at = Set(Some(ahora));
        ins.updated_by = Set(actualizado_por);
        let ins = ins.update(repo.conexion()).await?;

        let cua = cuadrilla::Entity::find_by_id(&ins.id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {id}")))?;
        let costo_nacional = Self::buscar_costo_nacional(repo, &ins.id).await?;
        Ok(combinar(ins, cua, costo_nacional))
    }

    /// Borrado lógico del `insumo` — `cuadrilla` y su composición/valuación
    /// se quedan.
    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        crate::marcar_insumo_eliminado(repo, &id, "cuadrilla", eliminado_por).await
    }

    async fn buscar_costo_nacional(
        repo: &dyn PortafolioRepository,
        cuadrilla_id: &str,
    ) -> Result<Option<cuadrilla_costo::Model>, ServiceError> {
        Ok(cuadrilla_costo::Entity::find()
            .filter(cuadrilla_costo::Column::CuadrillaId.eq(cuadrilla_id))
            .filter(cuadrilla_costo::Column::RegionId.is_null())
            .filter(cuadrilla_costo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use obrix_db::PortafolioSqliteRepository;
    use std::path::Path;

    fn datos(clave: &str, descripcion: &str) -> CuadrillaData {
        CuadrillaData {
            clave: clave.to_string(),
            descripcion: descripcion.to_string(),
            unidad_id: "um-1".to_string(),
            familia_id: None,
            sub_familia_id: None,
        }
    }

    #[test]
    fn validar_rechaza_clave_vacia_o_solo_espacios() {
        assert!(CuadrillaService::validar(&datos("", "Cuadrilla tipo A"), false).is_err());
        assert!(CuadrillaService::validar(&datos("   ", "Cuadrilla tipo A"), true).is_err());
    }

    #[test]
    fn validar_rechaza_descripcion_vacia() {
        assert!(CuadrillaService::validar(&datos("CUA-1", ""), false).is_err());
    }

    #[test]
    fn validar_acepta_datos_completos() {
        assert!(CuadrillaService::validar(&datos("CUA-1", "Cuadrilla tipo A"), false).is_ok());
    }

    #[test]
    fn validar_rechaza_unidad_id_vacio() {
        let mut d = datos("CUA-1", "Cuadrilla tipo A");
        d.unidad_id = String::new();
        assert!(CuadrillaService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_familia_id_vacio() {
        let mut d = datos("CUA-1", "Cuadrilla tipo A");
        d.familia_id = Some(String::new());
        assert!(CuadrillaService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_sub_familia_id_vacio() {
        let mut d = datos("CUA-1", "Cuadrilla tipo A");
        d.sub_familia_id = Some(String::new());
        assert!(CuadrillaService::validar(&d, false).is_err());
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
            simbolo: Set("cuad".into()),
            simbolo_impresion: Set("cuad".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Cuadrilla".into()),
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
            nombre: Set("Mano de obra".into()),
            insumos_asociados: Set(None),
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

    #[tokio::test]
    async fn crear_listar_actualizar_eliminar_cuadrilla() {
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
            simbolo: Set("cuad".into()),
            simbolo_impresion: Set("cuad".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Cuadrilla".into()),
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

        let creada = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla de albañilería tipo A".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla");
        assert_eq!(creada.clave, "CUA-1");
        let costo_nacional = creada.costo_nacional.as_ref().expect("debe nacer con fila nacional");
        assert!(costo_nacional.region_id.is_none());
        assert_eq!(costo_nacional.costo_total, Decimal::ZERO);

        let listado = CuadrillaService::listar(&portafolio, "org-1")
            .await
            .expect("listar cuadrillas");
        assert_eq!(listado.len(), 1);
        assert_eq!(listado[0].descripcion, "Cuadrilla de albañilería tipo A");

        let actualizada = CuadrillaService::actualizar(
            &portafolio,
            creada.id.clone(),
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla de albañilería tipo A (2 ayudantes)".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar cuadrilla");
        assert_eq!(actualizada.descripcion, "Cuadrilla de albañilería tipo A (2 ayudantes)");

        CuadrillaService::eliminar(&portafolio, creada.id.clone(), "usr-1".into())
            .await
            .expect("eliminar cuadrilla");

        let insumo_restante = obrix_db::entities::insumo::Entity::find_by_id(&creada.id)
            .one(portafolio.conexion())
            .await
            .unwrap()
            .expect("el insumo debe seguir existiendo");
        assert!(insumo_restante.deleted);
        assert_eq!(insumo_restante.deleted_by.as_deref(), Some("usr-1"));

        let cuadrilla_restante = obrix_db::entities::cuadrilla::Entity::find_by_id(&creada.id)
            .one(portafolio.conexion())
            .await
            .unwrap();
        assert!(
            cuadrilla_restante.is_some(),
            "la extensión cuadrilla no se borra; el listado la oculta con deleted"
        );

        let listado_tras_borrar = CuadrillaService::listar(&portafolio, "org-1")
            .await
            .expect("listar tras borrar");
        assert!(listado_tras_borrar.iter().all(|c| c.id != creada.id));
    }
}
