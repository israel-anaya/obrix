//! `cuadrilla` es una extensión 1:1 de `insumo` (ver diccionario de datos) —
//! este servicio administra ambas tablas juntas como si fueran una sola
//! entidad "Cuadrilla", igual que `material`/`categoria_fasar`/`herramienta`
//! hacen con `insumo`. Su composición (integrantes y herramienta) vive en
//! `cuadrilla_detalle`, administrada por `CuadrillaDetalleService`; su
//! valuación por región vive en `cuadrilla_costo`/`cuadrilla_costo_detalle`,
//! administrada por `CuadrillaCostoService`/`CuadrillaCostoDetalleService` —
//! `costo_nacional` aquí es solo un reflejo de conveniencia de la valuación
//! nacional, igual que `CategoriaFasar.salario_vigente`.

use obrix_db::PortafolioRepository;
use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{
    categoria_fasar, cuadrilla, cuadrilla_costo, familia_insumo, herramienta,
    salario_categoria_fasar,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};
use std::collections::{HashMap, HashSet};

use crate::csv_secciones::{
    buscar_columna, celda, parsear_decimal, parsear_secciones_maestro_detalle,
};
use crate::cuadrilla_detalle::{
    CuadrillaDetalleData, CuadrillaDetalleEditarData, CuadrillaDetalleService,
};
use crate::material::ResultadoImportacion;
use crate::unidad_medida::UnidadMedidaService;
use crate::{ServiceError, clave_cruce, mapas_familia, nuevo_id, resolver_familia_csv};

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
            let Some(cua) = cuadrilla::Entity::find_by_id(&ins.id)
                .one(repo.conexion())
                .await?
            else {
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

        let cua = cuadrilla::ActiveModel {
            insumo_id: Set(id.clone()),
        }
        .insert(&txn)
        .await?;

        let costo_nacional = cuadrilla_costo::ActiveModel {
            id: Set(nuevo_id()),
            cuadrilla_id: Set(id),
            region_id: Set(None),
            sub_total_mano_obra: Set(Decimal::ZERO),
            sub_total_herramienta: Set(Decimal::ZERO),
            costo_total: Set(Decimal::ZERO),
            fecha_costo: Set(None),
            sincronizado_en: Set(None),
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

    /// Importa cuadrillas desde un CSV de dos secciones (`MAESTRO` /
    /// `DETALLE`).
    ///
    /// **MAESTRO** (`Clave,Descripción,Unidad,Familia,Subfamilia`): `Clave`
    /// es obligatoria y es la única llave de cruce (sin distinguir
    /// mayúsculas). Si existe se actualizan descripción, unidad, familia y
    /// subfamilia; si no, se da de alta. Unidad vacía cae a `jor`; familia y
    /// subfamilia vacías se importan en nulo.
    ///
    /// **DETALLE** (`Clave Cuadrilla,Sección,Clave Insumo,Descripción
    /// Insumo,Unidad,Cantidad`): la receta existente es la referencia. Cada
    /// renglón del archivo actualiza solo `cantidad` si el integrante ya
    /// está, o se agrega si no. Los renglones de referencia que no vienen en
    /// el CSV se eliminan. El insumo se resuelve por `Clave Insumo` si trae
    /// valor; si no, por descripción. `MANO DE OBRA` contra `categoria_fasar`;
    /// `EQUIPO Y HERRAMIENTA` contra `herramienta`. Cantidades de
    /// herramienta en fracción (`0.03`) se convierten a porcentaje 0–100.
    /// Un integrante de mano de obra sin salario vigente sí se agrega, con
    /// costo 0, y se reporta en `errores`.
    pub async fn importar_csv(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        contenido_csv: &str,
        creado_por: String,
    ) -> Result<ResultadoImportacion, ServiceError> {
        Self::importar_csv_con_progreso(repo, organizacion_id, contenido_csv, creado_por, |_, _| {})
            .await
    }

    pub async fn importar_csv_con_progreso(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        contenido_csv: &str,
        creado_por: String,
        mut on_progreso: impl FnMut(u32, u32) + Send,
    ) -> Result<ResultadoImportacion, ServiceError> {
        let contenido = contenido_csv.trim_start_matches('\u{feff}');
        let (maestro, detalle) = parsear_secciones_maestro_detalle(contenido)?;

        let col_clave = buscar_columna(&maestro.encabezados, &["clave"]).ok_or_else(|| {
            ServiceError::Validacion("el MAESTRO debe tener la columna \"Clave\"".into())
        })?;
        let col_descripcion = buscar_columna(&maestro.encabezados, &["descripción", "descripcion"])
            .ok_or_else(|| {
                ServiceError::Validacion("el MAESTRO debe tener la columna \"Descripción\"".into())
            })?;
        let col_unidad = buscar_columna(&maestro.encabezados, &["unidad"]);
        let col_familia = buscar_columna(&maestro.encabezados, &["familia"]);
        let col_subfamilia = buscar_columna(&maestro.encabezados, &["subfamilia"]);

        let col_det_clave = buscar_columna(
            &detalle.encabezados,
            &["clave cuadrilla", "clave máquina", "clave maquina", "clave"],
        )
        .ok_or_else(|| {
            ServiceError::Validacion("el DETALLE debe tener la columna \"Clave Cuadrilla\"".into())
        })?;
        let col_seccion = buscar_columna(&detalle.encabezados, &["sección", "seccion"])
            .ok_or_else(|| {
                ServiceError::Validacion("el DETALLE debe tener la columna \"Sección\"".into())
            })?;
        let col_clave_insumo =
            buscar_columna(&detalle.encabezados, &["clave insumo", "clave integrante"]);
        let col_desc_insumo = buscar_columna(
            &detalle.encabezados,
            &[
                "descripción insumo",
                "descripcion insumo",
                "descripción",
                "descripcion",
            ],
        )
        .ok_or_else(|| {
            ServiceError::Validacion(
                "el DETALLE debe tener la columna \"Descripción Insumo\"".into(),
            )
        })?;
        let col_cantidad =
            buscar_columna(&detalle.encabezados, &["cantidad"]).ok_or_else(|| {
                ServiceError::Validacion("el DETALLE debe tener la columna \"Cantidad\"".into())
            })?;

        let unidades = obrix_db::entities::unidad_medida::Entity::find()
            .filter(obrix_db::entities::unidad_medida::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let unidad_id_por_texto = UnidadMedidaService::mapa_id_por_texto(&unidades);
        let unidad_jor_id = unidad_id_por_texto.get("jor").cloned().ok_or_else(|| {
            ServiceError::Validacion(
                "no se encontró la unidad \"jor\" para asignar a las cuadrillas importadas".into(),
            )
        })?;
        let familias = familia_insumo::Entity::find()
            .filter(familia_insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let (raiz_id_por_nombre, hija_id_por_padre_y_nombre) = mapas_familia(&familias);

        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let categorias: HashSet<String> = categoria_fasar::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|c| c.insumo_id)
            .collect();
        let herramientas: HashSet<String> = herramienta::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|h| h.insumo_id)
            .collect();
        let salarios_nacionales: HashSet<String> = salario_categoria_fasar::Entity::find()
            .filter(salario_categoria_fasar::Column::RegionId.is_null())
            .filter(salario_categoria_fasar::Column::FechaVigenciaHasta.is_null())
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|s| s.insumo_id)
            .collect();
        let cuadrillas_existentes: HashSet<String> = cuadrilla::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|c| c.insumo_id)
            .collect();

        let mut categoria_id_por_clave: HashMap<String, String> = HashMap::new();
        let mut categoria_id_por_descripcion: HashMap<String, String> = HashMap::new();
        let mut herramienta_id_por_clave: HashMap<String, String> = HashMap::new();
        let mut herramienta_id_por_descripcion: HashMap<String, String> = HashMap::new();
        let mut por_clave: HashMap<String, String> = HashMap::new();
        for ins in &insumos {
            if categorias.contains(&ins.id) {
                categoria_id_por_clave.insert(clave_cruce(&ins.clave), ins.id.clone());
                categoria_id_por_descripcion.insert(clave_cruce(&ins.descripcion), ins.id.clone());
            }
            if herramientas.contains(&ins.id) {
                herramienta_id_por_clave.insert(clave_cruce(&ins.clave), ins.id.clone());
                herramienta_id_por_descripcion
                    .insert(clave_cruce(&ins.descripcion), ins.id.clone());
            }
            if cuadrillas_existentes.contains(&ins.id) {
                por_clave.insert(clave_cruce(&ins.clave), ins.id.clone());
            }
        }

        let mut errores = Vec::new();
        let mut maestros: Vec<FilaMaestroCsv> = Vec::new();
        let mut indice_maestro: HashMap<String, usize> = HashMap::new();
        for (fila, registro) in maestro.filas {
            let clave = celda(&registro, col_clave);
            let descripcion = celda(&registro, col_descripcion);
            let unidad = col_unidad.map(|c| celda(&registro, c)).unwrap_or_default();
            let familia = col_familia.map(|c| celda(&registro, c)).unwrap_or_default();
            let subfamilia = col_subfamilia
                .map(|c| celda(&registro, c))
                .unwrap_or_default();
            if clave.is_empty() && descripcion.is_empty() {
                continue;
            }
            if clave.is_empty() {
                errores.push(format!("fila {fila}: clave vacía, se omitió"));
                continue;
            }
            if descripcion.is_empty() {
                errores.push(format!(
                    "fila {fila}: descripción de cuadrilla vacía, se omitió"
                ));
                continue;
            }
            let llave = clave_cruce(&clave);
            let item = FilaMaestroCsv {
                fila,
                clave,
                descripcion,
                unidad,
                familia,
                subfamilia,
            };
            if let Some(&idx) = indice_maestro.get(&llave) {
                errores.push(format!(
                    "fila {fila}: clave \"{}\" repetida en MAESTRO, se usó la última",
                    item.clave
                ));
                maestros[idx] = item;
            } else {
                indice_maestro.insert(llave, maestros.len());
                maestros.push(item);
            }
        }

        let mut detalles_por_clave: HashMap<String, Vec<FilaDetalleCsv>> = HashMap::new();
        for (fila, registro) in detalle.filas {
            let clave_cuadrilla = celda(&registro, col_det_clave);
            let seccion = celda(&registro, col_seccion);
            let clave_insumo = col_clave_insumo
                .map(|c| celda(&registro, c))
                .unwrap_or_default();
            let descripcion = celda(&registro, col_desc_insumo);
            let cantidad = celda(&registro, col_cantidad);
            if clave_cuadrilla.is_empty()
                && seccion.is_empty()
                && clave_insumo.is_empty()
                && descripcion.is_empty()
            {
                continue;
            }
            if clave_cuadrilla.is_empty() {
                errores.push(format!(
                    "fila {fila}: clave de cuadrilla vacía en DETALLE, se omitió"
                ));
                continue;
            }
            detalles_por_clave
                .entry(clave_cruce(&clave_cuadrilla))
                .or_default()
                .push(FilaDetalleCsv {
                    fila,
                    seccion,
                    clave_insumo,
                    descripcion,
                    cantidad,
                });
        }

        for (llave, filas) in &detalles_por_clave {
            if !indice_maestro.contains_key(llave) {
                let muestra = filas.first().map(|f| f.fila).unwrap_or(0);
                errores.push(format!(
                    "fila {muestra}: clave de DETALLE no aparece en MAESTRO, se omitió el grupo"
                ));
            }
        }

        let mut creados = 0u32;
        let mut actualizados = 0u32;
        let total = maestros.len() as u32;

        for (i, grupo) in maestros.into_iter().enumerate() {
            on_progreso(i as u32 + 1, total.max(1));
            let llave = clave_cruce(&grupo.clave);
            let filas_detalle = detalles_por_clave.remove(&llave).unwrap_or_default();
            let filas_csv = filas_detalle.len();

            let mut detalles_ok = Vec::new();
            for fila in &filas_detalle {
                match resolver_detalle_csv(
                    fila,
                    &categoria_id_por_clave,
                    &categoria_id_por_descripcion,
                    &herramienta_id_por_clave,
                    &herramienta_id_por_descripcion,
                ) {
                    Ok(detalle) => detalles_ok.push((fila.fila, etiqueta_detalle(fila), detalle)),
                    Err(e) => errores.push(e),
                }
            }
            if filas_csv > 0 && detalles_ok.is_empty() {
                errores.push(format!(
                    "cuadrilla \"{}\": ningún renglón de detalle pudo resolverse, no se modificó el detalle",
                    grupo.clave
                ));
            }

            let Some(unidad_id) = resolver_unidad_maestro(
                &grupo.unidad,
                &unidad_id_por_texto,
                &unidad_jor_id,
                grupo.fila,
                &mut errores,
            ) else {
                continue;
            };
            let (familia_id, sub_familia_id) = resolver_familia_csv(
                &grupo.familia,
                &grupo.subfamilia,
                &raiz_id_por_nombre,
                &hija_id_por_padre_y_nombre,
                grupo.fila,
                &mut errores,
            );

            let datos = CuadrillaData {
                clave: grupo.clave.clone(),
                descripcion: grupo.descripcion.clone(),
                unidad_id,
                familia_id,
                sub_familia_id,
            };

            let existente_id = por_clave.get(&llave).cloned();
            let cuadrilla = if let Some(id) = existente_id {
                match Self::actualizar(repo, id, datos, Some(creado_por.clone())).await {
                    Ok(c) => {
                        actualizados += 1;
                        c
                    }
                    Err(e) => {
                        errores.push(format!(
                            "cuadrilla \"{}\": no se pudo actualizar ({e})",
                            grupo.clave
                        ));
                        continue;
                    }
                }
            } else {
                match Self::crear(repo, organizacion_id, datos, creado_por.clone()).await {
                    Ok(c) => {
                        creados += 1;
                        c
                    }
                    Err(e) => {
                        errores.push(format!(
                            "cuadrilla \"{}\": no se pudo crear ({e})",
                            grupo.clave
                        ));
                        continue;
                    }
                }
            };

            por_clave.insert(llave, cuadrilla.id.clone());

            if filas_csv > 0 && detalles_ok.is_empty() {
                continue;
            }

            Self::sincronizar_detalles_importados(
                repo,
                &cuadrilla.id,
                detalles_ok,
                &categorias,
                &salarios_nacionales,
                &creado_por,
                &mut errores,
            )
            .await;
        }

        Ok(ResultadoImportacion::nuevo(
            creados,
            actualizados,
            errores,
            None,
        ))
    }

    async fn sincronizar_detalles_importados(
        repo: &dyn PortafolioRepository,
        cuadrilla_id: &str,
        detalles_ok: Vec<(usize, String, CuadrillaDetalleData)>,
        categorias: &HashSet<String>,
        salarios_nacionales: &HashSet<String>,
        creado_por: &str,
        errores: &mut Vec<String>,
    ) {
        let existentes =
            match CuadrillaDetalleService::listar_por_cuadrilla(repo, cuadrilla_id).await {
                Ok(d) => d,
                Err(e) => {
                    errores.push(format!("no se pudo leer el detalle de la cuadrilla ({e})"));
                    return;
                }
            };
        let mut detalle_id_por_insumo: HashMap<String, String> = existentes
            .iter()
            .map(|d| (d.detalle_insumo_id.clone(), d.id.clone()))
            .collect();
        let mut vistos: HashSet<String> = HashSet::new();

        for (fila, descripcion, detalle) in detalles_ok {
            let insumo_id = detalle.detalle_insumo_id.clone();
            let es_mano_obra = categorias.contains(&insumo_id);
            let es_alta = !detalle_id_por_insumo.contains_key(&insumo_id);
            vistos.insert(insumo_id.clone());

            if let Some(detalle_id) = detalle_id_por_insumo.get(&insumo_id).cloned() {
                if let Err(e) = CuadrillaDetalleService::actualizar(
                    repo,
                    detalle_id,
                    CuadrillaDetalleEditarData {
                        detalle_insumo_id: insumo_id,
                        cantidad: detalle.cantidad,
                    },
                    Some(creado_por.to_string()),
                )
                .await
                {
                    errores.push(format!(
                        "fila {fila}: no se pudo actualizar el detalle ({e})"
                    ));
                }
                continue;
            }

            match CuadrillaDetalleService::crear(
                repo,
                cuadrilla_id,
                detalle,
                creado_por.to_string(),
            )
            .await
            {
                Ok(_) => {
                    if es_alta && es_mano_obra && !salarios_nacionales.contains(&insumo_id) {
                        errores.push(format!("{descripcion} sin salario vigente, costo 0"));
                    }
                    if let Ok(lista) =
                        CuadrillaDetalleService::listar_por_cuadrilla(repo, cuadrilla_id).await
                    {
                        if let Some(d) = lista.iter().find(|d| d.detalle_insumo_id == insumo_id) {
                            detalle_id_por_insumo.insert(insumo_id.clone(), d.id.clone());
                        }
                    }
                }
                Err(e) => errores.push(format!("fila {fila}: no se pudo agregar el detalle ({e})")),
            }
        }

        for existente in existentes {
            if vistos.contains(&existente.detalle_insumo_id) {
                continue;
            }
            if let Err(e) =
                CuadrillaDetalleService::eliminar(repo, existente.id, creado_por.to_string()).await
            {
                errores.push(format!(
                    "no se pudo eliminar un renglón de detalle que ya no viene en el CSV ({e})"
                ));
            }
        }
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

struct FilaMaestroCsv {
    fila: usize,
    clave: String,
    descripcion: String,
    unidad: String,
    familia: String,
    subfamilia: String,
}

struct FilaDetalleCsv {
    fila: usize,
    seccion: String,
    clave_insumo: String,
    descripcion: String,
    cantidad: String,
}

fn etiqueta_detalle(fila: &FilaDetalleCsv) -> String {
    if !fila.descripcion.is_empty() {
        fila.descripcion.clone()
    } else {
        fila.clave_insumo.clone()
    }
}

fn parsear_seccion(
    seccion: &str,
) -> Option<obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle> {
    use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
    let normalizada = seccion.trim().to_lowercase().replace('_', " ");
    match normalizada.as_str() {
        "mano de obra" => Some(TipoCuadrillaDetalle::CategoriaFasar),
        "equipo y herramienta" | "equipo y herramientas" => {
            Some(TipoCuadrillaDetalle::EquipoHerramienta)
        }
        _ => None,
    }
}

fn resolver_unidad_maestro(
    texto: &str,
    unidad_id_por_texto: &HashMap<String, String>,
    unidad_jor_id: &str,
    fila: usize,
    errores: &mut Vec<String>,
) -> Option<String> {
    let token = texto.trim();
    if token.is_empty() {
        return Some(unidad_jor_id.to_string());
    }
    match unidad_id_por_texto.get(&token.to_lowercase()) {
        Some(id) => Some(id.clone()),
        None => {
            errores.push(format!(
                "fila {fila}: unidad \"{token}\" no encontrada, se omitió"
            ));
            None
        }
    }
}

fn resolver_detalle_csv(
    fila: &FilaDetalleCsv,
    categoria_id_por_clave: &HashMap<String, String>,
    categoria_id_por_descripcion: &HashMap<String, String>,
    herramienta_id_por_clave: &HashMap<String, String>,
    herramienta_id_por_descripcion: &HashMap<String, String>,
) -> Result<CuadrillaDetalleData, String> {
    use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
    let n = fila.fila;
    let Some(tipo) = parsear_seccion(&fila.seccion) else {
        return Err(format!(
            "fila {n}: sección \"{}\" no reconocida (use MANO DE OBRA o EQUIPO Y HERRAMIENTA), se omitió",
            fila.seccion
        ));
    };
    if fila.clave_insumo.is_empty() && fila.descripcion.is_empty() {
        return Err(format!(
            "fila {n}: detalle sin clave ni descripción de insumo, se omitió"
        ));
    }
    let Some(mut cantidad) = parsear_decimal(&fila.cantidad) else {
        return Err(format!(
            "fila {n}: cantidad \"{}\" no es un número válido, se omitió",
            fila.cantidad
        ));
    };
    let (por_clave, por_descripcion, etiqueta) = match tipo {
        TipoCuadrillaDetalle::CategoriaFasar => (
            categoria_id_por_clave,
            categoria_id_por_descripcion,
            "categoría FASAR",
        ),
        TipoCuadrillaDetalle::EquipoHerramienta => {
            if cantidad > Decimal::ZERO && cantidad <= Decimal::ONE {
                cantidad *= Decimal::ONE_HUNDRED;
            }
            (
                herramienta_id_por_clave,
                herramienta_id_por_descripcion,
                "herramienta",
            )
        }
    };
    let detalle_insumo_id = if !fila.clave_insumo.is_empty() {
        por_clave
            .get(&clave_cruce(&fila.clave_insumo))
            .cloned()
            .ok_or_else(|| {
                format!(
                    "fila {n}: {etiqueta} con clave \"{}\" no encontrada, se omitió",
                    fila.clave_insumo
                )
            })?
    } else {
        por_descripcion
            .get(&clave_cruce(&fila.descripcion))
            .cloned()
            .ok_or_else(|| {
                format!(
                    "fila {n}: {etiqueta} \"{}\" no encontrada, se omitió",
                    fila.descripcion
                )
            })?
    };
    Ok(CuadrillaDetalleData {
        detalle_insumo_id,
        cantidad,
    })
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
    async fn validar_familia_existe_acepta_nulo() {
        let (portafolio, _, _) = portafolio_con_unidad_y_familia().await;
        assert!(
            crate::validar_familia_existe(&portafolio, &None)
                .await
                .is_ok()
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
        let costo_nacional = creada
            .costo_nacional
            .as_ref()
            .expect("debe nacer con fila nacional");
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
        assert_eq!(
            actualizada.descripcion,
            "Cuadrilla de albañilería tipo A (2 ayudantes)"
        );

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

    async fn portafolio_listo_para_importar() -> (PortafolioSqliteRepository, String, String) {
        use crate::categoria_fasar::CategoriaFasarService;
        use crate::factor_salario_real::FactorSalarioRealService;
        use crate::organizacion::OrganizacionService;
        use crate::salario_categoria_fasar::{SalarioCategoriaFasarService, SalarioLoteItem};
        use crate::usuario::UsuarioService;
        use std::str::FromStr;

        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        crate::seed::sembrar_catalogos_generales(&portafolio)
            .await
            .expect("sembrar catálogos");

        let org = OrganizacionService::buscar_admin_obrix(&portafolio)
            .await
            .expect("organización sembrada");
        let admin = UsuarioService::buscar_admin_obrix(&portafolio)
            .await
            .expect("admin sembrado");
        let fsr = FactorSalarioRealService::listar(&portafolio, &org.id)
            .await
            .expect("listar FSR")
            .into_iter()
            .find(|f| f.region_id.is_none())
            .expect("FSR nacional");
        let categorias = CategoriaFasarService::listar(&portafolio, &org.id)
            .await
            .expect("listar categorías");
        let items: Vec<SalarioLoteItem> = categorias
            .into_iter()
            .map(|c| SalarioLoteItem {
                insumo_id: c.id,
                salario_base_diario: Decimal::from_str("100").unwrap(),
                factor_salario_real_id: fsr.id.clone(),
                factor_salario_real: Decimal::ONE,
                salario_real_diario: Decimal::from_str("100").unwrap(),
                region_id: None,
                fecha_vigencia_desde: "2026-01-01".into(),
            })
            .collect();
        SalarioCategoriaFasarService::crear_lote(&portafolio, items, admin.id.clone())
            .await
            .expect("registrar salarios dummy para poder armar cuadrillas");

        (portafolio, org.id, admin.id)
    }

    fn csv_cuadrillas(maestro: &str, detalle: &str) -> String {
        format!(
            "MAESTRO\nClave,Descripción,Unidad,Familia,Subfamilia\n{maestro}\n\nDETALLE\nClave Cuadrilla,Sección,Clave Insumo,Descripción Insumo,Unidad,Cantidad\n{detalle}"
        )
    }

    #[tokio::test]
    async fn importar_csv_maestro_detalle_resuelve_secciones_y_convierte_herramienta() {
        use crate::cuadrilla_detalle::CuadrillaDetalleService;
        use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
        use std::str::FromStr;

        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let csv = include_str!("../../../data/cuadrillas_2024.csv");

        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, csv, admin_id.clone())
            .await
            .expect("importar csv de cuadrillas");
        assert!(
            resultado.errores.is_empty(),
            "no debía haber errores: {:?}",
            resultado.errores
        );
        assert_eq!(resultado.importados, 29);
        assert_eq!(resultado.aviso, None);

        let listado = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar cuadrillas");
        assert_eq!(listado.len(), 29);

        let ayudante = listado
            .iter()
            .find(|c| c.clave == "00-M0001")
            .expect("cuadrilla 00-M0001");
        assert_eq!(ayudante.descripcion, "Cuadrilla 01 (Ayudante)");
        assert!(
            ayudante.familia_id.is_none(),
            "familia vacía en MAESTRO se importa en nulo"
        );

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &ayudante.id)
            .await
            .expect("listar detalles");
        assert_eq!(detalles.len(), 4);
        assert_eq!(
            detalles
                .iter()
                .filter(|d| d.tipo == TipoCuadrillaDetalle::CategoriaFasar)
                .count(),
            2
        );
        assert_eq!(
            detalles
                .iter()
                .filter(|d| d.tipo == TipoCuadrillaDetalle::EquipoHerramienta)
                .count(),
            2
        );

        let nacional = ayudante
            .costo_nacional
            .as_ref()
            .expect("valuación nacional");
        assert!(nacional.costo_total > Decimal::ZERO);
        let mut cantidades_herramienta: Vec<_> = detalles
            .iter()
            .filter(|d| d.tipo == TipoCuadrillaDetalle::EquipoHerramienta)
            .map(|d| d.cantidad)
            .collect();
        cantidades_herramienta.sort();
        assert_eq!(
            cantidades_herramienta,
            vec![
                Decimal::from_str("2").unwrap(),
                Decimal::from_str("3").unwrap()
            ],
            "0.02 y 0.03 del CSV deben importarse como 2% y 3% (0–100), no como fracción"
        );

        let reimportar = CuadrillaService::importar_csv(&portafolio, &org_id, csv, admin_id)
            .await
            .expect("reimportar el mismo CSV no debe duplicar cuadrillas");
        assert_eq!(reimportar.creados, 0);
        assert_eq!(reimportar.actualizados, 29);
        let listado2 = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar tras reimportar");
        assert_eq!(listado2.len(), 29);
    }

    #[tokio::test]
    async fn importar_csv_clave_es_obligatoria_y_no_busca_por_descripcion() {
        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let alta = csv_cuadrillas(
            "C-1,Cuadrilla de prueba,jor,,\n",
            "C-1,MANO DE OBRA,,Ayudante oficial,jor,1\n",
        );
        CuadrillaService::importar_csv(&portafolio, &org_id, &alta, admin_id.clone())
            .await
            .expect("alta inicial");

        let sin_clave = csv_cuadrillas(
            ",Otra descripción,jor,,\n",
            ",MANO DE OBRA,,Ayudante oficial,jor,1\n",
        );
        let omitida =
            CuadrillaService::importar_csv(&portafolio, &org_id, &sin_clave, admin_id.clone())
                .await
                .expect("clave vacía se omite");
        assert_eq!(omitida.importados, 0);
        assert!(
            omitida.errores.iter().any(|e| e.contains("clave vacía")),
            "{:?}",
            omitida.errores
        );

        let otra_clave = csv_cuadrillas(
            "C-2,Cuadrilla de prueba,jor,,\n",
            "C-2,MANO DE OBRA,,Ayudante oficial,jor,1\n",
        );
        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, &otra_clave, admin_id)
            .await
            .expect("misma descripción, otra clave");
        assert_eq!(resultado.creados, 1);
        assert_eq!(resultado.actualizados, 0);

        let listado = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar");
        let mut claves: Vec<_> = listado.iter().map(|c| c.clave.as_str()).collect();
        claves.sort();
        assert_eq!(claves, vec!["C-1", "C-2"]);
    }

    #[tokio::test]
    async fn importar_csv_resuelve_unidad_por_variantes() {
        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let csv = csv_cuadrillas(
            "C-JOR,Cuadrilla jornada,jornada,,\n",
            "C-JOR,MANO DE OBRA,,Ayudante oficial,jor,1\n",
        );

        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, &csv, admin_id)
            .await
            .expect("importar con variante de unidad");
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);
        assert_eq!(resultado.importados, 1);

        let cuadrilla = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar")
            .into_iter()
            .find(|c| c.clave == "C-JOR")
            .expect("cuadrilla importada");
        let unidades = obrix_db::entities::unidad_medida::Entity::find()
            .all(portafolio.conexion())
            .await
            .unwrap();
        let mapa = UnidadMedidaService::mapa_id_por_texto(&unidades);
        assert_eq!(cuadrilla.unidad_id, mapa["jor"]);
        assert_eq!(cuadrilla.unidad_id, mapa["jornada"]);
    }

    #[tokio::test]
    async fn importar_csv_reporta_categoria_y_seccion_desconocidas() {
        use crate::cuadrilla_detalle::CuadrillaDetalleService;

        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let csv = csv_cuadrillas(
            "C-1,Cuadrilla mala,jor,,\nC-2,Cuadrilla rara,jor,,\nC-3,Cuadrilla buena,jor,,\n",
            "C-1,MANO DE OBRA,,Oficio inventado,jor,1\n\
             C-2,SECCION INEXISTENTE,,Ayudante oficial,jor,1\n\
             C-3,MANO DE OBRA,,Ayudante oficial,jor,1\n",
        );

        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, &csv, admin_id)
            .await
            .expect("importar con errores");
        assert_eq!(
            resultado.importados, 3,
            "el maestro se importa aunque falle el detalle"
        );
        assert!(
            resultado
                .errores
                .iter()
                .any(|e| e.contains("Oficio inventado"))
        );
        assert!(
            resultado
                .errores
                .iter()
                .any(|e| e.contains("SECCION INEXISTENTE"))
        );

        let listado = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar");
        assert_eq!(listado.len(), 3);
        let buena = listado.iter().find(|c| c.clave == "C-3").expect("C-3");
        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &buena.id)
            .await
            .expect("detalle C-3");
        assert_eq!(detalles.len(), 1);
        let mala = listado.iter().find(|c| c.clave == "C-1").expect("C-1");
        let detalles_mala = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &mala.id)
            .await
            .expect("detalle C-1");
        assert!(detalles_mala.is_empty());
    }

    #[tokio::test]
    async fn importar_csv_mano_de_obra_sin_salario_entra_en_cero_con_aviso() {
        use crate::categoria_fasar::{CategoriaFasarData, CategoriaFasarService};
        use crate::cuadrilla_costo_detalle::CuadrillaCostoDetalleService;
        use crate::cuadrilla_detalle::CuadrillaDetalleService;

        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let unidad_id = CategoriaFasarService::listar(&portafolio, &org_id)
            .await
            .expect("listar categorías")
            .into_iter()
            .next()
            .expect("hay categorías sembradas")
            .unidad_id;
        CategoriaFasarService::crear(
            &portafolio,
            &org_id,
            CategoriaFasarData {
                clave: "CAT-SIN".into(),
                descripcion: "Ayudante oficial extra".into(),
                unidad_id,
                familia_id: None,
                sub_familia_id: None,
            },
            admin_id.clone(),
        )
        .await
        .expect("crear categoría sin salario");

        let csv = csv_cuadrillas(
            "C-SIN,Cuadrilla sin salario,jor,,\n",
            "C-SIN,MANO DE OBRA,,Ayudante oficial extra,jor,2\n",
        );

        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, &csv, admin_id)
            .await
            .expect("importar con integrante sin salario");
        assert_eq!(resultado.importados, 1);
        assert!(
            resultado
                .errores
                .iter()
                .any(|e| e == "Ayudante oficial extra sin salario vigente, costo 0"),
            "debe avisarse el costo en cero: {:?}",
            resultado.errores
        );

        let listado = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar");
        let cuadrilla = listado
            .iter()
            .find(|c| c.clave == "C-SIN")
            .expect("cuadrilla importada");
        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar detalles");
        assert_eq!(detalles.len(), 1, "el integrante debe quedar en la receta");

        let nacional = cuadrilla
            .costo_nacional
            .as_ref()
            .expect("valuación nacional");
        assert_eq!(nacional.sub_total_mano_obra, Decimal::ZERO);
        assert_eq!(nacional.costo_total, Decimal::ZERO);
        let costos = CuadrillaCostoDetalleService::listar_por_costo(&portafolio, &nacional.id)
            .await
            .expect("detalles de valuación");
        assert_eq!(costos.len(), 1);
        assert_eq!(detalles[0].cantidad, Decimal::from(2));
        assert_eq!(costos[0].costo, Decimal::ZERO);
        assert_eq!(costos[0].importe, Decimal::ZERO);
    }

    #[tokio::test]
    async fn importar_csv_sincroniza_detalle_cantidad_alta_y_baja() {
        use crate::cuadrilla_detalle::CuadrillaDetalleService;
        use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
        use std::str::FromStr;

        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let inicial = csv_cuadrillas(
            "C-SYNC,Cuadrilla sync,jor,,\n",
            "C-SYNC,MANO DE OBRA,,Ayudante oficial,jor,1\n\
             C-SYNC,MANO DE OBRA,,Oficial albañil,jor,1\n\
             C-SYNC,EQUIPO Y HERRAMIENTA,,Herramienta de mano,%mo,0.03\n",
        );
        CuadrillaService::importar_csv(&portafolio, &org_id, &inicial, admin_id.clone())
            .await
            .expect("alta inicial");

        let segundo = csv_cuadrillas(
            "C-SYNC,Cuadrilla sync nueva,jor,Mano de obra,\n",
            "C-SYNC,MANO DE OBRA,,Ayudante oficial,jor,2\n\
             C-SYNC,MANO DE OBRA,,Cabo de oficios,jor,0.1\n",
        );
        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, &segundo, admin_id)
            .await
            .expect("reimportar sincronizando detalle");
        assert_eq!(resultado.creados, 0);
        assert_eq!(resultado.actualizados, 1);
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);

        let cuadrilla = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar")
            .into_iter()
            .find(|c| c.clave == "C-SYNC")
            .expect("C-SYNC");
        assert_eq!(cuadrilla.descripcion, "Cuadrilla sync nueva");
        assert!(cuadrilla.familia_id.is_some());

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("detalles");
        assert_eq!(detalles.len(), 2);
        assert!(
            detalles
                .iter()
                .all(|d| d.tipo == TipoCuadrillaDetalle::CategoriaFasar)
        );
        let mut cantidades: Vec<_> = detalles.iter().map(|d| d.cantidad).collect();
        cantidades.sort();
        assert_eq!(
            cantidades,
            vec![Decimal::from_str("0.1").unwrap(), Decimal::from(2),]
        );
    }

    #[tokio::test]
    async fn importar_csv_resuelve_detalle_por_clave_insumo() {
        use crate::categoria_fasar::CategoriaFasarService;
        use crate::cuadrilla_detalle::CuadrillaDetalleService;

        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let ayudante = CategoriaFasarService::listar(&portafolio, &org_id)
            .await
            .expect("categorías")
            .into_iter()
            .find(|c| c.descripcion == "Ayudante oficial")
            .expect("Ayudante oficial sembrado");
        let csv = csv_cuadrillas(
            "C-CLAVE,Cuadrilla por clave,jor,,\n",
            &format!(
                "C-CLAVE,MANO DE OBRA,{},descripcion que no debe usarse,jor,3\n",
                ayudante.clave
            ),
        );
        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, &csv, admin_id)
            .await
            .expect("importar por clave de insumo");
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);
        assert_eq!(resultado.importados, 1);

        let cuadrilla = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar")
            .into_iter()
            .find(|c| c.clave == "C-CLAVE")
            .expect("C-CLAVE");
        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("detalles");
        assert_eq!(detalles.len(), 1);
        assert_eq!(detalles[0].detalle_insumo_id, ayudante.id);
        assert_eq!(detalles[0].cantidad, Decimal::from(3));
    }

    #[tokio::test]
    async fn importar_csv_requiere_secciones_maestro_y_detalle() {
        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let err = CuadrillaService::importar_csv(
            &portafolio,
            &org_id,
            "Clave,Descripción\nC-1,Sin secciones\n",
            admin_id,
        )
        .await
        .expect_err("sin secciones debe fallar");
        assert!(err.to_string().contains("MAESTRO"), "{err}");
    }
}
