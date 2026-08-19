//! `equipo_costo_horario` es una extensión 1:1 de `insumo` (ver diccionario
//! de datos) — este servicio administra ambas tablas juntas como si fueran
//! una sola entidad "Equipo de costo horario", igual que
//! `material`/`categoria_fasar`/`herramienta`/`cuadrilla` hacen con `insumo`.
//! Los campos `cf_*` de cache (todo salvo los 9 de captura directa del
//! usuario) se recalculan aquí, en `calcular_cargos_fijos`, cada vez que se
//! crea o actualiza el equipo — son puramente función de esos 9 valores, no
//! dependen de la composición. La valuación por región vive en
//! `equipo_costo_horario_costo`/`equipo_costo_horario_costo_detalle` —
//! `costo_nacional` aquí es solo un reflejo de conveniencia de la valuación
//! nacional, igual que `CuadrillaCompleto.costo_nacional`.

use obrix_db::PortafolioRepository;
use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{
    categoria_fasar, cuadrilla, equipo_costo_horario, equipo_costo_horario_costo, familia_insumo,
    material, unidad_medida,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};
use std::collections::{HashMap, HashSet};

use crate::csv_secciones::{
    buscar_columna, celda, parsear_decimal, parsear_secciones_maestro_detalle,
};
use crate::equipo_costo_horario_costo::EquipoCostoHorarioCostoService;
use crate::equipo_costo_horario_detalle::{
    EquipoCostoHorarioDetalleData, EquipoCostoHorarioDetalleService,
};
use crate::unidad_medida::UnidadMedidaService;
use crate::{ServiceError, clave_cruce, mapas_familia, nuevo_id, resolver_familia_csv};

#[derive(serde::Deserialize)]
pub struct EquipoCostoHorarioData {
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    /// Debe ser hija (`parent_id`) de `familia_id` — no se valida aquí, el
    /// frontend ya restringe las opciones mostradas a los hijos de la familia elegida.
    pub sub_familia_id: Option<String>,
    pub cf_costo_maquina: Decimal,
    pub cf_valor_llantas: Decimal,
    pub cf_valor_piezas_especiales: Decimal,
    pub cf_valor_rescate_porcentaje: Decimal,
    pub cf_vida_economica_anios: Decimal,
    pub cf_horas_uso_anual: Decimal,
    pub cf_tasa_interes_anual_porcentaje: Decimal,
    pub cf_tasa_seguros_anual_porcentaje: Decimal,
    pub cf_mantenimiento_porcentaje: Decimal,
}

/// Los 8 campos de cache que se derivan de los 9 de captura de
/// `EquipoCostoHorarioData` — separados en su propio tipo porque tanto
/// `crear` como `actualizar` los recalculan igual.
struct CargosFijos {
    cf_valor_maquina: Decimal,
    cf_valor_rescate: Decimal,
    cf_vida_util_horas: Decimal,
    cf_depreciacion_hora: Decimal,
    cf_inversion_hora: Decimal,
    cf_seguro_hora: Decimal,
    cf_mantenimiento_hora: Decimal,
    cf_cargo_fijo_hora: Decimal,
}

/// Metodología estándar SCT/CMIC — nunca depreciación lineal sola (ver
/// diccionario de datos, sección `equipo_costo_horario`, para el detalle de
/// cada fórmula y su símbolo).
fn calcular_cargos_fijos(datos: &EquipoCostoHorarioData) -> Result<CargosFijos, ServiceError> {
    if datos.cf_horas_uso_anual <= Decimal::ZERO {
        return Err(ServiceError::Validacion(
            "las horas de uso anual deben ser mayores a 0".to_string(),
        ));
    }
    let cf_valor_maquina =
        datos.cf_costo_maquina - datos.cf_valor_llantas - datos.cf_valor_piezas_especiales;
    let cf_valor_rescate =
        cf_valor_maquina * datos.cf_valor_rescate_porcentaje / Decimal::ONE_HUNDRED;
    let cf_vida_util_horas = datos.cf_vida_economica_anios * datos.cf_horas_uso_anual;
    if cf_vida_util_horas <= Decimal::ZERO {
        return Err(ServiceError::Validacion(
            "la vida útil en horas (vida económica × horas de uso anual) debe ser mayor a 0"
                .to_string(),
        ));
    }
    let cf_depreciacion_hora = (cf_valor_maquina - cf_valor_rescate) / cf_vida_util_horas;
    let dos_horas_uso_anual = Decimal::TWO * datos.cf_horas_uso_anual;
    let cf_inversion_hora = (cf_valor_maquina + cf_valor_rescate)
        * datos.cf_tasa_interes_anual_porcentaje
        / Decimal::ONE_HUNDRED
        / dos_horas_uso_anual;
    let cf_seguro_hora = (cf_valor_maquina + cf_valor_rescate)
        * datos.cf_tasa_seguros_anual_porcentaje
        / Decimal::ONE_HUNDRED
        / dos_horas_uso_anual;
    let cf_mantenimiento_hora =
        datos.cf_mantenimiento_porcentaje / Decimal::ONE_HUNDRED * cf_depreciacion_hora;
    let cf_cargo_fijo_hora =
        cf_depreciacion_hora + cf_inversion_hora + cf_seguro_hora + cf_mantenimiento_hora;

    Ok(CargosFijos {
        cf_valor_maquina,
        cf_valor_rescate,
        cf_vida_util_horas,
        cf_depreciacion_hora,
        cf_inversion_hora,
        cf_seguro_hora,
        cf_mantenimiento_hora,
        cf_cargo_fijo_hora,
    })
}

