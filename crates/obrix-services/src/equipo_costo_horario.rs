//! `equipo_costo_horario` es una extensión 1:1 de `insumo` (ver diccionario
//! de datos) — este servicio administra ambas tablas juntas como si fueran
//! una sola entidad "Equipo de costo horario", igual que
//! `material`/`categoria_fasar`/`herramienta`/`cuadrilla` hacen con `insumo`.
//! Los campos `cf_*` de cache (todo salvo los 9 de captura directa del
//! usuario) se recalculan aquí, en `calcular_cargos_fijos`, cada vez que se
//! crea o actualiza el equipo — son puramente función de esos 9 valores, no
//! dependen de la composición. `cargo_variable_hora`/`costo_horario_total`
//! sí dependen de la composición (`equipo_costo_horario_detalle`) y los
//! administra `EquipoCostoHorarioDetalleService`.

use obrix_db::entities::equipo_costo_horario;
use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::PortafolioRepository;
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, TransactionTrait};

use crate::{nuevo_id, ServiceError};

#[derive(serde::Deserialize)]
pub struct EquipoCostoHorarioData {
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    /// Debe ser hija (`parent_id`) de `familia_id` — no se valida aquí, el
    /// frontend ya restringe las opciones mostradas a los hijos de la familia elegida.
    pub sub_familia_id: Option<String>,
    pub activo: bool,
    /// `null` = nacional — solo descriptivo, no participa en ningún cálculo.
    pub region_id: Option<String>,
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
    let cf_valor_maquina = datos.cf_costo_maquina - datos.cf_valor_llantas - datos.cf_valor_piezas_especiales;
    let cf_valor_rescate = cf_valor_maquina * datos.cf_valor_rescate_porcentaje / Decimal::ONE_HUNDRED;
    let cf_vida_util_horas = datos.cf_vida_economica_anios * datos.cf_horas_uso_anual;
    if cf_vida_util_horas <= Decimal::ZERO {
        return Err(ServiceError::Validacion(
            "la vida útil en horas (vida económica × horas de uso anual) debe ser mayor a 0".to_string(),
        ));
    }
    let cf_depreciacion_hora = (cf_valor_maquina - cf_valor_rescate) / cf_vida_util_horas;
    let dos_horas_uso_anual = Decimal::TWO * datos.cf_horas_uso_anual;
    let cf_inversion_hora =
        (cf_valor_maquina + cf_valor_rescate) * datos.cf_tasa_interes_anual_porcentaje / Decimal::ONE_HUNDRED / dos_horas_uso_anual;
    let cf_seguro_hora =
        (cf_valor_maquina + cf_valor_rescate) * datos.cf_tasa_seguros_anual_porcentaje / Decimal::ONE_HUNDRED / dos_horas_uso_anual;
    let cf_mantenimiento_hora = datos.cf_mantenimiento_porcentaje / Decimal::ONE_HUNDRED * cf_depreciacion_hora;
    let cf_cargo_fijo_hora = cf_depreciacion_hora + cf_inversion_hora + cf_seguro_hora + cf_mantenimiento_hora;

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
/// como lo ve el frontend, que no necesita saber que internamente son dos tablas.
#[derive(Debug, Clone, serde::Serialize)]
pub struct EquipoCostoHorarioCompleto {
    pub id: String,
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    pub activo: bool,
    pub region_id: Option<String>,
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
    pub subtotal_consumo: Decimal,
    pub subtotal_operacion: Decimal,
    pub cargo_variable_hora: Decimal,
    pub costo_horario_total: Decimal,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub created_by: String,
    pub updated_by: Option<String>,
}

pub(crate) fn combinar(insumo: insumo::Model, equipo: equipo_costo_horario::Model) -> EquipoCostoHorarioCompleto {
    EquipoCostoHorarioCompleto {
        id: insumo.id,
        clave: insumo.clave,
        descripcion: insumo.descripcion,
        unidad_id: insumo.unidad_id,
        familia_id: insumo.familia_id,
        sub_familia_id: insumo.sub_familia_id,
        activo: insumo.activo,
        region_id: equipo.region_id,
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
        subtotal_consumo: equipo.subtotal_consumo,
        subtotal_operacion: equipo.subtotal_operacion,
        cargo_variable_hora: equipo.cargo_variable_hora,
        costo_horario_total: equipo.costo_horario_total,
        created_at: insumo.created_at,
        updated_at: insumo.updated_at,
        created_by: insumo.created_by,
        updated_by: insumo.updated_by,
    }
}

pub struct EquipoCostoHorarioService;

impl EquipoCostoHorarioService {
    pub async fn listar(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
    ) -> Result<Vec<EquipoCostoHorarioCompleto>, ServiceError> {
        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::EquipoHerramienta))
            .order_by_asc(insumo::Column::Clave)
            .all(repo.conexion())
            .await?;

