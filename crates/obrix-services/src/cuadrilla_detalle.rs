//! Administra la composición (`cuadrilla_detalle`) de una `cuadrilla` —
//! integrantes (`categoria_fasar`) y herramienta (`herramienta`), en una
//! matriz plana no recursiva (ver diccionario de datos). Cada alta/edición/
//! baja dispara `recalcular`, que vuelve a resolver el costo de todas las
//! filas desde cero: primero mano de obra (el salario vigente de cada
//! integrante puede haber cambiado desde la última vez), luego herramienta
//! (que depende del subtotal de mano de obra recién calculado), y por
//! último los tres subtotales cache de `cuadrilla`.

use obrix_db::entities::cuadrilla_detalle::TipoCuadrillaDetalle;
use obrix_db::entities::{categoria_fasar, cuadrilla, cuadrilla_detalle, herramienta, insumo, salario_categoria_fasar};
use obrix_db::PortafolioRepository;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseTransaction, EntityTrait, QueryFilter, QueryOrder,
    TransactionTrait,
};

use crate::cuadrilla::{combinar as combinar_cuadrilla, CuadrillaCompleto};
use crate::{nuevo_id, ServiceError};

#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DireccionMovimiento {
    Arriba,
    Abajo,
}

#[derive(serde::Deserialize)]
pub struct CuadrillaDetalleData {
    pub detalle_insumo_id: String,
    /// Si el `detalle_insumo_id` resuelve a `categoria_fasar`: número de
    /// integrantes. Si resuelve a `herramienta`: porcentaje 0-100 (mismo
    /// convenio que `herramienta.porcentaje_mano_obra`), no una fracción.
    pub cantidad: Decimal,
}

pub struct CuadrillaDetalleService;

