//! `basico_auxiliar` es una extensión 1:1 de `insumo` — este servicio
//! administra ambas tablas juntas. La receta de primer nivel vive en
//! `basico_auxiliar_componente`; la valuación por región, en
//! `basico_auxiliar_costo`. `costo_nacional` es un reflejo de conveniencia.

use obrix_db::PortafolioRepository;
use obrix_db::entities::basico_auxiliar_componente::TipoBasicoAuxiliarComponente;
use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{
    basico_auxiliar, basico_auxiliar_costo, basico_auxiliar_costo_detalle, categoria_fasar,
    cuadrilla, equipo_costo_horario, familia_insumo, material,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseTransaction, EntityTrait,
    QueryFilter, TransactionTrait,
};
use std::collections::{HashMap, HashSet};

use crate::basico_auxiliar_componente::{BasicoAuxiliarComponenteData, BasicoAuxiliarComponenteService};
use crate::basico_auxiliar_costo_detalle::{
    BasicoAuxiliarCostoDetalleCantidadData, BasicoAuxiliarCostoDetalleService,
};
use crate::csv_secciones::{buscar_columna, celda, parsear_decimal, parsear_secciones_maestro_detalle};
use crate::material::ResultadoImportacion;
use crate::unidad_medida::UnidadMedidaService;
use crate::{
    ServiceError, clave_cruce, id_insumo_existente, mapas_familia, nuevo_id, recordar_insumo,
    resolver_familia_csv,
};