        let mut resultado = Vec::with_capacity(insumos.len());
        for ins in insumos {
            // `herramienta`/`equipo_rentado` también son `tipo =
            // equipo_herramienta` — solo las que tienen fila en
            // `equipo_costo_horario` pertenecen a este catálogo.
            let Some(equipo) = equipo_costo_horario::Entity::find_by_id(&ins.id)
                .one(repo.conexion())
                .await?
            else {
                continue;
            };
            resultado.push(combinar(ins, equipo));
        }
        Ok(resultado)
    }

    pub async fn buscar_por_id(
        repo: &dyn PortafolioRepository,
        id: &str,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let ins = insumo::Entity::find_by_id(id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("equipo_costo_horario {id}")))?;
        let equipo = equipo_costo_horario::Entity::find_by_id(id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("equipo_costo_horario {id}")))?;
        Ok(combinar(ins, equipo))
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: EquipoCostoHorarioData,
        creado_por: String,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
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
            activo: Set(datos.activo),
            created_at: Set(ahora),
            updated_at: Set(None),
            created_by: Set(creado_por),
            updated_by: Set(None),
        }
        .insert(&txn)
        .await?;

        let equipo = equipo_costo_horario::ActiveModel {
            insumo_id: Set(id),
            region_id: Set(datos.region_id),
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
            subtotal_consumo: Set(Decimal::ZERO),
            subtotal_operacion: Set(Decimal::ZERO),
            cargo_variable_hora: Set(Decimal::ZERO),
            costo_horario_total: Set(cargos.cf_cargo_fijo_hora),
        }
        .insert(&txn)
        .await?;

        txn.commit().await?;
        Ok(combinar(ins, equipo))
    }

    /// Actualiza tanto los datos de catálogo (clave/descripción/unidad/
    /// familia/región/activo) como los 9 valores de captura de cargos fijos
    /// — recalcula los 8 de cache a partir de ellos. `cargo_variable_hora`
    /// no se toca aquí (lo administra `EquipoCostoHorarioDetalleService` a
    /// partir de la composición); `costo_horario_total` se recompone con el
    /// `cargo_variable_hora` existente más el `cf_cargo_fijo_hora` recién
    /// calculado.
    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: EquipoCostoHorarioData,
        actualizado_por: Option<String>,
    ) -> Result<EquipoCostoHorarioCompleto, ServiceError> {
        let cargos = calcular_cargos_fijos(&datos)?;
        let ahora = crate::ahora();

        let mut ins: insumo::ActiveModel = insumo::Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("equipo_costo_horario {id}")))?
            .into();
        ins.clave = Set(datos.clave);
        ins.descripcion = Set(datos.descripcion);
        ins.unidad_id = Set(datos.unidad_id);
        ins.familia_id = Set(datos.familia_id);
        ins.sub_familia_id = Set(datos.sub_familia_id);
        ins.activo = Set(datos.activo);
        ins.updated_at = Set(Some(ahora));
        ins.updated_by = Set(actualizado_por);
        let ins = ins.update(repo.conexion()).await?;

        let existente = equipo_costo_horario::Entity::find_by_id(&ins.id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("equipo_costo_horario {id}")))?;
        let cargo_variable_hora = existente.cargo_variable_hora;

        let mut eq: equipo_costo_horario::ActiveModel = existente.into();
        eq.region_id = Set(datos.region_id);
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
        eq.costo_horario_total = Set(cargos.cf_cargo_fijo_hora + cargo_variable_hora);
        let equipo = eq.update(repo.conexion()).await?;

        Ok(combinar(ins, equipo))
    }

    /// Borra el `insumo` — `equipo_costo_horario` y su
    /// `equipo_costo_horario_detalle` se eliminan en cascada (FK `ON DELETE CASCADE`).
    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        insumo::Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use obrix_db::PortafolioSqliteRepository;
    use std::path::Path;

    #[tokio::test]
    async fn crear_listar_actualizar_eliminar_equipo_costo_horario() {
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
            updated_at: Set(None),
            created_by: Set(None),
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
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
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
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
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
            created_at: Set(now.clone()),
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        let datos = |descripcion: &str| EquipoCostoHorarioData {
            clave: "ECH-1".into(),
            descripcion: descripcion.into(),
            unidad_id: "um-1".into(),
            familia_id: None,
            sub_familia_id: None,
            activo: true,
            region_id: None,
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

        let creado = EquipoCostoHorarioService::crear(&portafolio, "org-1", datos("Excavadora CAT 320"), "usr-1".into())
            .await
            .expect("crear equipo_costo_horario");
        assert_eq!(creado.clave, "ECH-1");
        // Vm = 1,000,000; Vr = 100,000; Ve = 10,000 horas
        assert_eq!(creado.cf_valor_maquina, "1000000".parse().unwrap());
        assert_eq!(creado.cf_valor_rescate, "100000".parse().unwrap());
        assert_eq!(creado.cf_vida_util_horas, "10000".parse().unwrap());
        // D = (1,000,000 - 100,000) / 10,000 = 90
        assert_eq!(creado.cf_depreciacion_hora, "90".parse().unwrap());
        assert_eq!(creado.cargo_variable_hora, Decimal::ZERO);
        assert_eq!(creado.costo_horario_total, creado.cf_cargo_fijo_hora);

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

        EquipoCostoHorarioService::eliminar(&portafolio, creado.id.clone())
            .await
            .expect("eliminar equipo_costo_horario");

        let insumo_restante = obrix_db::entities::insumo::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap();
        assert!(insumo_restante.is_none(), "el insumo debe quedar borrado");

        let equipo_restante = obrix_db::entities::equipo_costo_horario::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap();
        assert!(
            equipo_restante.is_none(),
            "el equipo_costo_horario debe borrarse en cascada junto con el insumo"
        );
    }
}
