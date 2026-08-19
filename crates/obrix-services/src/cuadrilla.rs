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
use std::collections::HashMap;

use crate::cuadrilla_detalle::{
    CuadrillaDetalleData, CuadrillaDetalleEditarData, CuadrillaDetalleService,
};
use crate::material::ResultadoImportacion;
use crate::unidad_medida::UnidadMedidaService;
use crate::{ServiceError, clave_cruce, id_insumo_existente, nuevo_id, recordar_insumo};

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

    /// Importa cuadrillas desde un CSV denormalizado (cabecera + detalle en
    /// las mismas filas) con columnas `Clave Cuadrilla,Descripción Cuadrilla
    /// (o Nombre Cuadrilla),Sección,Descripción,Unidad,Cantidad`.
    ///
    /// No es un registro plano: filas consecutivas (o no) con la misma clave
    /// o, si no hay clave, la misma descripción de cuadrilla, se agrupan en
    /// una sola `cuadrilla` y cada renglón entra a `cuadrilla_detalle`.
    /// Si la cuadrilla ya existe (por clave o, si no hay match, por
    /// descripción; ambas sin distinguir mayúsculas) se actualiza la
    /// cabecera y se hace upsert de integrantes (cantidad si ya está, alta
    /// si no). `MANO DE OBRA` se resuelve contra `insumo.descripcion` de
    /// `categoria_fasar`; `EQUIPO Y HERRAMIENTA` contra `insumo.descripcion`
    /// de `herramienta`. Familia default: "Mano de obra". Unidad de la
    /// cabecera: se toma del primer renglón de mano de obra y se resuelve
    /// con `UnidadMedidaService::mapa_id_por_texto` (símbolo y variantes);
    /// si la columna falta, está vacía o no hay match, se usa `jor`. Si el
    /// archivo no trae clave (columna ausente o celda vacía) y
    /// es alta, se genera `CUA-001`, `CUA-002`, … continuando desde la
    /// `CUA-` más alta ya registrada. Las cantidades de herramienta en
    /// fracción (`0.03`) se convierten a porcentaje 0–100. Un integrante de
    /// mano de obra sin salario vigente sí se agrega, con costo 0, y se
    /// reporta en `errores` (`"{descripción} sin salario vigente, costo 0"`).
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
        let mut lector = csv::ReaderBuilder::new()
            .flexible(true)
            .trim(csv::Trim::Headers)
            .from_reader(contenido.as_bytes());
        let headers = lector
            .headers()
            .map_err(|e| {
                ServiceError::Validacion(format!(
                    "no se pudieron leer los encabezados del CSV: {e}"
                ))
            })?
            .clone();

        let col_clave = buscar_columna(&headers, &["clave cuadrilla", "clave"]);
        let col_descripcion_cuadrilla = buscar_columna(
            &headers,
            &["descripción cuadrilla", "descripcion cuadrilla", "nombre cuadrilla"],
        )
        .ok_or_else(|| {
            ServiceError::Validacion(
                "el archivo debe tener la columna \"Descripción Cuadrilla\" (o \"Nombre Cuadrilla\")".into(),
            )
        })?;
        let col_seccion = buscar_columna(&headers, &["sección", "seccion"]).ok_or_else(|| {
            ServiceError::Validacion("el archivo debe tener la columna \"Sección\"".into())
        })?;
        let col_descripcion = buscar_columna(&headers, &["descripción", "descripcion"])
            .ok_or_else(|| {
                ServiceError::Validacion("el archivo debe tener la columna \"Descripción\"".into())
            })?;
        let col_cantidad = buscar_columna(&headers, &["cantidad"]).ok_or_else(|| {
            ServiceError::Validacion("el archivo debe tener la columna \"Cantidad\"".into())
        })?;
        let col_unidad = buscar_columna(&headers, &["unidad"]);

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
        let familia_mano_obra_id = familia_mano_obra_id(repo).await?;

        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
        let categorias: std::collections::HashSet<String> = categoria_fasar::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|c| c.insumo_id)
            .collect();
        let herramientas: std::collections::HashSet<String> = herramienta::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|h| h.insumo_id)
            .collect();
        let salarios_nacionales: std::collections::HashSet<String> =
            salario_categoria_fasar::Entity::find()
                .filter(salario_categoria_fasar::Column::RegionId.is_null())
                .filter(salario_categoria_fasar::Column::FechaVigenciaHasta.is_null())
                .all(repo.conexion())
                .await?
                .into_iter()
                .map(|s| s.insumo_id)
                .collect();
        let mut categoria_id_por_descripcion: HashMap<String, String> = HashMap::new();
        let mut herramienta_id_por_descripcion: HashMap<String, String> = HashMap::new();
        let cuadrillas_existentes: std::collections::HashSet<String> = cuadrilla::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|c| c.insumo_id)
            .collect();
        let mut clave_por_id: HashMap<String, String> = HashMap::new();
        let mut por_clave: HashMap<String, String> = HashMap::new();
        let mut por_descripcion: HashMap<String, String> = HashMap::new();
        for ins in &insumos {
            let clave_desc = clave_cruce(&ins.descripcion);
            if categorias.contains(&ins.id) {
                categoria_id_por_descripcion.insert(clave_desc.clone(), ins.id.clone());
            }
            if herramientas.contains(&ins.id) {
                herramienta_id_por_descripcion.insert(clave_desc, ins.id.clone());
            }
            if cuadrillas_existentes.contains(&ins.id) {
                clave_por_id.insert(ins.id.clone(), ins.clave.clone());
                recordar_insumo(
                    &mut por_clave,
                    &mut por_descripcion,
                    &ins.id,
                    &ins.clave,
                    &ins.descripcion,
                );
            }
        }

        let mut siguiente_consecutivo = insumos
            .iter()
            .filter_map(|i| parsear_consecutivo_cua(&i.clave))
            .max()
            .unwrap_or(0)
            + 1;

        let mut grupos: Vec<GrupoImportacion> = Vec::new();
        let mut indice_por_llave: HashMap<String, usize> = HashMap::new();
        let mut errores = Vec::new();

        for (i, registro) in lector.records().enumerate() {
            let fila = i + 2;
            let registro = match registro {
                Ok(r) => r,
                Err(e) => {
                    errores.push(format!("fila {fila}: {e}"));
                    continue;
                }
            };
            let descripcion_cuadrilla = celda(&registro, col_descripcion_cuadrilla);
            let clave_archivo = col_clave
                .map(|c| celda(&registro, c))
                .filter(|c| !c.is_empty());
            let seccion = celda(&registro, col_seccion);
            let descripcion = celda(&registro, col_descripcion);
            let cantidad = celda(&registro, col_cantidad);
            let unidad = col_unidad
                .map(|c| celda(&registro, c))
                .unwrap_or_default();

            if descripcion_cuadrilla.is_empty()
                && clave_archivo.is_none()
                && seccion.is_empty()
                && descripcion.is_empty()
            {
                continue;
            }
            if descripcion_cuadrilla.is_empty() {
                errores.push(format!(
                    "fila {fila}: descripción de cuadrilla vacía, se omitió"
                ));
                continue;
            }

            let llave = match &clave_archivo {
                Some(clave) => format!("c:{}", clave_cruce(clave)),
                None => format!("d:{}", clave_cruce(&descripcion_cuadrilla)),
            };
            if let Some(&idx) = indice_por_llave.get(&llave) {
                grupos[idx].filas.push(FilaDetalleCsv {
                    fila,
                    seccion,
                    descripcion,
                    cantidad,
                    unidad,
                });
            } else {
                indice_por_llave.insert(llave, grupos.len());
                grupos.push(GrupoImportacion {
                    clave_archivo,
                    descripcion: descripcion_cuadrilla,
                    filas: vec![FilaDetalleCsv {
                        fila,
                        seccion,
                        descripcion,
                        cantidad,
                        unidad,
                    }],
                });
            }
        }

        let mut creados = 0u32;
        let mut actualizados = 0u32;
        let mut se_autogenero_clave = false;
        let total = grupos.len() as u32;

        for (i, grupo) in grupos.into_iter().enumerate() {
            on_progreso(i as u32 + 1, total.max(1));

            let mut detalles_ok = Vec::new();
            for fila in &grupo.filas {
                match resolver_detalle_csv(
                    fila,
                    &categoria_id_por_descripcion,
                    &herramienta_id_por_descripcion,
                ) {
                    Ok(detalle) => detalles_ok.push((fila.fila, fila.descripcion.clone(), detalle)),
                    Err(e) => errores.push(e),
                }
            }
            if detalles_ok.is_empty() {
                errores.push(format!(
                    "cuadrilla \"{}\": ningún renglón de detalle pudo resolverse, se omitió",
                    grupo.descripcion
                ));
                continue;
            }

            let existente_id = id_insumo_existente(
                grupo.clave_archivo.as_deref(),
                &grupo.descripcion,
                &por_clave,
                &por_descripcion,
            );
            let clave = match (grupo.clave_archivo.as_deref(), existente_id.as_deref()) {
                (Some(clave_archivo), _) => clave_archivo.to_string(),
                (None, Some(id)) => clave_por_id
                    .get(id)
                    .cloned()
                    .unwrap_or_else(|| id.to_string()),
                (None, None) => {
                    let clave = formatear_clave_cua(siguiente_consecutivo);
                    siguiente_consecutivo += 1;
                    se_autogenero_clave = true;
                    clave
                }
            };

            let datos = CuadrillaData {
                clave: clave.clone(),
                descripcion: grupo.descripcion.clone(),
                unidad_id: unidad_cabecera(
                    &grupo.filas,
                    &unidad_id_por_texto,
                    &unidad_jor_id,
                    &mut errores,
                ),
                familia_id: familia_mano_obra_id.clone(),
                sub_familia_id: None,
            };

            let cuadrilla = if let Some(id) = existente_id {
                match Self::actualizar(repo, id, datos, Some(creado_por.clone())).await {
                    Ok(c) => {
                        actualizados += 1;
                        c
                    }
                    Err(e) => {
                        errores.push(format!(
                            "cuadrilla \"{}\": no se pudo actualizar ({e})",
                            grupo.descripcion
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
                            grupo.descripcion
                        ));
                        continue;
                    }
                }
            };

            clave_por_id.insert(cuadrilla.id.clone(), cuadrilla.clave.clone());
            recordar_insumo(
                &mut por_clave,
                &mut por_descripcion,
                &cuadrilla.id,
                &cuadrilla.clave,
                &cuadrilla.descripcion,
            );

            Self::aplicar_detalles_importados(
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

        let aviso = if se_autogenero_clave {
            if col_clave.is_none() {
                Some(
                    "El archivo no tiene columna \"Clave Cuadrilla\"; se generaron claves automáticas con el prefijo CUA-."
                        .to_string(),
                )
            } else {
                Some(
                    "Algunas filas no traían clave; se generaron claves automáticas con el prefijo CUA-.".to_string(),
                )
            }
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

    async fn aplicar_detalles_importados(
        repo: &dyn PortafolioRepository,
        cuadrilla_id: &str,
        detalles_ok: Vec<(usize, String, CuadrillaDetalleData)>,
        categorias: &std::collections::HashSet<String>,
        salarios_nacionales: &std::collections::HashSet<String>,
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

        for (fila, descripcion, detalle) in detalles_ok {
            let insumo_id = detalle.detalle_insumo_id.clone();
            let es_mano_obra = categorias.contains(&insumo_id);
            let es_alta = !detalle_id_por_insumo.contains_key(&insumo_id);

            if let Some(detalle_id) = detalle_id_por_insumo.get(&insumo_id).cloned() {
                if let Err(e) = CuadrillaDetalleService::actualizar(
                    repo,
                    detalle_id,
                    CuadrillaDetalleEditarData {
                        detalle_insumo_id: insumo_id.clone(),
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

struct GrupoImportacion {
    clave_archivo: Option<String>,
    descripcion: String,
    filas: Vec<FilaDetalleCsv>,
}

struct FilaDetalleCsv {
    fila: usize,
    seccion: String,
    descripcion: String,
    cantidad: String,
    unidad: String,
}

fn buscar_columna(headers: &csv::StringRecord, candidatos: &[&str]) -> Option<usize> {
    headers.iter().position(|h| {
        let n = h.trim().trim_start_matches('\u{feff}').to_lowercase();
        candidatos.iter().any(|c| n == *c)
    })
}

fn celda(registro: &csv::StringRecord, indice: usize) -> String {
    registro.get(indice).unwrap_or("").trim().to_string()
}

fn parsear_consecutivo_cua(clave: &str) -> Option<u32> {
    clave.strip_prefix("CUA-")?.parse().ok()
}

fn formatear_clave_cua(n: u32) -> String {
    format!("CUA-{n:03}")
}

fn parsear_decimal(texto: &str) -> Option<Decimal> {
    let limpio: String = texto
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();
    if limpio.is_empty() {
        return None;
    }
    limpio.parse().ok()
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

fn resolver_detalle_csv(
    fila: &FilaDetalleCsv,
    categoria_id_por_descripcion: &HashMap<String, String>,
    herramienta_id_por_descripcion: &HashMap<String, String>,
) -> Result<CuadrillaDetalleData, String> {
    use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
    let n = fila.fila;
    if fila.descripcion.is_empty() {
        return Err(format!("fila {n}: descripción de detalle vacía, se omitió"));
    }
    let Some(tipo) = parsear_seccion(&fila.seccion) else {
        return Err(format!(
            "fila {n}: sección \"{}\" no reconocida (use MANO DE OBRA o EQUIPO Y HERRAMIENTA), se omitió",
            fila.seccion
        ));
    };
    let Some(mut cantidad) = parsear_decimal(&fila.cantidad) else {
        return Err(format!(
            "fila {n}: cantidad \"{}\" no es un número válido, se omitió",
            fila.cantidad
        ));
    };
    let clave_desc = clave_cruce(&fila.descripcion);
    let detalle_insumo_id = match tipo {
        TipoCuadrillaDetalle::CategoriaFasar => categoria_id_por_descripcion
            .get(&clave_desc)
            .cloned()
            .ok_or_else(|| {
                format!(
                    "fila {n}: categoría FASAR \"{}\" no encontrada, se omitió",
                    fila.descripcion
                )
            })?,
        TipoCuadrillaDetalle::EquipoHerramienta => {
            if cantidad > Decimal::ZERO && cantidad <= Decimal::ONE {
                cantidad *= Decimal::ONE_HUNDRED;
            }
            herramienta_id_por_descripcion
                .get(&clave_desc)
                .cloned()
                .ok_or_else(|| {
                    format!(
                        "fila {n}: herramienta \"{}\" no encontrada, se omitió",
                        fila.descripcion
                    )
                })?
        }
    };
    Ok(CuadrillaDetalleData {
        detalle_insumo_id,
        cantidad,
    })
}

fn unidad_cabecera(
    filas: &[FilaDetalleCsv],
    unidad_id_por_texto: &HashMap<String, String>,
    unidad_jor_id: &str,
    errores: &mut Vec<String>,
) -> String {
    use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
    for fila in filas {
        if parsear_seccion(&fila.seccion) != Some(TipoCuadrillaDetalle::CategoriaFasar) {
            continue;
        }
        let token = fila.unidad.trim();
        if token.is_empty() {
            continue;
        }
        match unidad_id_por_texto.get(&token.to_lowercase()) {
            Some(id) => return id.clone(),
            None => errores.push(format!(
                "fila {}: unidad \"{}\" no encontrada",
                fila.fila, token
            )),
        }
    }
    unidad_jor_id.to_string()
}

async fn familia_mano_obra_id(
    repo: &dyn PortafolioRepository,
) -> Result<Option<String>, ServiceError> {
    let familias = familia_insumo::Entity::find()
        .filter(familia_insumo::Column::Deleted.eq(false))
        .filter(familia_insumo::Column::ParentId.is_null())
        .all(repo.conexion())
        .await?;
    Ok(familias
        .into_iter()
        .find(|f| f.nombre.trim().eq_ignore_ascii_case("mano de obra"))
        .map(|f| f.id))
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

    #[tokio::test]
    async fn importar_csv_agrupa_detalle_resuelve_secciones_y_asigna_familia_mano_de_obra() {
        use crate::cuadrilla_detalle::CuadrillaDetalleService;
        use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
        use std::str::FromStr;

        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let csv = include_str!("../../../data/cuadrillas_detalle_2024.csv");

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
            ayudante.familia_id.is_some(),
            "familia default Mano de obra"
        );

        let familia = obrix_db::entities::familia_insumo::Entity::find_by_id(
            ayudante.familia_id.as_ref().unwrap(),
        )
        .one(portafolio.conexion())
        .await
        .unwrap()
        .expect("familia");
        assert_eq!(familia.nombre, "Mano de obra");

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
    async fn importar_csv_sin_clave_genera_cua_con_tres_digitos() {
        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let csv = "Descripción Cuadrilla,Sección,Descripción,Unidad,Cantidad\n\
                    Cuadrilla de prueba,MANO DE OBRA,Ayudante oficial,jor,1\n\
                    Cuadrilla de prueba,EQUIPO Y HERRAMIENTA,Herramienta de mano,%mo,0.03\n\
                    Otra cuadrilla,MANO DE OBRA,Oficial albañil,jor,1\n";

        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, csv, admin_id.clone())
            .await
            .expect("importar sin clave");
        assert_eq!(resultado.importados, 2);
        assert!(
            resultado
                .aviso
                .as_deref()
                .is_some_and(|a| a.contains("CUA-")),
            "debe avisarse que se autogeneraron claves CUA-: {:?}",
            resultado.aviso
        );
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);

        let listado = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar");
        let mut claves: Vec<_> = listado.iter().map(|c| c.clave.as_str()).collect();
        claves.sort();
        assert_eq!(claves, vec!["CUA-001", "CUA-002"]);

        let csv_re = "Descripción Cuadrilla,Sección,Descripción,Unidad,Cantidad\n\
                    CUADRILLA DE PRUEBA,MANO DE OBRA,Ayudante oficial,jor,1\n\
                    CUADRILLA DE PRUEBA,EQUIPO Y HERRAMIENTA,Herramienta de mano,%mo,0.03\n\
                    otra cuadrilla,MANO DE OBRA,Oficial albañil,jor,1\n";
        let reimportar = CuadrillaService::importar_csv(&portafolio, &org_id, csv_re, admin_id)
            .await
            .expect("reimportar por descripción sin distinguir mayúsculas");
        assert_eq!(reimportar.creados, 0);
        assert_eq!(reimportar.actualizados, 2);
        assert!(
            reimportar.aviso.is_none(),
            "no se autogeneraron claves: {:?}",
            reimportar.aviso
        );

        let listado2 = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar tras reimportar");
        assert_eq!(listado2.len(), 2);
        let mut claves2: Vec<_> = listado2.iter().map(|c| c.clave.as_str()).collect();
        claves2.sort();
        assert_eq!(claves2, vec!["CUA-001", "CUA-002"]);
        let prueba = listado2
            .iter()
            .find(|c| c.clave == "CUA-001")
            .expect("cuadrilla de prueba");
        assert_eq!(prueba.descripcion, "CUADRILLA DE PRUEBA");
    }

    #[tokio::test]
    async fn importar_csv_resuelve_unidad_por_variantes() {
        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let csv = "Descripción Cuadrilla,Sección,Descripción,Unidad,Cantidad\n\
                    Cuadrilla jornada,MANO DE OBRA,Ayudante oficial,jornada,1\n";

        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, csv, admin_id)
            .await
            .expect("importar con variante de unidad");
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);
        assert_eq!(resultado.importados, 1);

        let cuadrilla = CuadrillaService::listar(&portafolio, &org_id)
            .await
            .expect("listar")
            .into_iter()
            .find(|c| c.descripcion == "Cuadrilla jornada")
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
        let (portafolio, org_id, admin_id) = portafolio_listo_para_importar().await;
        let csv = "Clave Cuadrilla,Descripción Cuadrilla,Sección,Descripción,Cantidad\n\
                    C-1,Cuadrilla mala,MANO DE OBRA,Oficio inventado,1\n\
                    C-2,Cuadrilla rara,SECCION INEXISTENTE,Ayudante oficial,1\n\
                    C-3,Cuadrilla buena,MANO DE OBRA,Ayudante oficial,1\n";

        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, csv, admin_id)
            .await
            .expect("importar con errores");
        assert_eq!(
            resultado.importados, 1,
            "solo la cuadrilla con detalle resoluble"
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
        assert_eq!(listado.len(), 1);
        assert_eq!(listado[0].clave, "C-3");
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

        let csv = "Clave Cuadrilla,Descripción Cuadrilla,Sección,Descripción,Cantidad\n\
                    C-SIN,Cuadrilla sin salario,MANO DE OBRA,Ayudante oficial extra,2\n";

        let resultado = CuadrillaService::importar_csv(&portafolio, &org_id, csv, admin_id)
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
}
