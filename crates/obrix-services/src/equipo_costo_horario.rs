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
use obrix_db::entities::{equipo_costo_horario, equipo_costo_horario_costo, familia_insumo, unidad_medida};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, TransactionTrait,
};

use crate::equipo_costo_horario_costo::EquipoCostoHorarioCostoService;
use crate::unidad_medida::UnidadMedidaService;
use crate::{ServiceError, nuevo_id};

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

        let extension: std::collections::HashSet<String> = equipo_costo_horario::Entity::find()
            .all(repo.conexion())
            .await?
            .into_iter()
            .map(|e| e.insumo_id)
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
        let mut siguiente = siguiente_consecutivo(clave_por_id.values().map(String::as_str), "EQ-");

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

        let registros: Vec<Result<RegistroCsvEquipo, csv::Error>> =
            lector.deserialize::<RegistroCsvEquipo>().collect();
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
            let descripcion = registro.descripcion.trim().to_string();
            if descripcion.is_empty() {
                errores.push(format!("fila {fila}: descripción vacía, se omitió"));
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
            let horas_uso = decimal_o_cero(&registro.horas_uso_anual);
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
                    let clave = format!("EQ-{siguiente:03}");
                    siguiente += 1;
                    se_autogenero_clave = true;
                    clave
                }
            };
            let datos = EquipoCostoHorarioData {
                clave: clave.clone(),
                descripcion: descripcion.clone(),
                unidad_id,
                familia_id,
                sub_familia_id,
                cf_costo_maquina: decimal_o_cero(&registro.costo_maquina),
                cf_valor_llantas: decimal_o_cero(&registro.valor_llantas),
                cf_valor_piezas_especiales: decimal_o_cero(&registro.valor_piezas_especiales),
                cf_valor_rescate_porcentaje: decimal_o_cero(&registro.rescate),
                cf_vida_economica_anios: decimal_o_cero(&registro.vida_economica),
                cf_horas_uso_anual: if horas_uso > Decimal::ZERO {
                    horas_uso
                } else {
                    Decimal::ONE
                },
                cf_tasa_interes_anual_porcentaje: decimal_o_cero(&registro.interes_anual),
                cf_tasa_seguros_anual_porcentaje: decimal_o_cero(&registro.seguros_anual),
                cf_mantenimiento_porcentaje: decimal_o_cero(&registro.mantenimiento),
            };
            let item = if let Some(id) = existente_id {
                match Self::actualizar(repo, id, datos, Some(creado_por.clone())).await {
                    Ok(e) => {
                        actualizados += 1;
                        e
                    }
                    Err(e) => {
                        errores.push(format!("fila {fila}: no se pudo actualizar el equipo ({e})"));
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
                        errores.push(format!("fila {fila}: no se pudo crear el equipo ({e})"));
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
                "El archivo no tiene columna \"Clave\"; se generarán claves automáticas con el prefijo EQ-."
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

    async fn buscar_costo_nacional(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_id: &str,
    ) -> Result<Option<equipo_costo_horario_costo::Model>, ServiceError> {
        Ok(equipo_costo_horario_costo::Entity::find()
            .filter(
                equipo_costo_horario_costo::Column::EquipoCostoHorarioId.eq(equipo_costo_horario_id),
            )
            .filter(equipo_costo_horario_costo::Column::RegionId.is_null())
            .filter(equipo_costo_horario_costo::Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?)
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvEquipo {
    #[serde(rename = "Clave", default)]
    clave: Option<String>,
    #[serde(rename = "Descripción")]
    descripcion: String,
    #[serde(rename = "Unidad")]
    unidad: String,
    #[serde(rename = "Familia", default)]
    familia: Option<String>,
    #[serde(rename = "Subfamilia", default)]
    subfamilia: Option<String>,
    #[serde(rename = "Costo máquina", default)]
    costo_maquina: String,
    #[serde(rename = "Valor llantas", default)]
    valor_llantas: String,
    #[serde(rename = "Valor piezas especiales", default)]
    valor_piezas_especiales: String,
    #[serde(rename = "Rescate %", default)]
    rescate: String,
    #[serde(rename = "Vida económica (años)", default)]
    vida_economica: String,
    #[serde(rename = "Horas de uso anual", default)]
    horas_uso_anual: String,
    #[serde(rename = "Interés anual %", default)]
    interes_anual: String,
    #[serde(rename = "Seguros anual %", default)]
    seguros_anual: String,
    #[serde(rename = "Mantenimiento %", default)]
    mantenimiento: String,
}

fn decimal_o_cero(texto: &str) -> Decimal {
    let limpio: String = texto
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();
    if limpio.is_empty() || limpio == "-" || limpio == "." {
        return Decimal::ZERO;
    }
    limpio.parse().unwrap_or(Decimal::ZERO)
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

        let csv = "Descripción,Unidad,Horas de uso anual,Vida económica (años)\n\
                    Camión de prueba,h,1500,6\n";
        let resultado = EquipoCostoHorarioService::importar_csv(
            &portafolio,
            &org.id,
            csv,
            admin.id.clone(),
        )
        .await
        .expect("importar");
        assert!(resultado.errores.is_empty(), "{:?}", resultado.errores);
        assert_eq!(resultado.creados, 1);

        let item = EquipoCostoHorarioService::listar(&portafolio, &org.id)
            .await
            .unwrap()
            .into_iter()
            .find(|e| e.descripcion == "Camión de prueba")
            .expect("importado");
        let unidades = unidad_medida::Entity::find()
            .all(portafolio.conexion())
            .await
            .unwrap();
        let mapa = UnidadMedidaService::mapa_id_por_texto(&unidades);
        assert_eq!(item.unidad_id, mapa["hr"]);
        assert_eq!(item.unidad_id, mapa["h"]);
        assert_eq!(item.cf_horas_uso_anual, Decimal::from(1500));
    }
}