/// `insumo` + `equipo_costo_horario` combinados en una sola fila — así es
/// como lo ve el frontend, que no necesita saber que internamente son varias tablas.
#[derive(Debug, Clone, serde::Serialize)]
pub struct EquipoCostoHorarioCompleto {
    pub id: String,
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    pub cf_costo_maquina: Decimal,
    pub cf_valor_llantas: Decimal,
    pub cf_valor_piezas_especiales: Decimal,
    pub cf_valor_maquina: Decimal,
    pub cf_valor_rescate_porcentaje: Decimal,
    pub cf_valor_rescate: Decimal,
    pub cf_vida_economica_anios: Decimal,
    pub cf_horas_uso_anual: Decimal,
    pub cf_vida_util_horas: Decimal,
    pub cf_tasa_interes_anual_porcentaje: Decimal,
    pub cf_tasa_seguros_anual_porcentaje: Decimal,
    pub cf_mantenimiento_porcentaje: Decimal,
    pub cf_depreciacion_hora: Decimal,
    pub cf_inversion_hora: Decimal,
    pub cf_seguro_hora: Decimal,
    pub cf_mantenimiento_hora: Decimal,
    pub cf_cargo_fijo_hora: Decimal,
    /// Valuación nacional (`region_id IS NULL`) — siempre existe salvo un
    /// estado transitorio imposible desde este servicio, todo equipo nace
    /// con ella.
    pub costo_nacional: Option<equipo_costo_horario_costo::Model>,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

pub(crate) fn combinar(
    insumo: insumo::Model,
    equipo: equipo_costo_horario::Model,
    costo_nacional: Option<equipo_costo_horario_costo::Model>,
) -> EquipoCostoHorarioCompleto {
    EquipoCostoHorarioCompleto {
        id: insumo.id,
        clave: insumo.clave,
        descripcion: insumo.descripcion,
        unidad_id: insumo.unidad_id,
        familia_id: insumo.familia_id,
        sub_familia_id: insumo.sub_familia_id,
        cf_costo_maquina: equipo.cf_costo_maquina,
        cf_valor_llantas: equipo.cf_valor_llantas,
        cf_valor_piezas_especiales: equipo.cf_valor_piezas_especiales,
        cf_valor_maquina: equipo.cf_valor_maquina,
        cf_valor_rescate_porcentaje: equipo.cf_valor_rescate_porcentaje,
        cf_valor_rescate: equipo.cf_valor_rescate,
        cf_vida_economica_anios: equipo.cf_vida_economica_anios,
        cf_horas_uso_anual: equipo.cf_horas_uso_anual,
        cf_vida_util_horas: equipo.cf_vida_util_horas,
        cf_tasa_interes_anual_porcentaje: equipo.cf_tasa_interes_anual_porcentaje,
        cf_tasa_seguros_anual_porcentaje: equipo.cf_tasa_seguros_anual_porcentaje,
        cf_mantenimiento_porcentaje: equipo.cf_mantenimiento_porcentaje,
        cf_depreciacion_hora: equipo.cf_depreciacion_hora,
        cf_inversion_hora: equipo.cf_inversion_hora,
        cf_seguro_hora: equipo.cf_seguro_hora,
        cf_mantenimiento_hora: equipo.cf_mantenimiento_hora,
        cf_cargo_fijo_hora: equipo.cf_cargo_fijo_hora,
        costo_nacional,
        created_at: insumo.created_at,
        created_by: insumo.created_by,
        updated_at: insumo.updated_at,
        updated_by: insumo.updated_by,
    }
}

pub struct EquipoCostoHorarioService;

impl EquipoCostoHorarioService {
    fn validar(datos: &EquipoCostoHorarioData, actualizando: bool) -> Result<(), ServiceError> {
        if datos.clave.trim().is_empty() {
            let accion = crate::accion(actualizando);
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un equipo de costo horario sin clave."
            )));
        }
        if datos.descripcion.trim().is_empty() {
            let accion = crate::accion(actualizando);
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un equipo de costo horario sin descripción."
            )));
        }
        if datos.unidad_id.trim().is_empty() {
            let accion = crate::accion(actualizando);
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un equipo de costo horario sin unidad de medida."
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
    ) -> Result<Vec<EquipoCostoHorarioCompleto>, ServiceError> {
        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::EquipoHerramienta))
            .filter(insumo::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;

        let mut resultado = Vec::with_capacity(insumos.len());
        for ins in insumos {
            let Some(equipo) = equipo_costo_horario::Entity::find_by_id(&ins.id)
                .one(repo.conexion())
                .await?
            else {
                continue;
            };
            let costo_nacional = Self::buscar_costo_nacional(repo, &ins.id).await?;
            resultado.push(combinar(ins, equipo, costo_nacional));
        }
        Ok(resultado)
    }

    pub async fn buscar_por_id(
        repo: &dyn PortafolioRepository,
        id: &str,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let ins = insumo::Entity::find_by_id(id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("equipo_costo_horario {id}")))?;
        let equipo = equipo_costo_horario::Entity::find_by_id(id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("equipo_costo_horario {id}")))?;
        let costo_nacional = Self::buscar_costo_nacional(repo, id).await?;
        Ok(combinar(ins, equipo, costo_nacional))
    }

    /// Inserta `insumo` + `equipo_costo_horario` + su fila de valuación
    /// nacional (`equipo_costo_horario_costo` con `region_id = NULL`) en la
    /// misma transacción — todo equipo nace con su fila nacional
    /// (`costo_total` = cargos fijos, variable en cero).
    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: EquipoCostoHorarioData,
        creado_por: String,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        Self::validar(&datos, false)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        let cargos = calcular_cargos_fijos(&datos)?;
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
            created_at: Set(ahora.clone()),
            created_by: Set(creado_por.clone()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(&txn)
        .await?;

        let equipo = equipo_costo_horario::ActiveModel {
            insumo_id: Set(id.clone()),
            cf_costo_maquina: Set(datos.cf_costo_maquina),
            cf_valor_llantas: Set(datos.cf_valor_llantas),
            cf_valor_piezas_especiales: Set(datos.cf_valor_piezas_especiales),
            cf_valor_maquina: Set(cargos.cf_valor_maquina),
            cf_valor_rescate_porcentaje: Set(datos.cf_valor_rescate_porcentaje),
            cf_valor_rescate: Set(cargos.cf_valor_rescate),
            cf_vida_economica_anios: Set(datos.cf_vida_economica_anios),
            cf_horas_uso_anual: Set(datos.cf_horas_uso_anual),
            cf_vida_util_horas: Set(cargos.cf_vida_util_horas),
            cf_tasa_interes_anual_porcentaje: Set(datos.cf_tasa_interes_anual_porcentaje),
            cf_tasa_seguros_anual_porcentaje: Set(datos.cf_tasa_seguros_anual_porcentaje),
            cf_mantenimiento_porcentaje: Set(datos.cf_mantenimiento_porcentaje),
            cf_depreciacion_hora: Set(cargos.cf_depreciacion_hora),
            cf_inversion_hora: Set(cargos.cf_inversion_hora),
            cf_seguro_hora: Set(cargos.cf_seguro_hora),
            cf_mantenimiento_hora: Set(cargos.cf_mantenimiento_hora),
            cf_cargo_fijo_hora: Set(cargos.cf_cargo_fijo_hora),
        }
        .insert(&txn)
        .await?;

        let costo_nacional = equipo_costo_horario_costo::ActiveModel {
            id: Set(nuevo_id()),
            equipo_costo_horario_id: Set(id),
            region_id: Set(None),
            subtotal_consumo: Set(Decimal::ZERO),
            subtotal_operacion: Set(Decimal::ZERO),
            cargo_variable_hora: Set(Decimal::ZERO),
            costo_total: Set(cargos.cf_cargo_fijo_hora),
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
        Ok(combinar(ins, equipo, Some(costo_nacional)))
    }

    /// Actualiza los datos de catálogo y los 9 valores de captura de cargos
    /// fijos — recalcula los 8 de cache a partir de ellos y recompone
    /// `costo_total` de **todas** las valuaciones (variable no cambia de
    /// cantidades; el total sí, porque CF cambió).
    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: EquipoCostoHorarioData,
        actualizado_por: Option<String>,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        Self::validar(&datos, true)?;
        crate::validar_unidad_existe(repo, &datos.unidad_id).await?;
        crate::validar_familia_existe(repo, &datos.familia_id).await?;
        crate::validar_familia_existe(repo, &datos.sub_familia_id).await?;
        let cargos = calcular_cargos_fijos(&datos)?;
        let ahora = crate::ahora();
        let autor = actualizado_por.clone().unwrap_or_else(|| "sistema".into());

        let txn = repo.conexion().begin().await?;

        let mut ins: insumo::ActiveModel = insumo::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("equipo_costo_horario {id}")))?
            .into();
        ins.clave = Set(datos.clave);
        ins.descripcion = Set(datos.descripcion);
        ins.unidad_id = Set(datos.unidad_id);
        ins.familia_id = Set(datos.familia_id);
        ins.sub_familia_id = Set(datos.sub_familia_id);
        ins.updated_at = Set(Some(ahora.clone()));
        ins.updated_by = Set(actualizado_por);
        let ins = ins.update(&txn).await?;

        let existente = equipo_costo_horario::Entity::find_by_id(&ins.id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("equipo_costo_horario {id}")))?;
        let mut eq: equipo_costo_horario::ActiveModel = existente.into();
        eq.cf_costo_maquina = Set(datos.cf_costo_maquina);
        eq.cf_valor_llantas = Set(datos.cf_valor_llantas);
        eq.cf_valor_piezas_especiales = Set(datos.cf_valor_piezas_especiales);
        eq.cf_valor_maquina = Set(cargos.cf_valor_maquina);
        eq.cf_valor_rescate_porcentaje = Set(datos.cf_valor_rescate_porcentaje);
        eq.cf_valor_rescate = Set(cargos.cf_valor_rescate);
        eq.cf_vida_economica_anios = Set(datos.cf_vida_economica_anios);
        eq.cf_horas_uso_anual = Set(datos.cf_horas_uso_anual);
        eq.cf_vida_util_horas = Set(cargos.cf_vida_util_horas);
        eq.cf_tasa_interes_anual_porcentaje = Set(datos.cf_tasa_interes_anual_porcentaje);
        eq.cf_tasa_seguros_anual_porcentaje = Set(datos.cf_tasa_seguros_anual_porcentaje);
        eq.cf_mantenimiento_porcentaje = Set(datos.cf_mantenimiento_porcentaje);
        eq.cf_depreciacion_hora = Set(cargos.cf_depreciacion_hora);
        eq.cf_inversion_hora = Set(cargos.cf_inversion_hora);
        eq.cf_seguro_hora = Set(cargos.cf_seguro_hora);
        eq.cf_mantenimiento_hora = Set(cargos.cf_mantenimiento_hora);
        eq.cf_cargo_fijo_hora = Set(cargos.cf_cargo_fijo_hora);
        let equipo = eq.update(&txn).await?;

        let valuaciones =
            EquipoCostoHorarioCostoService::asegurar_zonas(&txn, &ins.id, &autor).await?;
        for v in &valuaciones {
            EquipoCostoHorarioCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }

        let costo_nacional = equipo_costo_horario_costo::Entity::find()
            .filter(equipo_costo_horario_costo::Column::EquipoCostoHorarioId.eq(&ins.id))
            .filter(equipo_costo_horario_costo::Column::RegionId.is_null())
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false))
            .one(&txn)
            .await?;

        txn.commit().await?;
        Ok(combinar(ins, equipo, costo_nacional))
    }

    /// Borrado lógico del `insumo` — `equipo_costo_horario` y su
    /// composición/valuación se quedan.
    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        crate::marcar_insumo_eliminado(repo, &id, "equipo_costo_horario", eliminado_por).await
    }

    /// Importa equipos de costo horario desde un CSV de dos secciones
    /// (`MAESTRO` / `DETALLE`).
    ///
    /// **MAESTRO**: `Clave` es obligatoria y es la única llave de cruce (sin
    /// distinguir mayúsculas). Si existe se actualizan descripción, unidad,
    /// familia, subfamilia y los 9 cargos fijos de captura; si no, se da de
    /// alta. `Región` en el archivo se ignora (la valuación regional no vive
    /// en esta extensión).
    ///
    /// **DETALLE** (`Clave Máquina,Sección,Clave Insumo,Descripción
    /// Insumo,Unidad,Cantidad` y `Naturaleza` opcional): la receta existente
    /// es la referencia. Cada renglón del archivo actualiza solo `cantidad`
    /// si el insumo ya está, o se agrega si no. Los renglones de referencia
    /// que no vienen en el CSV se eliminan. `CONSUMO` se resuelve contra
    /// `material`; `OPERACION` contra `cuadrilla` o `categoria_fasar`. El
    /// insumo se busca por `Clave Insumo` si trae valor; si no, por
    /// descripción. En consumo, `Naturaleza` (combustible, lubricante,
    /// llantas, piezas especiales, otras fuentes) se toma del archivo; si
    /// viene vacía en un alta se infiere de la descripción.
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

        let contenido = contenido_csv.trim_start_matches('\u{feff}');
        let (maestro, detalle) = parsear_secciones_maestro_detalle(contenido)?;

        let col_clave = buscar_columna(&maestro.encabezados, &["clave"]).ok_or_else(|| {
            ServiceError::Validacion("el MAESTRO debe tener la columna \"Clave\"".into())
        })?;
        let col_descripcion = buscar_columna(&maestro.encabezados, &["descripción", "descripcion"])
            .ok_or_else(|| {
                ServiceError::Validacion("el MAESTRO debe tener la columna \"Descripción\"".into())
            })?;
        let col_unidad = buscar_columna(&maestro.encabezados, &["unidad"]).ok_or_else(|| {
            ServiceError::Validacion("el MAESTRO debe tener la columna \"Unidad\"".into())
        })?;
        let col_familia = buscar_columna(&maestro.encabezados, &["familia"]);
        let col_subfamilia = buscar_columna(&maestro.encabezados, &["subfamilia"]);
        let col_costo_maquina =
            buscar_columna(&maestro.encabezados, &["costo máquina", "costo maquina"]);
        let col_valor_llantas = buscar_columna(&maestro.encabezados, &["valor llantas"]);
        let col_valor_piezas = buscar_columna(&maestro.encabezados, &["valor piezas especiales"]);
        let col_rescate = buscar_columna(&maestro.encabezados, &["rescate %", "rescate"]);
        let col_vida = buscar_columna(
            &maestro.encabezados,
            &[
                "vida económica (años)",
                "vida economica (años)",
                "vida económica",
                "vida economica",
            ],
        );
        let col_horas = buscar_columna(&maestro.encabezados, &["horas de uso anual"]);
        let col_interes = buscar_columna(
            &maestro.encabezados,
            &[
                "interés anual %",
                "interes anual %",
                "interés anual",
                "interes anual",
            ],
        );
        let col_seguros =
            buscar_columna(&maestro.encabezados, &["seguros anual %", "seguros anual"]);
        let col_mantenimiento =
            buscar_columna(&maestro.encabezados, &["mantenimiento %", "mantenimiento"]);

        let col_det_clave = buscar_columna(
            &detalle.encabezados,
            &["clave máquina", "clave maquina", "clave equipo", "clave"],
        )
        .ok_or_else(|| {
            ServiceError::Validacion("el DETALLE debe tener la columna \"Clave Máquina\"".into())
        })?;
        let col_seccion = buscar_columna(&detalle.encabezados, &["sección", "seccion"])
            .ok_or_else(|| {
                ServiceError::Validacion("el DETALLE debe tener la columna \"Sección\"".into())
            })?;
        let col_clave_insumo = buscar_columna(&detalle.encabezados, &["clave insumo"]);
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
        let col_naturaleza = buscar_columna(&detalle.encabezados, &["naturaleza"]);

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
        let equipos_existentes: HashSet<String> = equipo_costo_horario::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|e| e.insumo_id)
            .collect();

        let mut material_id_por_clave = HashMap::new();
        let mut material_id_por_descripcion = HashMap::new();
        let mut categoria_id_por_clave = HashMap::new();
        let mut categoria_id_por_descripcion = HashMap::new();
        let mut cuadrilla_id_por_clave = HashMap::new();
        let mut cuadrilla_id_por_descripcion = HashMap::new();
        let mut por_clave: HashMap<String, String> = HashMap::new();
        for ins in &insumos {
            if materiales.contains(&ins.id) {
                material_id_por_clave.insert(clave_cruce(&ins.clave), ins.id.clone());
                material_id_por_descripcion.insert(clave_cruce(&ins.descripcion), ins.id.clone());
            }
            if categorias.contains(&ins.id) {
                categoria_id_por_clave.insert(clave_cruce(&ins.clave), ins.id.clone());
                categoria_id_por_descripcion.insert(clave_cruce(&ins.descripcion), ins.id.clone());
            }
            if cuadrillas.contains(&ins.id) {
                cuadrilla_id_por_clave.insert(clave_cruce(&ins.clave), ins.id.clone());
                cuadrilla_id_por_descripcion.insert(clave_cruce(&ins.descripcion), ins.id.clone());
            }
            if equipos_existentes.contains(&ins.id) {
                por_clave.insert(clave_cruce(&ins.clave), ins.id.clone());
            }
        }

        let mut errores = Vec::new();
        let mut maestros: Vec<FilaMaestroEquipoCsv> = Vec::new();
        let mut indice_maestro: HashMap<String, usize> = HashMap::new();
        for (fila, registro) in maestro.filas {
            let clave = celda(&registro, col_clave);
            let descripcion = celda(&registro, col_descripcion);
            let unidad = celda(&registro, col_unidad);
            if clave.is_empty() && descripcion.is_empty() {
                continue;
            }
            if clave.is_empty() {
                errores.push(format!("fila {fila}: clave vacía, se omitió"));
                continue;
            }
            if descripcion.is_empty() {
                errores.push(format!("fila {fila}: descripción vacía, se omitió"));
                continue;
            }
            let item = FilaMaestroEquipoCsv {
                fila,
                clave: clave.clone(),
                descripcion,
                unidad,
                familia: col_familia.map(|c| celda(&registro, c)).unwrap_or_default(),
                subfamilia: col_subfamilia
                    .map(|c| celda(&registro, c))
                    .unwrap_or_default(),
                costo_maquina: col_costo_maquina
                    .map(|c| celda(&registro, c))
                    .unwrap_or_default(),
                valor_llantas: col_valor_llantas
                    .map(|c| celda(&registro, c))
                    .unwrap_or_default(),
                valor_piezas: col_valor_piezas
                    .map(|c| celda(&registro, c))
                    .unwrap_or_default(),
                rescate: col_rescate.map(|c| celda(&registro, c)).unwrap_or_default(),
                vida_economica: col_vida.map(|c| celda(&registro, c)).unwrap_or_default(),
                horas_uso_anual: col_horas.map(|c| celda(&registro, c)).unwrap_or_default(),
                interes_anual: col_interes.map(|c| celda(&registro, c)).unwrap_or_default(),
                seguros_anual: col_seguros.map(|c| celda(&registro, c)).unwrap_or_default(),
                mantenimiento: col_mantenimiento
                    .map(|c| celda(&registro, c))
                    .unwrap_or_default(),
            };
            let llave = clave_cruce(&clave);
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

        let mut detalles_por_clave: HashMap<String, Vec<FilaDetalleEquipoCsv>> = HashMap::new();
        for (fila, registro) in detalle.filas {
            let clave_maquina = celda(&registro, col_det_clave);
            let seccion = celda(&registro, col_seccion);
            let clave_insumo = col_clave_insumo
                .map(|c| celda(&registro, c))
                .unwrap_or_default();
            let descripcion = celda(&registro, col_desc_insumo);
            let cantidad = celda(&registro, col_cantidad);
            let naturaleza = col_naturaleza
                .map(|c| celda(&registro, c))
                .unwrap_or_default();
            if clave_maquina.is_empty()
                && seccion.is_empty()
                && descripcion.is_empty()
                && clave_insumo.is_empty()
            {
                continue;
            }
            if clave_maquina.is_empty() {
                errores.push(format!(
                    "fila {fila}: clave de máquina vacía en DETALLE, se omitió"
                ));
                continue;
            }
            detalles_por_clave
                .entry(clave_cruce(&clave_maquina))
                .or_default()
                .push(FilaDetalleEquipoCsv {
                    fila,
                    seccion,
                    clave_insumo,
                    descripcion,
                    cantidad,
                    naturaleza,
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
                match resolver_detalle_equipo_csv(
                    fila,
                    &material_id_por_clave,
                    &material_id_por_descripcion,
                    &categoria_id_por_clave,
                    &categoria_id_por_descripcion,
                    &cuadrilla_id_por_clave,
                    &cuadrilla_id_por_descripcion,
                ) {
                    Ok(detalle) => {
                        detalles_ok.push((fila.fila, etiqueta_detalle_equipo(fila), detalle))
                    }
                    Err(e) => errores.push(e),
                }
            }
            if filas_csv > 0 && detalles_ok.is_empty() {
                errores.push(format!(
                    "equipo \"{}\": ningún renglón de detalle pudo resolverse, no se modificó el detalle",
                    grupo.clave
                ));
            }

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
            let horas_uso = decimal_o_cero(&grupo.horas_uso_anual);
            let datos = EquipoCostoHorarioData {
                clave: grupo.clave.clone(),
                descripcion: grupo.descripcion.clone(),
                unidad_id,
                familia_id,
                sub_familia_id,
                cf_costo_maquina: decimal_o_cero(&grupo.costo_maquina),
                cf_valor_llantas: decimal_o_cero(&grupo.valor_llantas),
                cf_valor_piezas_especiales: decimal_o_cero(&grupo.valor_piezas),
                cf_valor_rescate_porcentaje: decimal_o_cero(&grupo.rescate),
                cf_vida_economica_anios: decimal_o_cero(&grupo.vida_economica),
                cf_horas_uso_anual: if horas_uso > Decimal::ZERO {
                    horas_uso
                } else {
                    Decimal::ONE
                },
                cf_tasa_interes_anual_porcentaje: decimal_o_cero(&grupo.interes_anual),
                cf_tasa_seguros_anual_porcentaje: decimal_o_cero(&grupo.seguros_anual),
                cf_mantenimiento_porcentaje: decimal_o_cero(&grupo.mantenimiento),
            };

            let existente_id = por_clave.get(&llave).cloned();
            let equipo = if let Some(id) = existente_id {
                match Self::actualizar(repo, id, datos, Some(creado_por.clone())).await {
                    Ok(e) => {
                        actualizados += 1;
                        e
                    }
                    Err(e) => {
                        errores.push(format!(
                            "equipo \"{}\": no se pudo actualizar ({e})",
                            grupo.clave
                        ));
                        continue;
                    }
                }
            } else {
                match Self::crear(repo, organizacion_id, datos, creado_por.clone()).await {
                    Ok(e) => {
                        creados += 1;
                        e
                    }
                    Err(e) => {
                        errores.push(format!(
                            "equipo \"{}\": no se pudo crear ({e})",
                            grupo.clave
                        ));
                        continue;
                    }
                }
            };
            por_clave.insert(llave, equipo.id.clone());

            if filas_csv > 0 && detalles_ok.is_empty() {
                continue;
            }

            Self::sincronizar_detalles_importados(
                repo,
                &equipo.id,
                detalles_ok,
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
        equipo_id: &str,
        detalles_ok: Vec<(usize, String, EquipoCostoHorarioDetalleData)>,
        creado_por: &str,
        errores: &mut Vec<String>,
    ) {
        let existentes =
            match EquipoCostoHorarioDetalleService::listar_por_equipo(repo, equipo_id).await {
                Ok(d) => d,
                Err(e) => {
                    errores.push(format!("no se pudo leer el detalle del equipo ({e})"));
                    return;
                }
            };
        let mut detalle_id_por_insumo: HashMap<String, String> = existentes
            .iter()
            .map(|d| (d.detalle_insumo_id.clone(), d.id.clone()))
            .collect();
        let mut vistos: HashSet<String> = HashSet::new();

        for (fila, _descripcion, detalle) in detalles_ok {
            let insumo_id = detalle.detalle_insumo_id.clone();
            vistos.insert(insumo_id.clone());

            if let Some(detalle_id) = detalle_id_por_insumo.get(&insumo_id).cloned() {
                if let Err(e) = EquipoCostoHorarioDetalleService::actualizar(
                    repo,
                    detalle_id,
                    EquipoCostoHorarioDetalleData {
                        detalle_insumo_id: insumo_id,
                        cantidad: detalle.cantidad,
                        naturaleza: None,
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

            if let Err(e) = EquipoCostoHorarioDetalleService::crear(
                repo,
                equipo_id,
                detalle,
                creado_por.to_string(),
            )
            .await
            {
                errores.push(format!("fila {fila}: no se pudo agregar el detalle ({e})"));
            } else if let Ok(lista) =
                EquipoCostoHorarioDetalleService::listar_por_equipo(repo, equipo_id).await
            {
                if let Some(d) = lista.iter().find(|d| d.detalle_insumo_id == insumo_id) {
                    detalle_id_por_insumo.insert(insumo_id, d.id.clone());
                }
            }
        }

        for existente in existentes {
            if vistos.contains(&existente.detalle_insumo_id) {
                continue;
            }
            if let Err(e) = EquipoCostoHorarioDetalleService::eliminar(
                repo,
                existente.id,
                creado_por.to_string(),
            )
            .await
            {
                errores.push(format!(
                    "no se pudo eliminar un renglón de detalle que ya no viene en el CSV ({e})"
                ));
            }
        }
    }

    async fn buscar_costo_nacional(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_id: &str,
    ) -> Result<Option<equipo_costo_horario_costo::Model>, ServiceError> {
        Ok(equipo_costo_horario_costo::Entity::find()
            .filter(
                equipo_costo_horario_costo::Column::EquipoCostoHorarioId
                    .eq(equipo_costo_horario_id),
            )
            .filter(equipo_costo_horario_costo::Column::RegionId.is_null())
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?)
    }
}

struct FilaMaestroEquipoCsv {
    fila: usize,
    clave: String,
    descripcion: String,
    unidad: String,
    familia: String,
    subfamilia: String,
    costo_maquina: String,
    valor_llantas: String,
    valor_piezas: String,
    rescate: String,
    vida_economica: String,
    horas_uso_anual: String,
    interes_anual: String,
    seguros_anual: String,
    mantenimiento: String,
}

struct FilaDetalleEquipoCsv {
    fila: usize,
    seccion: String,
    clave_insumo: String,
    descripcion: String,
    cantidad: String,
    naturaleza: String,
}

fn etiqueta_detalle_equipo(fila: &FilaDetalleEquipoCsv) -> String {
    if !fila.descripcion.is_empty() {
        fila.descripcion.clone()
    } else {
        fila.clave_insumo.clone()
    }
}

fn decimal_o_cero(texto: &str) -> Decimal {
    parsear_decimal(texto).unwrap_or(Decimal::ZERO)
}

fn parsear_seccion_equipo(
    seccion: &str,
) -> Option<obrix_db::entities::equipo_costo_horario_detalle::TipoEquipoCostoHorarioDetalle> {
    use obrix_db::entities::equipo_costo_horario_detalle::TipoEquipoCostoHorarioDetalle;
    match seccion.trim().to_lowercase().replace('_', " ").as_str() {
        "consumo" => Some(TipoEquipoCostoHorarioDetalle::Consumo),
        "operacion" | "operación" => Some(TipoEquipoCostoHorarioDetalle::Operacion),
        _ => None,
    }
}

fn parsear_naturaleza_consumo(
    texto: &str,
) -> Result<
    Option<obrix_db::entities::equipo_costo_horario_detalle::NaturalezaEquipoCostoHorarioDetalle>,
    String,
> {
    use obrix_db::entities::equipo_costo_horario_detalle::NaturalezaEquipoCostoHorarioDetalle;
    let n = texto.trim().to_lowercase().replace(' ', "_");
    if n.is_empty() {
        return Ok(None);
    }
    match n.as_str() {
        "combustible" => Ok(Some(NaturalezaEquipoCostoHorarioDetalle::Combustible)),
        "lubricante" => Ok(Some(NaturalezaEquipoCostoHorarioDetalle::Lubricante)),
        "llantas" | "llanta" => Ok(Some(NaturalezaEquipoCostoHorarioDetalle::Llantas)),
        "piezas_especiales" | "pieza_especial" => {
            Ok(Some(NaturalezaEquipoCostoHorarioDetalle::PiezasEspeciales))
        }
        "otras_fuentes" | "otra_fuente" => {
            Ok(Some(NaturalezaEquipoCostoHorarioDetalle::OtrasFuentes))
        }
        _ => Err(format!(
            "naturaleza \"{texto}\" no reconocida (use combustible, lubricante, llantas, piezas especiales u otras fuentes)"
        )),
    }
}

fn inferir_naturaleza_consumo(
    descripcion: &str,
) -> obrix_db::entities::equipo_costo_horario_detalle::NaturalezaEquipoCostoHorarioDetalle {
    use obrix_db::entities::equipo_costo_horario_detalle::NaturalezaEquipoCostoHorarioDetalle;
    let d = clave_cruce(descripcion);
    if d.contains("diesel") || d.contains("diésel") || d.contains("gasolina") {
        NaturalezaEquipoCostoHorarioDetalle::Combustible
    } else if d.contains("aceite") || d.contains("lubricante") {
        NaturalezaEquipoCostoHorarioDetalle::Lubricante
    } else if d.contains("llanta") {
        NaturalezaEquipoCostoHorarioDetalle::Llantas
    } else if d.contains("manguera") || d.contains("pieza especial") {
        NaturalezaEquipoCostoHorarioDetalle::PiezasEspeciales
    } else {
        NaturalezaEquipoCostoHorarioDetalle::OtrasFuentes
    }
}

fn resolver_detalle_equipo_csv(
    fila: &FilaDetalleEquipoCsv,
    material_id_por_clave: &HashMap<String, String>,
    material_id_por_descripcion: &HashMap<String, String>,
    categoria_id_por_clave: &HashMap<String, String>,
    categoria_id_por_descripcion: &HashMap<String, String>,
    cuadrilla_id_por_clave: &HashMap<String, String>,
    cuadrilla_id_por_descripcion: &HashMap<String, String>,
) -> Result<EquipoCostoHorarioDetalleData, String> {
    use obrix_db::entities::equipo_costo_horario_detalle::TipoEquipoCostoHorarioDetalle;
    let n = fila.fila;
    let Some(tipo) = parsear_seccion_equipo(&fila.seccion) else {
        return Err(format!(
            "fila {n}: sección \"{}\" no reconocida (use CONSUMO o OPERACION), se omitió",
            fila.seccion
        ));
    };
    if fila.clave_insumo.is_empty() && fila.descripcion.is_empty() {
        return Err(format!(
            "fila {n}: detalle sin clave ni descripción de insumo, se omitió"
        ));
    }
    let Some(cantidad) = parsear_decimal(&fila.cantidad) else {
        return Err(format!(
            "fila {n}: cantidad \"{}\" no es un número válido, se omitió",
            fila.cantidad
        ));
    };
    let (por_clave, por_descripcion, etiqueta) = match tipo {
        TipoEquipoCostoHorarioDetalle::Consumo => (
            material_id_por_clave,
            material_id_por_descripcion,
            "material",
        ),
        TipoEquipoCostoHorarioDetalle::Operacion => {
            // Preferir cuadrilla; si no hay match se intenta categoría FASAR abajo.
            (
                cuadrilla_id_por_clave,
                cuadrilla_id_por_descripcion,
                "cuadrilla o categoría FASAR",
            )
        }
    };
    let mut detalle_insumo_id = if !fila.clave_insumo.is_empty() {
        por_clave.get(&clave_cruce(&fila.clave_insumo)).cloned()
    } else {
        por_descripcion
            .get(&clave_cruce(&fila.descripcion))
            .cloned()
    };
    if detalle_insumo_id.is_none() && tipo == TipoEquipoCostoHorarioDetalle::Operacion {
        detalle_insumo_id = if !fila.clave_insumo.is_empty() {
            categoria_id_por_clave
                .get(&clave_cruce(&fila.clave_insumo))
                .cloned()
        } else {
            categoria_id_por_descripcion
                .get(&clave_cruce(&fila.descripcion))
                .cloned()
        };
    }
    let detalle_insumo_id = detalle_insumo_id.ok_or_else(|| {
        if !fila.clave_insumo.is_empty() {
            format!(
                "fila {n}: {etiqueta} con clave \"{}\" no encontrada, se omitió",
                fila.clave_insumo
            )
        } else {
            format!(
                "fila {n}: {etiqueta} \"{}\" no encontrada, se omitió",
                fila.descripcion
            )
        }
    })?;
    let naturaleza = match tipo {
        TipoEquipoCostoHorarioDetalle::Consumo => {
            match parsear_naturaleza_consumo(&fila.naturaleza) {
                Ok(Some(natz)) => Some(natz),
                Ok(None) => Some(inferir_naturaleza_consumo(&fila.descripcion)),
                Err(e) => return Err(format!("fila {n}: {e}, se omitió")),
            }
        }
        TipoEquipoCostoHorarioDetalle::Operacion => None,
    };
    Ok(EquipoCostoHorarioDetalleData {
        detalle_insumo_id,
        cantidad,
        naturaleza,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use obrix_db::PortafolioSqliteRepository;
    use std::path::Path;

    fn datos_validar(clave: &str, descripcion: &str) -> EquipoCostoHorarioData {
        EquipoCostoHorarioData {
            clave: clave.to_string(),
            descripcion: descripcion.to_string(),
            unidad_id: "um-1".to_string(),
            familia_id: None,
            sub_familia_id: None,
            cf_costo_maquina: "1000000".parse().unwrap(),
            cf_valor_llantas: "0".parse().unwrap(),
            cf_valor_piezas_especiales: "0".parse().unwrap(),
            cf_valor_rescate_porcentaje: "10".parse().unwrap(),
            cf_vida_economica_anios: "5".parse().unwrap(),
            cf_horas_uso_anual: "2000".parse().unwrap(),
            cf_tasa_interes_anual_porcentaje: "12".parse().unwrap(),
            cf_tasa_seguros_anual_porcentaje: "4".parse().unwrap(),
            cf_mantenimiento_porcentaje: "60".parse().unwrap(),
        }
    }

    #[test]
    fn validar_rechaza_clave_vacia_o_solo_espacios() {
        assert!(
            EquipoCostoHorarioService::validar(&datos_validar("", "Excavadora"), false).is_err()
        );
        assert!(
            EquipoCostoHorarioService::validar(&datos_validar("   ", "Excavadora"), true).is_err()
        );
    }

    #[test]
    fn validar_rechaza_descripcion_vacia() {
        assert!(EquipoCostoHorarioService::validar(&datos_validar("ECH-1", ""), false).is_err());
    }

    #[test]
    fn validar_acepta_datos_completos() {
        assert!(
            EquipoCostoHorarioService::validar(&datos_validar("ECH-1", "Excavadora"), false)
                .is_ok()
        );
    }

    #[test]
    fn validar_rechaza_unidad_id_vacio() {
        let mut d = datos_validar("ECH-1", "Excavadora");
        d.unidad_id = String::new();
        assert!(EquipoCostoHorarioService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_familia_id_vacio() {
        let mut d = datos_validar("ECH-1", "Excavadora");
        d.familia_id = Some(String::new());
        assert!(EquipoCostoHorarioService::validar(&d, false).is_err());
    }

    #[test]
    fn validar_rechaza_sub_familia_id_vacio() {
        let mut d = datos_validar("ECH-1", "Excavadora");
        d.sub_familia_id = Some(String::new());
        assert!(EquipoCostoHorarioService::validar(&d, false).is_err());
    }

    async fn portafolio_con_unidad() -> PortafolioSqliteRepository {
        use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
        use sea_orm::ActiveModelTrait;

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
            simbolo: Set("hr".into()),
            simbolo_impresion: Set("hr".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Hora".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Tiempo),
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

        portafolio
    }

    #[tokio::test]
    async fn crear_listar_actualizar_eliminar_equipo_costo_horario() {
        let portafolio = portafolio_con_unidad().await;
        let datos = |descripcion: &str| EquipoCostoHorarioData {
            clave: "ECH-1".into(),
            descripcion: descripcion.into(),
            unidad_id: "um-1".into(),
            familia_id: None,
            sub_familia_id: None,
            cf_costo_maquina: "1000000".parse().unwrap(),
            cf_valor_llantas: "0".parse().unwrap(),
            cf_valor_piezas_especiales: "0".parse().unwrap(),
            cf_valor_rescate_porcentaje: "10".parse().unwrap(),
            cf_vida_economica_anios: "5".parse().unwrap(),
            cf_horas_uso_anual: "2000".parse().unwrap(),
            cf_tasa_interes_anual_porcentaje: "12".parse().unwrap(),
            cf_tasa_seguros_anual_porcentaje: "4".parse().unwrap(),
            cf_mantenimiento_porcentaje: "60".parse().unwrap(),
        };

        let creado = EquipoCostoHorarioService::crear(
            &portafolio,
            "org-1",
            datos("Excavadora CAT 320"),
            "usr-1".into(),
        )
        .await
        .expect("crear equipo_costo_horario");
        assert_eq!(creado.clave, "ECH-1");
        assert_eq!(creado.cf_valor_maquina, "1000000".parse().unwrap());
        assert_eq!(creado.cf_valor_rescate, "100000".parse().unwrap());
        assert_eq!(creado.cf_vida_util_horas, "10000".parse().unwrap());
        assert_eq!(creado.cf_depreciacion_hora, "90".parse().unwrap());
        let costo_nacional = creado.costo_nacional.as_ref().expect("valuación nacional");
        assert!(costo_nacional.region_id.is_none());
        assert_eq!(costo_nacional.cargo_variable_hora, Decimal::ZERO);
        assert_eq!(costo_nacional.costo_total, creado.cf_cargo_fijo_hora);

        let listado = EquipoCostoHorarioService::listar(&portafolio, "org-1")
            .await
            .expect("listar equipos");
        assert_eq!(listado.len(), 1);

        let actualizado = EquipoCostoHorarioService::actualizar(
            &portafolio,
            creado.id.clone(),
            datos("Excavadora CAT 320 (revisada)"),
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar equipo_costo_horario");
        assert_eq!(actualizado.descripcion, "Excavadora CAT 320 (revisada)");

        EquipoCostoHorarioService::eliminar(&portafolio, creado.id.clone(), "usr-1".into())
            .await
            .expect("eliminar equipo_costo_horario");

        let insumo_restante = obrix_db::entities::insumo::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap()
            .expect("el insumo debe seguir existiendo");
        assert!(insumo_restante.deleted);

        let listado_tras_borrar = EquipoCostoHorarioService::listar(&portafolio, "org-1")
            .await
            .expect("listar tras borrar");
        assert!(listado_tras_borrar.iter().all(|e| e.id != creado.id));
    }

    fn csv_equipos(maestro: &str, detalle: &str) -> String {
        format!(
            "MAESTRO\nClave,Descripción,Unidad,Familia,Subfamilia,Costo máquina,Valor llantas,Valor piezas especiales,Rescate %,Vida económica (años),Horas de uso anual,Interés anual %,Seguros anual %,Mantenimiento %\n{maestro}\n\nDETALLE\nClave Máquina,Sección,Clave Insumo,Descripción Insumo,Unidad,Cantidad\n{detalle}"
        )
    }

    async fn portafolio_listo_para_importar() -> (
        PortafolioSqliteRepository,
        String,
        String,
        std::collections::HashMap<String, String>,
    ) {
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
        let unidades = unidad_medida::Entity::find()
            .all(portafolio.conexion())
            .await
            .unwrap();
        let mapa = UnidadMedidaService::mapa_id_por_texto(&unidades);
        (portafolio, org.id, admin.id, mapa)
    }

    #[tokio::test]
    async fn importar_csv_resuelve_unidad_por_variantes() {
        let (portafolio, org_id, admin_id, mapa) = portafolio_listo_para_importar().await;
        let csv = csv_equipos("EQ-1,Camión de prueba,h,,,0,0,0,10,6,1500,16,3,75\n", "");
        let resultado =
            EquipoCostoHorarioService::importar_csv(&portafolio, &org_id, &csv, admin_id)
                .await
                .expect("importar");
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);
        assert_eq!(resultado.creados, 1);

        let item = EquipoCostoHorarioService::listar(&portafolio, &org_id)
            .await
            .unwrap()
            .into_iter()
            .find(|e| e.clave == "EQ-1")
            .expect("importado");
        assert_eq!(item.unidad_id, mapa["hr"]);
        assert_eq!(item.unidad_id, mapa["h"]);
        assert_eq!(item.cf_horas_uso_anual, Decimal::from(1500));
        assert_eq!(item.cf_vida_economica_anios, Decimal::from(6));
    }

    #[tokio::test]
    async fn importar_csv_clave_es_obligatoria_y_no_busca_por_descripcion() {
        let (portafolio, org_id, admin_id, _) = portafolio_listo_para_importar().await;
        let alta = csv_equipos("EQ-1,Camión de prueba,h,,,0,0,0,10,6,1500,16,3,75\n", "");
        EquipoCostoHorarioService::importar_csv(&portafolio, &org_id, &alta, admin_id.clone())
            .await
            .expect("alta");

        let sin_clave = csv_equipos(",Otra descripción,h,,,0,0,0,10,6,1500,16,3,75\n", "");
        let omitida = EquipoCostoHorarioService::importar_csv(
            &portafolio,
            &org_id,
            &sin_clave,
            admin_id.clone(),
        )
        .await
        .expect("clave vacía");
        assert_eq!(omitida.importados, 0);
        assert!(omitida.errores.iter().any(|e| e.contains("clave vacía")));

        let otra = csv_equipos("EQ-2,Camión de prueba,h,,,0,0,0,10,6,1500,16,3,75\n", "");
        let resultado =
            EquipoCostoHorarioService::importar_csv(&portafolio, &org_id, &otra, admin_id)
                .await
                .expect("misma descripción");
        assert_eq!(resultado.creados, 1);
        assert_eq!(resultado.actualizados, 0);
        let listado = EquipoCostoHorarioService::listar(&portafolio, &org_id)
            .await
            .unwrap();
        let mut claves: Vec<_> = listado.iter().map(|e| e.clave.as_str()).collect();
        claves.sort();
        assert_eq!(claves, vec!["EQ-1", "EQ-2"]);
    }

    #[tokio::test]
    async fn importar_csv_sincroniza_detalle_cantidad_alta_y_baja() {
        use crate::cuadrilla::{CuadrillaData, CuadrillaService};
        use crate::equipo_costo_horario_detalle::EquipoCostoHorarioDetalleService;
        use crate::material::{MaterialData, MaterialService};
        use obrix_db::entities::equipo_costo_horario_detalle::TipoEquipoCostoHorarioDetalle;
        use std::str::FromStr;

        let (portafolio, org_id, admin_id, mapa) = portafolio_listo_para_importar().await;
        MaterialService::crear(
            &portafolio,
            &org_id,
            MaterialData {
                clave: "MAT-D".into(),
                descripcion: "Diesel".into(),
                unidad_id: mapa["l"].clone(),
                familia_id: None,
                sub_familia_id: None,
                proveedor_id: None,
                merma_porcentaje: None,
                marca: None,
            },
            admin_id.clone(),
        )
        .await
        .expect("diesel");
        MaterialService::crear(
            &portafolio,
            &org_id,
            MaterialData {
                clave: "MAT-A".into(),
                descripcion: "Aceite lubricante para motor SAE 25W50, de 5 litros".into(),
                unidad_id: mapa["l"].clone(),
                familia_id: None,
                sub_familia_id: None,
                proveedor_id: None,
                merma_porcentaje: None,
                marca: None,
            },
            admin_id.clone(),
        )
        .await
        .expect("aceite");
        CuadrillaService::crear(
            &portafolio,
            &org_id,
            CuadrillaData {
                clave: "00-M0017".into(),
                descripcion: "Cuadrilla 17 (Operador de equipo ligero)".into(),
                unidad_id: mapa["jor"].clone(),
                familia_id: None,
                sub_familia_id: None,
            },
            admin_id.clone(),
        )
        .await
        .expect("cuadrilla");

        let inicial = csv_equipos(
            "EQ-S,Equipo sync,h,,,1000,0,0,10,5,1500,16,3,75\n",
            "EQ-S,CONSUMO,,Diesel,l,18\n\
             EQ-S,CONSUMO,,\"Aceite lubricante para motor SAE 25W50, de 5 litros\",l,0.26\n\
             EQ-S,OPERACION,,Cuadrilla 17 (Operador de equipo ligero),jor,0.156250\n",
        );
        let alta = EquipoCostoHorarioService::importar_csv(
            &portafolio,
            &org_id,
            &inicial,
            admin_id.clone(),
        )
        .await
        .expect("alta");
        assert!(alta.errores.is_empty(), "{:?}", alta.errores);

        let segundo = csv_equipos(
            "EQ-S,Equipo sync nueva,h,,,2000,0,0,10,5,1500,16,3,75\n",
            "EQ-S,CONSUMO,,Diesel,l,20\n\
             EQ-S,OPERACION,,Cuadrilla 17 (Operador de equipo ligero),jor,0.2\n",
        );
        let resultado =
            EquipoCostoHorarioService::importar_csv(&portafolio, &org_id, &segundo, admin_id)
                .await
                .expect("sync");
        assert_eq!(resultado.creados, 0);
        assert_eq!(resultado.actualizados, 1);
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);

        let equipo = EquipoCostoHorarioService::listar(&portafolio, &org_id)
            .await
            .unwrap()
            .into_iter()
            .find(|e| e.clave == "EQ-S")
            .expect("EQ-S");
        assert_eq!(equipo.descripcion, "Equipo sync nueva");
        assert_eq!(equipo.cf_costo_maquina, Decimal::from(2000));

        let detalles = EquipoCostoHorarioDetalleService::listar_por_equipo(&portafolio, &equipo.id)
            .await
            .expect("detalles");
        assert_eq!(detalles.len(), 2);
        assert_eq!(
            detalles
                .iter()
                .filter(|d| d.tipo == TipoEquipoCostoHorarioDetalle::Consumo)
                .count(),
            1
        );
        let diesel = detalles
            .iter()
            .find(|d| d.tipo == TipoEquipoCostoHorarioDetalle::Consumo)
            .expect("diesel");
        assert_eq!(diesel.cantidad, Decimal::from(20));
        let op = detalles
            .iter()
            .find(|d| d.tipo == TipoEquipoCostoHorarioDetalle::Operacion)
            .expect("operacion");
        assert_eq!(op.cantidad, Decimal::from_str("0.2").unwrap());
    }

    #[tokio::test]
    async fn importar_csv_resuelve_detalle_por_clave_insumo() {
        use crate::equipo_costo_horario_detalle::EquipoCostoHorarioDetalleService;
        use crate::material::{MaterialData, MaterialService};

        let (portafolio, org_id, admin_id, mapa) = portafolio_listo_para_importar().await;
        let diesel = MaterialService::crear(
            &portafolio,
            &org_id,
            MaterialData {
                clave: "MAT-D".into(),
                descripcion: "Diesel".into(),
                unidad_id: mapa["l"].clone(),
                familia_id: None,
                sub_familia_id: None,
                proveedor_id: None,
                merma_porcentaje: None,
                marca: None,
            },
            admin_id.clone(),
        )
        .await
        .expect("diesel");

        let csv = csv_equipos(
            "EQ-C,Equipo clave,h,,,1000,0,0,10,5,1500,16,3,75\n",
            &format!("EQ-C,CONSUMO,{},no debe usarse,l,11\n", diesel.clave),
        );
        let resultado =
            EquipoCostoHorarioService::importar_csv(&portafolio, &org_id, &csv, admin_id)
                .await
                .expect("importar");
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);

        let equipo = EquipoCostoHorarioService::listar(&portafolio, &org_id)
            .await
            .unwrap()
            .into_iter()
            .find(|e| e.clave == "EQ-C")
            .expect("EQ-C");
        let detalles = EquipoCostoHorarioDetalleService::listar_por_equipo(&portafolio, &equipo.id)
            .await
            .unwrap();
        assert_eq!(detalles.len(), 1);
        assert_eq!(detalles[0].detalle_insumo_id, diesel.id);
        assert_eq!(detalles[0].cantidad, Decimal::from(11));
    }

    #[tokio::test]
    async fn importar_csv_requiere_secciones_maestro_y_detalle() {
        let (portafolio, org_id, admin_id, _) = portafolio_listo_para_importar().await;
        let err = EquipoCostoHorarioService::importar_csv(
            &portafolio,
            &org_id,
            "Clave,Descripción,Unidad\nEQ-1,Sin secciones,h\n",
            admin_id,
        )
        .await
        .expect_err("sin secciones");
        assert!(err.to_string().contains("MAESTRO"), "{err}");
    }
}