impl CuadrillaDetalleService {
    pub async fn listar_por_cuadrilla(
        repo: &dyn PortafolioRepository,
        cuadrilla_insumo_id: &str,
    ) -> Result<Vec<cuadrilla_detalle::Model>, ServiceError> {
        Ok(cuadrilla_detalle::Entity::find()
            .filter(cuadrilla_detalle::Column::CuadrillaInsumoId.eq(cuadrilla_insumo_id))
            .order_by_asc(cuadrilla_detalle::Column::Orden)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        cuadrilla_insumo_id: &str,
        datos: CuadrillaDetalleData,
        creado_por: String,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let tipo = Self::resolver_tipo(&txn, &datos.detalle_insumo_id).await?;
        Self::validar_referencia(&txn, cuadrilla_insumo_id, &datos.detalle_insumo_id).await?;
        let orden = Self::siguiente_orden(&txn, cuadrilla_insumo_id).await?;

        cuadrilla_detalle::ActiveModel {
            id: Set(nuevo_id()),
            cuadrilla_insumo_id: Set(cuadrilla_insumo_id.to_string()),
            detalle_insumo_id: Set(datos.detalle_insumo_id),
            tipo: Set(tipo),
            orden: Set(orden),
            cantidad: Set(datos.cantidad),
            costo: Set(Decimal::ZERO),
            importe: Set(Decimal::ZERO),
            created_at: Set(crate::ahora()),
            created_by: Set(creado_por),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(&txn)
        .await?;

        let resultado = Self::recalcular(&txn, cuadrilla_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Solo permite cambiar a qué insumo apunta la fila y su cantidad — el
    /// orden no es editable desde la UI (se asigna al insertar), y
    /// costo/importe siempre los deriva `recalcular`.
    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: CuadrillaDetalleData,
        actualizado_por: Option<String>,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = cuadrilla_detalle::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?;
        let cuadrilla_insumo_id = existente.cuadrilla_insumo_id.clone();

        let tipo = Self::resolver_tipo(&txn, &datos.detalle_insumo_id).await?;
        Self::validar_referencia(&txn, &cuadrilla_insumo_id, &datos.detalle_insumo_id).await?;

        let mut am: cuadrilla_detalle::ActiveModel = existente.into();
        am.detalle_insumo_id = Set(datos.detalle_insumo_id);
        am.tipo = Set(tipo);
        am.cantidad = Set(datos.cantidad);
        am.updated_at = Set(Some(crate::ahora()));
        am.updated_by = Set(actualizado_por);
        am.update(&txn).await?;

        let resultado = Self::recalcular(&txn, &cuadrilla_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = cuadrilla_detalle::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?;
        let cuadrilla_insumo_id = existente.cuadrilla_insumo_id.clone();

        cuadrilla_detalle::Entity::delete_by_id(id).exec(&txn).await?;

        let resultado = Self::recalcular(&txn, &cuadrilla_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Fuerza un recálculo manual de la cuadrilla, sin que haya cambiado su
    /// composición — trae de nueva cuenta el salario vigente de cada
    /// integrante y recompone los tres subtotales cache. Útil cuando los
    /// precios/salarios de los insumos referenciados se actualizaron después
    /// de la última alta/edición/baja de un renglón.
    pub async fn recalcular_costos(
        repo: &dyn PortafolioRepository,
        cuadrilla_insumo_id: String,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let resultado = Self::recalcular(&txn, &cuadrilla_insumo_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    /// Intercambia el `orden` de una fila con el de su vecina (dentro del
    /// mismo `tipo` — mano de obra y herramienta se ordenan por separado, ya
    /// que la ficha las muestra en tablas distintas). No hace nada si ya es
    /// la primera/última de su tabla. No dispara `recalcular`: el orden no
    /// afecta costo/importe.
    pub async fn mover(
        repo: &dyn PortafolioRepository,
        id: String,
        direccion: DireccionMovimiento,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;

        let existente = cuadrilla_detalle::Entity::find_by_id(&id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?;
        let cuadrilla_insumo_id = existente.cuadrilla_insumo_id.clone();

        let misma_tabla = cuadrilla_detalle::Entity::find()
            .filter(cuadrilla_detalle::Column::CuadrillaInsumoId.eq(&cuadrilla_insumo_id))
            .filter(cuadrilla_detalle::Column::Tipo.eq(existente.tipo.clone()))
            .order_by_asc(cuadrilla_detalle::Column::Orden)
            .all(&txn)
            .await?;

        let indice = misma_tabla
            .iter()
            .position(|d| d.id == id)
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?;
        let indice_vecino = match direccion {
            DireccionMovimiento::Arriba => indice.checked_sub(1),
            DireccionMovimiento::Abajo => (indice + 1 < misma_tabla.len()).then_some(indice + 1),
        };

        if let Some(indice_vecino) = indice_vecino {
            let vecino = &misma_tabla[indice_vecino];
            let orden_existente = existente.orden;
            let orden_vecino = vecino.orden;

            let mut am_existente: cuadrilla_detalle::ActiveModel = existente.into();
            am_existente.orden = Set(orden_vecino);
            am_existente.update(&txn).await?;

            let mut am_vecino: cuadrilla_detalle::ActiveModel = vecino.clone().into();
            am_vecino.orden = Set(orden_existente);
            am_vecino.update(&txn).await?;
        }

        let cua = cuadrilla::Entity::find_by_id(&cuadrilla_insumo_id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {cuadrilla_insumo_id}")))?;
        let ins = insumo::Entity::find_by_id(&cuadrilla_insumo_id)
            .one(&txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {cuadrilla_insumo_id}")))?;
        let resultado = combinar_cuadrilla(ins, cua);
        txn.commit().await?;
        Ok(resultado)
    }

    /// `categoria_fasar` y `herramienta` son las únicas extensiones válidas
    /// dentro de una cuadrilla — en particular, esto rechaza referenciar otra
    /// `cuadrilla` (que también es `insumo.tipo = mano_obra`, pero no tiene
    /// fila en `categoria_fasar`), preservando la composición plana no
    /// recursiva del diccionario de datos.
    async fn resolver_tipo(
        txn: &DatabaseTransaction,
        detalle_insumo_id: &str,
    ) -> Result<TipoCuadrillaDetalle, ServiceError> {
        if categoria_fasar::Entity::find_by_id(detalle_insumo_id).one(txn).await?.is_some() {
            return Ok(TipoCuadrillaDetalle::CategoriaFasar);
        }
        if herramienta::Entity::find_by_id(detalle_insumo_id).one(txn).await?.is_some() {
            return Ok(TipoCuadrillaDetalle::EquipoHerramienta);
        }
        Err(ServiceError::Validacion(format!(
            "\"{detalle_insumo_id}\" no es una categoría FASAR ni una herramienta — una cuadrilla no puede contener otra cuadrilla"
        )))
    }

    async fn validar_referencia(
        txn: &DatabaseTransaction,
        cuadrilla_insumo_id: &str,
        detalle_insumo_id: &str,
    ) -> Result<(), ServiceError> {
        if detalle_insumo_id == cuadrilla_insumo_id {
            return Err(ServiceError::Validacion(
                "una cuadrilla no puede referenciarse a sí misma".to_string(),
            ));
        }
        let cuadrilla_ins = insumo::Entity::find_by_id(cuadrilla_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {cuadrilla_insumo_id}")))?;
        let detalle_ins = insumo::Entity::find_by_id(detalle_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("insumo {detalle_insumo_id}")))?;
        if cuadrilla_ins.organizacion_id != detalle_ins.organizacion_id {
            return Err(ServiceError::Validacion(
                "el insumo debe pertenecer a la misma organización que la cuadrilla".to_string(),
            ));
        }
        Ok(())
    }

    async fn siguiente_orden(txn: &DatabaseTransaction, cuadrilla_insumo_id: &str) -> Result<i32, ServiceError> {
        let maximo = cuadrilla_detalle::Entity::find()
            .filter(cuadrilla_detalle::Column::CuadrillaInsumoId.eq(cuadrilla_insumo_id))
            .order_by_desc(cuadrilla_detalle::Column::Orden)
            .one(txn)
            .await?;
        Ok(maximo.map(|d| d.orden + 1).unwrap_or(0))
    }

    /// Corre siempre contra `txn` (nunca `repo.conexion()` directamente):
    /// como ya hay una transacción abierta sobre la única conexión del
    /// portafolio, pedir una conexión aparte (p. ej. llamando a
    /// `SalarioCategoriaFasarService::vigente_nacional(repo, ...)`) se
    /// quedaría esperando a que `txn` la libere — un candado consigo misma.
    /// Por eso el salario vigente se resuelve aquí mismo, inline.
    async fn recalcular(
        txn: &DatabaseTransaction,
        cuadrilla_insumo_id: &str,
    ) -> Result<CuadrillaCompleto, ServiceError> {
        let detalles = cuadrilla_detalle::Entity::find()
            .filter(cuadrilla_detalle::Column::CuadrillaInsumoId.eq(cuadrilla_insumo_id))
            .order_by_asc(cuadrilla_detalle::Column::Orden)
            .all(txn)
            .await?;

        let mut sub_total_mano_obra = Decimal::ZERO;
        let mut pendientes: Vec<(String, Decimal, Decimal)> = Vec::new();
        for d in detalles.iter().filter(|d| d.tipo == TipoCuadrillaDetalle::CategoriaFasar) {
            let salario = salario_categoria_fasar::Entity::find()
                .filter(salario_categoria_fasar::Column::InsumoId.eq(&d.detalle_insumo_id))
                .filter(salario_categoria_fasar::Column::RegionId.is_null())
                .filter(salario_categoria_fasar::Column::FechaVigenciaHasta.is_null())
                .order_by_desc(salario_categoria_fasar::Column::FechaVigenciaDesde)
                .one(txn)
                .await?
                .ok_or_else(|| {
                    ServiceError::Validacion(format!(
                        "\"{}\" no tiene un salario nacional vigente registrado",
                        d.detalle_insumo_id
                    ))
                })?;
            let importe = d.cantidad * salario.salario_real_diario;
            sub_total_mano_obra += importe;
            pendientes.push((d.id.clone(), salario.salario_real_diario, importe));
        }

        let mut sub_total_herramienta = Decimal::ZERO;
        for d in detalles.iter().filter(|d| d.tipo == TipoCuadrillaDetalle::EquipoHerramienta) {
            let costo = sub_total_mano_obra;
            let importe = costo * d.cantidad / Decimal::ONE_HUNDRED;
            sub_total_herramienta += importe;
            pendientes.push((d.id.clone(), costo, importe));
        }

        for (id, costo, importe) in pendientes {
            let mut am: cuadrilla_detalle::ActiveModel = cuadrilla_detalle::Entity::find_by_id(&id)
                .one(txn)
                .await?
                .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla_detalle {id}")))?
                .into();
            am.costo = Set(costo);
            am.importe = Set(importe);
            am.update(txn).await?;
        }

        let costo_total = sub_total_mano_obra + sub_total_herramienta;
        let mut cua: cuadrilla::ActiveModel = cuadrilla::Entity::find_by_id(cuadrilla_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {cuadrilla_insumo_id}")))?
            .into();
        cua.sub_total_mano_obra = Set(sub_total_mano_obra);
        cua.sub_total_herramienta = Set(sub_total_herramienta);
        cua.costo_total = Set(costo_total);
        let cua = cua.update(txn).await?;

        let ins = insumo::Entity::find_by_id(cuadrilla_insumo_id)
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("cuadrilla {cuadrilla_insumo_id}")))?;
        Ok(combinar_cuadrilla(ins, cua))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::categoria_fasar::{CategoriaFasarData, CategoriaFasarService};
    use crate::cuadrilla::{CuadrillaData, CuadrillaService};
    use crate::factor_salario_real::{FactorSalarioRealData, FactorSalarioRealService};
    use crate::herramienta::{HerramientaData, HerramientaService};
    use crate::salario_categoria_fasar::{SalarioCategoriaFasarData, SalarioCategoriaFasarService};
    use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
    use obrix_db::PortafolioSqliteRepository;
    use sea_orm::ActiveModelTrait;
    use std::path::Path;
    use std::str::FromStr;

    async fn portafolio_con_fixtures() -> PortafolioSqliteRepository {
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

        organizacion::ActiveModel {
            id: Set("org-2".into()),
            razon_social: Set("Otra org".into()),
            rfc: Set("XAXX020202000".into()),
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
            id: Set("um-jor".into()),
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

        unidad_medida::ActiveModel {
            id: Set("um-pza".into()),
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

        unidad_medida::ActiveModel {
            id: Set("um-cuad".into()),
            simbolo: Set("cuad".into()),
            simbolo_impresion: Set("cuad".into()),
            variantes: Set("".into()),
            clave_sat: Set(None),
            descripcion: Set("Cuadrilla".into()),
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

        portafolio
    }

    async fn crear_fsr_nacional(portafolio: &PortafolioSqliteRepository) -> String {
        FactorSalarioRealService::crear(
            portafolio,
            "org-1".into(),
            FactorSalarioRealData {
                nombre: "FSR nacional".into(),
                region_id: None,
                modelo_calculo_json: String::new(),
                parametros_json: String::new(),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear FSR nacional")
        .id
    }

    async fn crear_categoria_con_salario(
        portafolio: &PortafolioSqliteRepository,
        fsr_id: &str,
        clave: &str,
        descripcion: &str,
        salario_real_diario: &str,
    ) -> String {
        let categoria = CategoriaFasarService::crear(
            portafolio,
            "org-1",
            CategoriaFasarData {
                clave: clave.into(),
                descripcion: descripcion.into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria_fasar");

        SalarioCategoriaFasarService::crear(
            portafolio,
            &categoria.id,
            SalarioCategoriaFasarData {
                salario_base_diario: Decimal::from_str(salario_real_diario).unwrap(),
                factor_salario_real_id: fsr_id.to_string(),
                factor_salario_real: Decimal::ONE,
                salario_real_diario: Decimal::from_str(salario_real_diario).unwrap(),
                region_id: None,
                fecha_vigencia_desde: "2026-01-01".into(),
            },
            "usr-1".into(),
        )
        .await
        .expect("registrar salario");

        categoria.id
    }

    #[tokio::test]
    async fn agregar_integrantes_y_herramienta_calcula_los_tres_subtotales() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr_nacional(&portafolio).await;

        let oficial = crear_categoria_con_salario(&portafolio, &fsr, "CAT-1", "Oficial albañil", "700").await;
        let ayudante = crear_categoria_con_salario(&portafolio, &fsr, "CAT-2", "Ayudante", "400").await;

        let herramienta = HerramientaService::crear(
            &portafolio,
            "org-1",
            HerramientaData {
                clave: "HER-1".into(),
                descripcion: "Herramienta de mano".into(),
                unidad_id: "um-pza".into(),
                familia_id: None,
                sub_familia_id: None,
                porcentaje_mano_obra: Some(3),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear herramienta");

        let cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla de albañilería tipo A".into(),
                unidad_id: "um-cuad".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla");

        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: oficial.clone(),
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar oficial");

        let tras_ayudante = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: ayudante.clone(),
                cantidad: Decimal::from(2),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar ayudantes");
        // 1×700 + 2×400 = 1500 — todavía sin herramienta.
        assert_eq!(tras_ayudante.sub_total_mano_obra, Decimal::from(1500));
        assert_eq!(tras_ayudante.sub_total_herramienta, Decimal::ZERO);
        assert_eq!(tras_ayudante.costo_total, Decimal::from(1500));

        let detalle_herramienta = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: herramienta.id.clone(),
                cantidad: Decimal::from(3),
            },
            "usr-1".into(),
        )
        .await
        .expect("agregar herramienta");
        // 3% de 1500 = 45.
        assert_eq!(detalle_herramienta.sub_total_mano_obra, Decimal::from(1500));
        assert_eq!(detalle_herramienta.sub_total_herramienta, Decimal::from_str("45.00").unwrap());
        assert_eq!(detalle_herramienta.costo_total, Decimal::from_str("1545.00").unwrap());

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar detalles");
        assert_eq!(detalles.len(), 3);
        let fila_herramienta = detalles
            .iter()
            .find(|d| d.detalle_insumo_id == herramienta.id)
            .expect("fila de herramienta");
        assert_eq!(fila_herramienta.tipo, TipoCuadrillaDetalle::EquipoHerramienta);
        assert_eq!(fila_herramienta.costo, Decimal::from(1500), "costo de herramienta = sub_total_mano_obra");
        assert_eq!(fila_herramienta.importe, Decimal::from_str("45.00").unwrap());

        // Editar la cantidad de ayudantes recalcula todo, incluida la
        // herramienta (su costo base cambió).
        let fila_ayudante = detalles.iter().find(|d| d.detalle_insumo_id == ayudante).unwrap().clone();
        let tras_editar = CuadrillaDetalleService::actualizar(
            &portafolio,
            fila_ayudante.id,
            CuadrillaDetalleData {
                detalle_insumo_id: ayudante.clone(),
                cantidad: Decimal::from(3),
            },
            Some("usr-1".into()),
        )
        .await
        .expect("editar ayudantes");
        // 1×700 + 3×400 = 1900; herramienta = 3% de 1900 = 57.
        assert_eq!(tras_editar.sub_total_mano_obra, Decimal::from(1900));
        assert_eq!(tras_editar.sub_total_herramienta, Decimal::from_str("57.00").unwrap());
        assert_eq!(tras_editar.costo_total, Decimal::from_str("1957.00").unwrap());

        // Borrar la herramienta deja el costo total igual al de mano de obra.
        let tras_borrar = CuadrillaDetalleService::eliminar(&portafolio, fila_herramienta.id.clone())
            .await
            .expect("borrar herramienta");
        assert_eq!(tras_borrar.sub_total_herramienta, Decimal::ZERO);
        assert_eq!(tras_borrar.costo_total, tras_borrar.sub_total_mano_obra);
    }

    #[tokio::test]
    async fn mover_intercambia_orden_con_el_vecino_dentro_del_mismo_tipo() {
        let portafolio = portafolio_con_fixtures().await;
        let fsr = crear_fsr_nacional(&portafolio).await;

        let oficial = crear_categoria_con_salario(&portafolio, &fsr, "CAT-1", "Oficial albañil", "700").await;
        let ayudante = crear_categoria_con_salario(&portafolio, &fsr, "CAT-2", "Ayudante", "400").await;

        let herramienta = HerramientaService::crear(
            &portafolio,
            "org-1",
            HerramientaData {
                clave: "HER-1".into(),
                descripcion: "Herramienta de mano".into(),
                unidad_id: "um-pza".into(),
                familia_id: None,
                sub_familia_id: None,
                porcentaje_mano_obra: Some(3),
            },
            "usr-1".into(),
        )
        .await
        .expect("crear herramienta");

        let cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla de albañilería tipo A".into(),
                unidad_id: "um-cuad".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla");

        // Orden de alta: oficial (0), ayudante (1), herramienta (0 — su
        // propio tipo cuenta aparte).
        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData { detalle_insumo_id: oficial.clone(), cantidad: Decimal::ONE },
            "usr-1".into(),
        )
        .await
        .expect("agregar oficial");
        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData { detalle_insumo_id: ayudante.clone(), cantidad: Decimal::from(2) },
            "usr-1".into(),
        )
        .await
        .expect("agregar ayudante");
        CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData { detalle_insumo_id: herramienta.id.clone(), cantidad: Decimal::from(3) },
            "usr-1".into(),
        )
        .await
        .expect("agregar herramienta");

        let antes = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar antes");
        let fila_ayudante = antes.iter().find(|d| d.detalle_insumo_id == ayudante).unwrap().clone();

        // Subir al ayudante (segundo integrante) lo pone antes que el oficial.
        CuadrillaDetalleService::mover(&portafolio, fila_ayudante.id.clone(), DireccionMovimiento::Arriba)
            .await
            .expect("mover ayudante hacia arriba");

        let despues = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar despues");
        let integrantes: Vec<&str> =
            despues.iter().filter(|d| d.tipo == TipoCuadrillaDetalle::CategoriaFasar).map(|d| d.detalle_insumo_id.as_str()).collect();
        assert_eq!(integrantes, vec![ayudante.as_str(), oficial.as_str()], "el ayudante debe quedar primero");

        // La herramienta (única en su tipo) no se mueve: ya es primera y última.
        let fila_herramienta = despues.iter().find(|d| d.detalle_insumo_id == herramienta.id).unwrap().clone();
        let orden_herramienta_antes = fila_herramienta.orden;
        CuadrillaDetalleService::mover(&portafolio, fila_herramienta.id.clone(), DireccionMovimiento::Arriba)
            .await
            .expect("mover herramienta sin vecinos no debe fallar");
        let herramienta_tras_intento = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar tras intento")
            .into_iter()
            .find(|d| d.detalle_insumo_id == herramienta.id)
            .unwrap();
        assert_eq!(herramienta_tras_intento.orden, orden_herramienta_antes, "sin vecino, el orden no cambia");
    }

    #[tokio::test]
    async fn rechaza_referenciar_otra_cuadrilla() {
        let portafolio = portafolio_con_fixtures().await;

        let cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla A".into(),
                unidad_id: "um-cuad".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla A");

        let otra_cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-2".into(),
                descripcion: "Cuadrilla B".into(),
                unidad_id: "um-cuad".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla B");

        let err = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: otra_cuadrilla.id,
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir anidar cuadrillas");
        match err {
            ServiceError::Validacion(mensaje) => {
                assert!(mensaje.contains("no puede contener otra cuadrilla"), "mensaje inesperado: {mensaje}");
            }
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar detalles");
        assert!(detalles.is_empty(), "no debe quedar una fila a medias tras el rechazo");
    }

    #[tokio::test]
    async fn rechaza_insumo_de_otra_organizacion() {
        let portafolio = portafolio_con_fixtures().await;

        let cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla A".into(),
                unidad_id: "um-cuad".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla");

        let categoria_ajena = CategoriaFasarService::crear(
            &portafolio,
            "org-2",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial de otra org".into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria de otra organizacion");

        let err = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: categoria_ajena.id,
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir mezclar organizaciones");
        match err {
            ServiceError::Validacion(mensaje) => {
                assert!(mensaje.contains("misma organización"), "mensaje inesperado: {mensaje}");
            }
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }
    }

    #[tokio::test]
    async fn falla_y_no_deja_fila_a_medias_si_falta_salario_vigente() {
        let portafolio = portafolio_con_fixtures().await;

        let sin_salario = CategoriaFasarService::crear(
            &portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Sin salario registrado".into(),
                unidad_id: "um-jor".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria sin salario");

        let cuadrilla = CuadrillaService::crear(
            &portafolio,
            "org-1",
            CuadrillaData {
                clave: "CUA-1".into(),
                descripcion: "Cuadrilla A".into(),
                unidad_id: "um-cuad".into(),
                familia_id: None,
                sub_familia_id: None,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear cuadrilla");

        let err = CuadrillaDetalleService::crear(
            &portafolio,
            &cuadrilla.id,
            CuadrillaDetalleData {
                detalle_insumo_id: sin_salario.id,
                cantidad: Decimal::ONE,
            },
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir agregar un integrante sin salario vigente");
        match err {
            ServiceError::Validacion(mensaje) => {
                assert!(mensaje.contains("salario nacional vigente"), "mensaje inesperado: {mensaje}");
            }
            otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
        }

        let detalles = CuadrillaDetalleService::listar_por_cuadrilla(&portafolio, &cuadrilla.id)
            .await
            .expect("listar detalles");
        assert!(
            detalles.is_empty(),
            "la transacción debe revertirse por completo, sin dejar la fila insertada"
        );
    }
}