#[derive(serde::Deserialize)]
pub struct BasicoAuxiliarData {
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BasicoAuxiliarCompleto {
    pub id: String,
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    pub costo_nacional: Option<basico_auxiliar_costo::Model>,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

pub(crate) fn combinar(
    insumo: insumo::Model,
    _aux: basico_auxiliar::Model,
    costo_nacional: Option<basico_auxiliar_costo::Model>,
) -> BasicoAuxiliarCompleto {
    BasicoAuxiliarCompleto {
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

pub struct BasicoAuxiliarService;

impl BasicoAuxiliarService {
    fn validar(datos: &BasicoAuxiliarData, actualizando: bool) -> Result<(), ServiceError> {
        let accion = crate::accion(actualizando);
        if datos.clave.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un básico auxiliar sin clave."
            )));
        }
        if datos.descripcion.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un básico auxiliar sin descripción."
            )));
        }
        if datos.unidad_id.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un básico auxiliar sin unidad."
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
    ) -> Result<Vec<BasicoAuxiliarCompleto>, ServiceError> {
        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::BasicoAuxiliar))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;

        let mut resultado = Vec::with_capacity(insumos.len());
        for ins in insumos {
            let Some(aux) = basico_auxiliar::Entity::find_by_id(&ins.id)
                .one(repo.conexion())
                .await?
            else {
                continue;
            };
            let costo_nacional = Self::buscar_costo_nacional(repo, &ins.id).await?;
            resultado.push(combinar(ins, aux, costo_nacional));
        }
        Ok(resultado)
    }

    pub async fn buscar_por_id(
        repo: &dyn PortafolioRepository,
        id: &str,
    ) -> Result<BasicoAuxiliarCompleto, ServiceError> {
        let ins = insumo::Entity::find_by_id(id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("basico_auxiliar {id}")))?;
        let aux = basico_auxiliar::Entity::find_by_id(id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("basico_auxiliar {id}")))?;
        let costo_nacional = Self::buscar_costo_nacional(repo, id).await?;
        Ok(combinar(ins, aux, costo_nacional))
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: BasicoAuxiliarData,
        creado_por: String,
    ) -> Result<BasicoAuxiliarCompleto, ServiceError> {
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
            tipo: Set(TipoInsumo::BasicoAuxiliar),
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

        let aux = basico_auxiliar::ActiveModel {
            insumo_id: Set(id.clone()),
        }
        .insert(&txn)
        .await?;

        let costo_nacional = basico_auxiliar_costo::ActiveModel {
            id: Set(nuevo_id()),
            basico_auxiliar_id: Set(id),
            region_id: Set(None),
            sub_total_material: Set(Decimal::ZERO),
            sub_total_mano_obra: Set(Decimal::ZERO),
            sub_total_equipo: Set(Decimal::ZERO),
            sub_total_basico_auxiliar: Set(Decimal::ZERO),
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
        Ok(combinar(ins, aux, Some(costo_nacional)))
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: BasicoAuxiliarData,
        actualizado_por: Option<String>,
    ) -> Result<BasicoAuxiliarCompleto, ServiceError> {
        Self::validar(&datos, true)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        let ahora = crate::ahora();

        let mut ins: insumo::ActiveModel = insumo::Entity::find_by_id(&id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("basico_auxiliar {id}")))?
            .into();
        ins.clave = Set(datos.clave);
        ins.descripcion = Set(datos.descripcion);
        ins.unidad_id = Set(datos.unidad_id);
        ins.familia_id = Set(datos.familia_id);
        ins.sub_familia_id = Set(datos.sub_familia_id);
        ins.updated_at = Set(Some(ahora));
        ins.updated_by = Set(actualizado_por);
        let ins = ins.update(repo.conexion()).await?;

        let aux = basico_auxiliar::Entity::find_by_id(&ins.id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("basico_auxiliar {id}")))?;
        let costo_nacional = Self::buscar_costo_nacional(repo, &ins.id).await?;
        Ok(combinar(ins, aux, costo_nacional))
    }

    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        crate::marcar_insumo_eliminado(repo, &id, "basico_auxiliar", eliminado_por).await
    }

    /// Importa básicos auxiliares desde un CSV de dos secciones (`MAESTRO` /
    /// `DETALLE`).
    ///
    /// **MAESTRO** (`Clave,Descripción,Unidad,Familia,Subfamilia`): `Clave`
    /// y `Unidad` son obligatorias, `Descripción` también. Si la clave ya
    /// existe se actualiza; si no, se da de alta.
    ///
    /// **DETALLE** (`Clave Básico Auxiliar,Sección,Clave Insumo,Descripción
    /// Insumo,Unidad,Cantidad`): la receta existente es la referencia — cada
    /// renglón del archivo actualiza solo la cantidad (de la valuación
    /// nacional) si el componente ya está, o se agrega si no; los renglones
    /// de referencia que no vienen en el archivo se eliminan. `Sección`
    /// determina contra qué catálogo se resuelve `Clave Insumo`/`Descripción
    /// Insumo`: `MATERIAL` (material), `MANO DE OBRA` (categoría FASAR o
    /// cuadrilla), `EQUIPO Y HERRAMIENTA` (equipo de costo horario) o
    /// `BASICO AUXILIAR` (otro básico auxiliar — recursivo).
    ///
    /// El archivo se procesa en dos pasadas: primero se dan de alta/
    /// actualizan **todos** los básicos del MAESTRO, y solo después se
    /// sincroniza la receta de cada uno. Así una fila de `BASICO AUXILIAR`
    /// puede referenciar la clave de otro básico que viene más abajo en el
    /// mismo archivo — no importa el orden en que aparezcan, para cuando se
    /// arma la receta todos ya existen como insumo. Una dependencia que no
    /// aparece ni en el archivo ni en la base se reporta en `errores` y esa
    /// fila de receta se omite (no aborta el resto de la importación). Las
    /// referencias circulares (directas o transitivas, ver
    /// `BasicoAuxiliarComponenteService::forma_ciclo`) también se detectan
    /// y esa fila se omite y se reporta.
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
            &["clave básico auxiliar", "clave basico auxiliar", "clave"],
        )
        .ok_or_else(|| {
            ServiceError::Validacion(
                "el DETALLE debe tener la columna \"Clave Básico Auxiliar\"".into(),
            )
        })?;
        let col_seccion = buscar_columna(&detalle.encabezados, &["sección", "seccion"])
            .ok_or_else(|| {
                ServiceError::Validacion("el DETALLE debe tener la columna \"Sección\"".into())
            })?;
        let col_clave_insumo =
            buscar_columna(&detalle.encabezados, &["clave insumo", "clave componente"]);
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
        let materiales: HashSet<String> = material::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|m| m.insumo_id)
            .collect();
        let categorias: HashSet<String> = categoria_fasar::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|c| c.insumo_id)
            .collect();
        let cuadrillas: HashSet<String> = cuadrilla::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|c| c.insumo_id)
            .collect();
        let equipos: HashSet<String> = equipo_costo_horario::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|e| e.insumo_id)
            .collect();
        let auxiliares_existentes: HashSet<String> = basico_auxiliar::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|a| a.insumo_id)
            .collect();

        let mut material_por_clave: HashMap<String, String> = HashMap::new();
        let mut material_por_descripcion: HashMap<String, String> = HashMap::new();
        let mut categoria_por_clave: HashMap<String, String> = HashMap::new();
        let mut categoria_por_descripcion: HashMap<String, String> = HashMap::new();
        let mut cuadrilla_por_clave: HashMap<String, String> = HashMap::new();
        let mut cuadrilla_por_descripcion: HashMap<String, String> = HashMap::new();
        let mut equipo_por_clave: HashMap<String, String> = HashMap::new();
        let mut equipo_por_descripcion: HashMap<String, String> = HashMap::new();
        let mut aux_por_clave: HashMap<String, String> = HashMap::new();
        let mut aux_por_descripcion: HashMap<String, String> = HashMap::new();
        let mut por_clave: HashMap<String, String> = HashMap::new();
        for ins in &insumos {
            if materiales.contains(&ins.id) {
                recordar_insumo(&mut material_por_clave, &mut material_por_descripcion, &ins.id, &ins.clave, &ins.descripcion);
            }
            if categorias.contains(&ins.id) {
                recordar_insumo(&mut categoria_por_clave, &mut categoria_por_descripcion, &ins.id, &ins.clave, &ins.descripcion);
            }
            if cuadrillas.contains(&ins.id) {
                recordar_insumo(&mut cuadrilla_por_clave, &mut cuadrilla_por_descripcion, &ins.id, &ins.clave, &ins.descripcion);
            }
            if equipos.contains(&ins.id) {
                recordar_insumo(&mut equipo_por_clave, &mut equipo_por_descripcion, &ins.id, &ins.clave, &ins.descripcion);
            }
            if auxiliares_existentes.contains(&ins.id) {
                recordar_insumo(&mut aux_por_clave, &mut aux_por_descripcion, &ins.id, &ins.clave, &ins.descripcion);
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
                    "fila {fila}: descripción de básico auxiliar vacía, se omitió"
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
            let clave_auxiliar = celda(&registro, col_det_clave);
            let seccion = celda(&registro, col_seccion);
            let clave_insumo = col_clave_insumo
                .map(|c| celda(&registro, c))
                .unwrap_or_default();
            let descripcion = celda(&registro, col_desc_insumo);
            let cantidad = celda(&registro, col_cantidad);
            if clave_auxiliar.is_empty()
                && seccion.is_empty()
                && clave_insumo.is_empty()
                && descripcion.is_empty()
            {
                continue;
            }
            if clave_auxiliar.is_empty() {
                errores.push(format!(
                    "fila {fila}: clave de básico auxiliar vacía en DETALLE, se omitió"
                ));
                continue;
            }
            detalles_por_clave
                .entry(clave_cruce(&clave_auxiliar))
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

        // Pasada 1: alta/edición de todos los básicos del MAESTRO — antes de
        // tocar recetas, para que una fila de BASICO AUXILIAR pueda apuntar
        // a la clave de otro básico del mismo archivo sin importar el orden.
        let mut creados = 0u32;
        let mut actualizados = 0u32;
        let total = maestros.len() as u32;
        let mut ids_por_clave: HashMap<String, String> = HashMap::new();

        for (i, grupo) in maestros.iter().enumerate() {
            on_progreso(i as u32 + 1, total.max(1) * 2);
            let llave = clave_cruce(&grupo.clave);

            let unidad_texto = grupo.unidad.trim().to_lowercase();
            let Some(unidad_id) = unidad_id_por_texto.get(&unidad_texto).cloned() else {
                errores.push(format!(
                    "fila {}: unidad \"{}\" no encontrada, se omitió",
                    grupo.fila,
                    grupo.unidad.trim()
                ));
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

            let datos = BasicoAuxiliarData {
                clave: grupo.clave.clone(),
                descripcion: grupo.descripcion.clone(),
                unidad_id,
                familia_id,
                sub_familia_id,
            };

            let existente_id = por_clave.get(&llave).cloned();
            let auxiliar = if let Some(id) = existente_id {
                match Self::actualizar(repo, id, datos, Some(creado_por.clone())).await {
                    Ok(a) => {
                        actualizados += 1;
                        a
                    }
                    Err(e) => {
                        errores.push(format!(
                            "básico auxiliar \"{}\": no se pudo actualizar ({e})",
                            grupo.clave
                        ));
                        continue;
                    }
                }
            } else {
                match Self::crear(repo, organizacion_id, datos, creado_por.clone()).await {
                    Ok(a) => {
                        creados += 1;
                        a
                    }
                    Err(e) => {
                        errores.push(format!(
                            "básico auxiliar \"{}\": no se pudo crear ({e})",
                            grupo.clave
                        ));
                        continue;
                    }
                }
            };

            por_clave.insert(llave.clone(), auxiliar.id.clone());
            ids_por_clave.insert(llave.clone(), auxiliar.id.clone());
            recordar_insumo(&mut aux_por_clave, &mut aux_por_descripcion, &auxiliar.id, &auxiliar.clave, &auxiliar.descripcion);
        }

        // Pasada 2: sincroniza la receta de cada básico dado de alta/editado
        // — para entonces todos los básicos del archivo ya existen, así que
        // BASICO AUXILIAR puede resolver contra cualquiera de ellos.
        for (i, grupo) in maestros.iter().enumerate() {
            let llave = clave_cruce(&grupo.clave);
            let Some(auxiliar_id) = ids_por_clave.get(&llave).cloned() else {
                continue;
            };
            on_progreso(total.max(1) + i as u32 + 1, total.max(1) * 2);

            let filas_detalle = detalles_por_clave.remove(&llave).unwrap_or_default();
            let filas_csv = filas_detalle.len();

            let mut componentes_ok = Vec::new();
            for fila in &filas_detalle {
                match resolver_componente_csv(
                    fila,
                    &material_por_clave,
                    &material_por_descripcion,
                    &categoria_por_clave,
                    &categoria_por_descripcion,
                    &cuadrilla_por_clave,
                    &cuadrilla_por_descripcion,
                    &equipo_por_clave,
                    &equipo_por_descripcion,
                    &aux_por_clave,
                    &aux_por_descripcion,
                ) {
                    Ok(datos) => componentes_ok.push((fila.fila, etiqueta_detalle(fila), datos)),
                    Err(e) => errores.push(e),
                }
            }
            if filas_csv > 0 && componentes_ok.is_empty() {
                errores.push(format!(
                    "básico auxiliar \"{}\": ningún renglón de receta pudo resolverse, no se modificó la receta",
                    grupo.clave
                ));
                continue;
            }

            Self::sincronizar_componentes_importados(
                repo,
                &auxiliar_id,
                componentes_ok,
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

    async fn sincronizar_componentes_importados(
        repo: &dyn PortafolioRepository,
        basico_auxiliar_id: &str,
        componentes_ok: Vec<(usize, String, BasicoAuxiliarComponenteData)>,
        creado_por: &str,
        errores: &mut Vec<String>,
    ) {
        let existentes = match BasicoAuxiliarComponenteService::listar_por_auxiliar(
            repo,
            basico_auxiliar_id,
        )
        .await
        {
            Ok(c) => c,
            Err(e) => {
                errores.push(format!("no se pudo leer la receta del básico auxiliar ({e})"));
                return;
            }
        };
        let costo_nacional_id = match Self::buscar_costo_nacional(repo, basico_auxiliar_id).await {
            Ok(Some(c)) => Some(c.id),
            Ok(None) => None,
            Err(e) => {
                errores.push(format!("no se pudo leer la valuación nacional ({e})"));
                None
            }
        };
        let detalle_nacional_por_componente: HashMap<String, basico_auxiliar_costo_detalle::Model> =
            if let Some(costo_id) = &costo_nacional_id {
                match BasicoAuxiliarCostoDetalleService::listar_por_costo(repo, costo_id).await {
                    Ok(lista) => lista
                        .into_iter()
                        .map(|d| (d.basico_auxiliar_componente_id.clone(), d))
                        .collect(),
                    Err(e) => {
                        errores.push(format!(
                            "no se pudo leer el detalle de la valuación nacional ({e})"
                        ));
                        HashMap::new()
                    }
                }
            } else {
                HashMap::new()
            };

        let mut componente_id_por_insumo: HashMap<String, String> = existentes
            .iter()
            .map(|c| (c.componente_insumo_id.clone(), c.id.clone()))
            .collect();
        let mut vistos: HashSet<String> = HashSet::new();

        for (fila, etiqueta, datos) in componentes_ok {
            let insumo_id = datos.componente_insumo_id.clone();
            let cantidad = datos.cantidad;
            vistos.insert(insumo_id.clone());

            if let Some(componente_id) = componente_id_por_insumo.get(&insumo_id).cloned() {
                if let Some(cd) = detalle_nacional_por_componente.get(&componente_id) {
                    if cd.cantidad != cantidad {
                        if let Err(e) = BasicoAuxiliarCostoDetalleService::actualizar_cantidad(
                            repo,
                            cd.id.clone(),
                            BasicoAuxiliarCostoDetalleCantidadData { cantidad },
                            Some(creado_por.to_string()),
                        )
                        .await
                        {
                            errores.push(format!(
                                "fila {fila}: no se pudo actualizar la cantidad de {etiqueta} ({e})"
                            ));
                        }
                    }
                }
                continue;
            }

            match BasicoAuxiliarComponenteService::crear(
                repo,
                basico_auxiliar_id,
                datos,
                creado_por.to_string(),
            )
            .await
            {
                Ok(_) => {
                    if let Ok(lista) =
                        BasicoAuxiliarComponenteService::listar_por_auxiliar(repo, basico_auxiliar_id)
                            .await
                    {
                        if let Some(c) = lista.iter().find(|c| c.componente_insumo_id == insumo_id) {
                            componente_id_por_insumo.insert(insumo_id.clone(), c.id.clone());
                        }
                    }
                }
                Err(e) => errores.push(format!("fila {fila}: no se pudo agregar {etiqueta} ({e})")),
            }
        }

        for existente in existentes {
            if vistos.contains(&existente.componente_insumo_id) {
                continue;
            }
            if let Err(e) =
                BasicoAuxiliarComponenteService::eliminar(repo, existente.id, creado_por.to_string())
                    .await
            {
                errores.push(format!(
                    "no se pudo eliminar un renglón de receta que ya no viene en el CSV ({e})"
                ));
            }
        }
    }

    pub(crate) async fn buscar_costo_nacional(
        repo: &dyn PortafolioRepository,
        basico_auxiliar_id: &str,
    ) -> Result<Option<basico_auxiliar_costo::Model>, ServiceError> {
        Ok(basico_auxiliar_costo::Entity::find()
            .filter(basico_auxiliar_costo::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_costo::Column::RegionId.is_null())
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?)
    }

    pub(crate) async fn cargar_completo(
        txn: &DatabaseTransaction,
        id: &str,
    ) -> Result<BasicoAuxiliarCompleto, ServiceError> {
        let ins = insumo::Entity::find_by_id(id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("basico_auxiliar {id}")))?;
        let aux = basico_auxiliar::Entity::find_by_id(id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("basico_auxiliar {id}")))?;
        let costo_nacional = basico_auxiliar_costo::Entity::find()
            .filter(basico_auxiliar_costo::Column::BasicoAuxiliarId.eq(id))
            .filter(basico_auxiliar_costo::Column::RegionId.is_null())
            .filter(basico_auxiliar_costo::Column::Deleted.eq(false))
            .one(txn)
            .await?;
        Ok(combinar(ins, aux, costo_nacional))
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

fn parsear_seccion_basico(seccion: &str) -> Option<TipoBasicoAuxiliarComponente> {
    let normalizada = seccion.trim().to_lowercase().replace('_', " ");
    match normalizada.as_str() {
        "material" => Some(TipoBasicoAuxiliarComponente::Material),
        "mano de obra" => Some(TipoBasicoAuxiliarComponente::ManoObra),
        "equipo y herramienta" | "equipo y herramientas" => {
            Some(TipoBasicoAuxiliarComponente::EquipoHerramienta)
        }
        "basico auxiliar" | "básico auxiliar" | "auxiliar" => {
            Some(TipoBasicoAuxiliarComponente::BasicoAuxiliar)
        }
        _ => None,
    }
}

#[allow(clippy::too_many_arguments)]
fn resolver_componente_csv(
    fila: &FilaDetalleCsv,
    material_por_clave: &HashMap<String, String>,
    material_por_descripcion: &HashMap<String, String>,
    categoria_por_clave: &HashMap<String, String>,
    categoria_por_descripcion: &HashMap<String, String>,
    cuadrilla_por_clave: &HashMap<String, String>,
    cuadrilla_por_descripcion: &HashMap<String, String>,
    equipo_por_clave: &HashMap<String, String>,
    equipo_por_descripcion: &HashMap<String, String>,
    aux_por_clave: &HashMap<String, String>,
    aux_por_descripcion: &HashMap<String, String>,
) -> Result<BasicoAuxiliarComponenteData, String> {
    let n = fila.fila;
    let Some(tipo) = parsear_seccion_basico(&fila.seccion) else {
        return Err(format!(
            "fila {n}: sección \"{}\" no reconocida (use MATERIAL, MANO DE OBRA, EQUIPO Y HERRAMIENTA o BASICO AUXILIAR), se omitió",
            fila.seccion
        ));
    };
    if fila.clave_insumo.is_empty() && fila.descripcion.is_empty() {
        return Err(format!(
            "fila {n}: renglón de receta sin clave ni descripción de insumo, se omitió"
        ));
    }
    let Some(cantidad) = parsear_decimal(&fila.cantidad) else {
        return Err(format!(
            "fila {n}: cantidad \"{}\" no es un número válido, se omitió",
            fila.cantidad
        ));
    };
    let clave = if fila.clave_insumo.is_empty() {
        None
    } else {
        Some(fila.clave_insumo.as_str())
    };
    let (id, etiqueta) = match tipo {
        TipoBasicoAuxiliarComponente::Material => (
            id_insumo_existente(clave, &fila.descripcion, material_por_clave, material_por_descripcion),
            "material",
        ),
        TipoBasicoAuxiliarComponente::ManoObra => (
            id_insumo_existente(clave, &fila.descripcion, categoria_por_clave, categoria_por_descripcion)
                .or_else(|| {
                    id_insumo_existente(clave, &fila.descripcion, cuadrilla_por_clave, cuadrilla_por_descripcion)
                }),
            "mano de obra",
        ),
        TipoBasicoAuxiliarComponente::EquipoHerramienta => (
            id_insumo_existente(clave, &fila.descripcion, equipo_por_clave, equipo_por_descripcion),
            "equipo de costo horario",
        ),
        TipoBasicoAuxiliarComponente::BasicoAuxiliar => (
            id_insumo_existente(clave, &fila.descripcion, aux_por_clave, aux_por_descripcion),
            "básico auxiliar",
        ),
    };
    let Some(componente_insumo_id) = id else {
        return Err(format!(
            "fila {n}: {etiqueta} \"{}\" no encontrado, se omitió",
            etiqueta_detalle(fila)
        ));
    };
    Ok(BasicoAuxiliarComponenteData {
        componente_insumo_id,
        cantidad,
        naturaleza: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use obrix_db::PortafolioSqliteRepository;
    use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
    use sea_orm::ActiveModelTrait;
    use std::path::Path;

    async fn portafolio_basico() -> PortafolioSqliteRepository {
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
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Pieza),
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

        portafolio
    }

    /// El MAESTRO trae AUX-B antes que AUX-A, pero la receta de AUX-B
    /// depende de AUX-A (aparece más abajo en el archivo) — el orden de las
    /// filas no debe importar porque los dos pases (altas primero, recetas
    /// después) resuelven cualquier orden.
    #[tokio::test]
    async fn importar_csv_resuelve_dependencia_recursiva_sin_importar_el_orden() {
        let portafolio = portafolio_basico().await;
        let csv = "MAESTRO\n\
            Clave,Descripción,Unidad,Familia,Subfamilia\n\
            AUX-B,Básico B,pza,,\n\
            AUX-A,Básico A,pza,,\n\
            \n\
            DETALLE\n\
            Clave Básico Auxiliar,Sección,Clave Insumo,Descripción Insumo,Unidad,Cantidad\n\
            AUX-B,BASICO AUXILIAR,AUX-A,Básico A,pza,2\n";

        let resultado = BasicoAuxiliarService::importar_csv(&portafolio, "org-1", csv, "usr-1".into())
            .await
            .expect("importar csv");
        assert_eq!(resultado.creados, 2);
        assert!(resultado.errores.is_empty(), "sin errores: {:?}", resultado.errores);

        let auxiliares = BasicoAuxiliarService::listar(&portafolio, "org-1")
            .await
            .expect("listar");
        let aux_b = auxiliares.iter().find(|a| a.clave == "AUX-B").unwrap();
        let componentes = BasicoAuxiliarComponenteService::listar_por_auxiliar(&portafolio, &aux_b.id)
            .await
            .expect("listar componentes");
        assert_eq!(componentes.len(), 1);
        assert_eq!(componentes[0].tipo, TipoBasicoAuxiliarComponente::BasicoAuxiliar);
    }

    /// AUX-A contiene a AUX-B y AUX-B contiene a AUX-A — referencia
    /// circular dentro del mismo archivo. Debe reportarse en `errores` (no
    /// abortar el resto de la importación) y ninguna de las dos recetas
    /// debe quedar con el ciclo persistido.
    #[tokio::test]
    async fn importar_csv_reporta_referencia_circular_y_no_la_persiste() {
        let portafolio = portafolio_basico().await;
        let csv = "MAESTRO\n\
            Clave,Descripción,Unidad,Familia,Subfamilia\n\
            AUX-A,Básico A,pza,,\n\
            AUX-B,Básico B,pza,,\n\
            \n\
            DETALLE\n\
            Clave Básico Auxiliar,Sección,Clave Insumo,Descripción Insumo,Unidad,Cantidad\n\
            AUX-A,BASICO AUXILIAR,AUX-B,Básico B,pza,1\n\
            AUX-B,BASICO AUXILIAR,AUX-A,Básico A,pza,1\n";

        let resultado = BasicoAuxiliarService::importar_csv(&portafolio, "org-1", csv, "usr-1".into())
            .await
            .expect("importar csv");
        assert_eq!(resultado.creados, 2);
        assert!(
            resultado.errores.iter().any(|e| e.contains("contenerse")),
            "esperaba un error de ciclo: {:?}",
            resultado.errores
        );

        let auxiliares = BasicoAuxiliarService::listar(&portafolio, "org-1")
            .await
            .expect("listar");
        let aux_a = auxiliares.iter().find(|a| a.clave == "AUX-A").unwrap();
        let aux_b = auxiliares.iter().find(|a| a.clave == "AUX-B").unwrap();
        let comp_a = BasicoAuxiliarComponenteService::listar_por_auxiliar(&portafolio, &aux_a.id)
            .await
            .expect("listar componentes a");
        let comp_b = BasicoAuxiliarComponenteService::listar_por_auxiliar(&portafolio, &aux_b.id)
            .await
            .expect("listar componentes b");
        // Una de las dos direcciones se insertó (la primera en procesarse);
        // la otra fue rechazada por formar ciclo.
        assert_eq!(comp_a.len() + comp_b.len(), 1);
    }

    /// Una fila de receta que referencia un básico auxiliar que no existe
    /// ni en el archivo ni en la base se reporta en `errores` y se omite,
    /// sin abortar el resto de la importación.
    #[tokio::test]
    async fn importar_csv_reporta_dependencia_faltante() {
        let portafolio = portafolio_basico().await;
        let csv = "MAESTRO\n\
            Clave,Descripción,Unidad,Familia,Subfamilia\n\
            AUX-A,Básico A,pza,,\n\
            \n\
            DETALLE\n\
            Clave Básico Auxiliar,Sección,Clave Insumo,Descripción Insumo,Unidad,Cantidad\n\
            AUX-A,BASICO AUXILIAR,AUX-NO-EXISTE,No existe,pza,1\n";

        let resultado = BasicoAuxiliarService::importar_csv(&portafolio, "org-1", csv, "usr-1".into())
            .await
            .expect("importar csv");
        assert_eq!(resultado.creados, 1);
        assert!(
            resultado.errores.iter().any(|e| e.contains("no encontrado")),
            "esperaba un error de dependencia faltante: {:?}",
            resultado.errores
        );
    }
}
