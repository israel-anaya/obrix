//! Receta de primer nivel de un `basico_auxiliar`. `cantidad` no vive aquí:
//! al crear el renglón se copia a todos los `basico_auxiliar_costo_detalle`;
//! editarla después es por valuación.

use obrix_db::PortafolioRepository;
use obrix_db::entities::basico_auxiliar_componente::{
    NaturalezaBasicoAuxiliarComponente, TipoBasicoAuxiliarComponente,
};
use obrix_db::entities::{
    basico_auxiliar, basico_auxiliar_componente, basico_auxiliar_costo_detalle, categoria_fasar,
    cuadrilla, equipo_costo_horario, insumo, material,
};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseTransaction, EntityTrait, QueryFilter,
    QueryOrder, TransactionTrait,
};
use std::collections::HashSet;

use crate::basico_auxiliar::{BasicoAuxiliarCompleto, BasicoAuxiliarService};
use crate::basico_auxiliar_costo::BasicoAuxiliarCostoService;
use crate::{ServiceError, nuevo_id};

#[derive(serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DireccionMovimiento {
    Arriba,
    Abajo,
}

#[derive(serde::Deserialize)]
pub struct BasicoAuxiliarComponenteData {
    pub componente_insumo_id: String,
    pub cantidad: Decimal,
    #[serde(default)]
    pub naturaleza: Option<NaturalezaBasicoAuxiliarComponente>,
}

#[derive(serde::Deserialize)]
pub struct BasicoAuxiliarComponenteEditarData {
    pub componente_insumo_id: String,
    #[serde(default)]
    pub naturaleza: Option<NaturalezaBasicoAuxiliarComponente>,
}

pub struct BasicoAuxiliarComponenteService;

impl BasicoAuxiliarComponenteService {
    pub async fn listar_por_auxiliar(
        repo: &dyn PortafolioRepository,
        basico_auxiliar_id: &str,
    ) -> Result<Vec<basico_auxiliar_componente::Model>, ServiceError> {
        Ok(basico_auxiliar_componente::Entity::find()
            .filter(basico_auxiliar_componente::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_componente::Column::Deleted.eq(false))
            .order_by_asc(basico_auxiliar_componente::Column::Orden)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        basico_auxiliar_id: &str,
        datos: BasicoAuxiliarComponenteData,
        creado_por: String,
    ) -> Result<BasicoAuxiliarCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let (tipo, derivada) = Self::clasificar(&txn, &datos.componente_insumo_id).await?;
        let naturaleza = Self::resolver_naturaleza(tipo.clone(), derivada, datos.naturaleza)?;
        Self::validar_referencia(&txn, basico_auxiliar_id, &datos.componente_insumo_id, None).await?;
        if tipo == TipoBasicoAuxiliarComponente::BasicoAuxiliar
            && Self::forma_ciclo(&txn, basico_auxiliar_id, &datos.componente_insumo_id).await?
        {
            return Err(ServiceError::Validacion(
                "un básico auxiliar no puede contenerse a sí mismo, ni directa ni transitivamente"
                    .into(),
            ));
        }
        let orden = Self::siguiente_orden(&txn, basico_auxiliar_id).await?;
        let ahora = crate::ahora();
        let valuaciones =
            BasicoAuxiliarCostoService::asegurar_zonas(&txn, basico_auxiliar_id, &creado_por)
                .await?;

        let nuevo = basico_auxiliar_componente::ActiveModel {
            id: Set(nuevo_id()),
            basico_auxiliar_id: Set(basico_auxiliar_id.to_string()),
            componente_insumo_id: Set(datos.componente_insumo_id),
            tipo: Set(tipo),
            naturaleza: Set(naturaleza),
            orden: Set(orden),
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

        for v in &valuaciones {
            basico_auxiliar_costo_detalle::ActiveModel {
                id: Set(nuevo_id()),
                basico_auxiliar_costo_id: Set(v.id.clone()),
                basico_auxiliar_componente_id: Set(nuevo.id.clone()),
                cantidad: Set(datos.cantidad),
                rendimiento: Set(crate::basico_auxiliar_costo_detalle::invertir(datos.cantidad)),
                costo: Set(Decimal::ZERO),
                importe: Set(Decimal::ZERO),
                fecha_precio: Set(None),
                usa_costo_nacional: Set(false),
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
        }
        for v in &valuaciones {
            BasicoAuxiliarCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }
        let resultado = BasicoAuxiliarService::cargar_completo(&txn, basico_auxiliar_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: BasicoAuxiliarComponenteEditarData,
        actualizado_por: Option<String>,
    ) -> Result<BasicoAuxiliarCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let existente = basico_auxiliar_componente::Entity::find_by_id(&id)
            .filter(basico_auxiliar_componente::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("basico_auxiliar_componente {id}"))
            })?;
        let basico_auxiliar_id = existente.basico_auxiliar_id.clone();
        let autor = actualizado_por
            .clone()
            .unwrap_or_else(|| existente.created_by.clone());

        let (tipo, derivada) = Self::clasificar(&txn, &datos.componente_insumo_id).await?;
        let naturaleza = Self::resolver_naturaleza(tipo.clone(), derivada, datos.naturaleza)?;
        Self::validar_referencia(
            &txn,
            &basico_auxiliar_id,
            &datos.componente_insumo_id,
            Some(&id),
        )
        .await?;
        if tipo == TipoBasicoAuxiliarComponente::BasicoAuxiliar
            && Self::forma_ciclo(&txn, &basico_auxiliar_id, &datos.componente_insumo_id).await?
        {
            return Err(ServiceError::Validacion(
                "un básico auxiliar no puede contenerse a sí mismo, ni directa ni transitivamente"
                    .into(),
            ));
        }

        let mut am: basico_auxiliar_componente::ActiveModel = existente.into();
        am.componente_insumo_id = Set(datos.componente_insumo_id);
        am.tipo = Set(tipo);
        am.naturaleza = Set(naturaleza);
        am.updated_at = Set(Some(crate::ahora()));
        am.updated_by = Set(actualizado_por);
        am.update(&txn).await?;

        let valuaciones =
            BasicoAuxiliarCostoService::asegurar_zonas(&txn, &basico_auxiliar_id, &autor).await?;
        for v in &valuaciones {
            BasicoAuxiliarCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }
        let resultado = BasicoAuxiliarService::cargar_completo(&txn, &basico_auxiliar_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<BasicoAuxiliarCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let existente = basico_auxiliar_componente::Entity::find_by_id(&id)
            .filter(basico_auxiliar_componente::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("basico_auxiliar_componente {id}"))
            })?;
        let basico_auxiliar_id = existente.basico_auxiliar_id.clone();
        let ahora = crate::ahora();

        let detalles = basico_auxiliar_costo_detalle::Entity::find()
            .filter(basico_auxiliar_costo_detalle::Column::BasicoAuxiliarComponenteId.eq(&id))
            .filter(basico_auxiliar_costo_detalle::Column::Deleted.eq(false))
            .all(&txn)
            .await?;
        for d in detalles {
            let mut am: basico_auxiliar_costo_detalle::ActiveModel = d.into();
            am.deleted = Set(true);
            am.deleted_at = Set(Some(ahora.clone()));
            am.deleted_by = Set(Some(eliminado_por.clone()));
            am.update(&txn).await?;
        }

        let mut am: basico_auxiliar_componente::ActiveModel = existente.into();
        am.deleted = Set(true);
        am.deleted_at = Set(Some(ahora));
        am.deleted_by = Set(Some(eliminado_por.clone()));
        am.update(&txn).await?;

        let valuaciones =
            BasicoAuxiliarCostoService::asegurar_zonas(&txn, &basico_auxiliar_id, &eliminado_por)
                .await?;
        for v in &valuaciones {
            BasicoAuxiliarCostoService::recalcular_valuacion(&txn, &v.id).await?;
        }
        let resultado = BasicoAuxiliarService::cargar_completo(&txn, &basico_auxiliar_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    pub async fn mover(
        repo: &dyn PortafolioRepository,
        id: String,
        direccion: DireccionMovimiento,
    ) -> Result<BasicoAuxiliarCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let existente = basico_auxiliar_componente::Entity::find_by_id(&id)
            .filter(basico_auxiliar_componente::Column::Deleted.eq(false))
            .one(&txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("basico_auxiliar_componente {id}"))
            })?;
        let basico_auxiliar_id = existente.basico_auxiliar_id.clone();
        let hermanos = basico_auxiliar_componente::Entity::find()
            .filter(basico_auxiliar_componente::Column::BasicoAuxiliarId.eq(&basico_auxiliar_id))
            .filter(basico_auxiliar_componente::Column::Deleted.eq(false))
            .order_by_asc(basico_auxiliar_componente::Column::Orden)
            .all(&txn)
            .await?;
        let pos = hermanos.iter().position(|h| h.id == id).ok_or_else(|| {
            ServiceError::NoEncontrado(format!("basico_auxiliar_componente {id}"))
        })?;
        let vecino_pos = match direccion {
            DireccionMovimiento::Arriba if pos > 0 => pos - 1,
            DireccionMovimiento::Abajo if pos + 1 < hermanos.len() => pos + 1,
            _ => {
                let resultado =
                    BasicoAuxiliarService::cargar_completo(&txn, &basico_auxiliar_id).await?;
                txn.commit().await?;
                return Ok(resultado);
            }
        };
        let orden_existente = existente.orden;
        let orden_vecino = hermanos[vecino_pos].orden;
        let mut am_existente: basico_auxiliar_componente::ActiveModel = existente.into();
        am_existente.orden = Set(orden_vecino);
        am_existente.update(&txn).await?;
        let mut am_vecino: basico_auxiliar_componente::ActiveModel =
            hermanos[vecino_pos].clone().into();
        am_vecino.orden = Set(orden_existente);
        am_vecino.update(&txn).await?;
        let resultado = BasicoAuxiliarService::cargar_completo(&txn, &basico_auxiliar_id).await?;
        txn.commit().await?;
        Ok(resultado)
    }

    async fn clasificar(
        txn: &DatabaseTransaction,
        componente_insumo_id: &str,
    ) -> Result<
        (
            TipoBasicoAuxiliarComponente,
            NaturalezaBasicoAuxiliarComponente,
        ),
        ServiceError,
    > {
        if material::Entity::find_by_id(componente_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok((
                TipoBasicoAuxiliarComponente::Material,
                NaturalezaBasicoAuxiliarComponente::Material,
            ));
        }
        if categoria_fasar::Entity::find_by_id(componente_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok((
                TipoBasicoAuxiliarComponente::ManoObra,
                NaturalezaBasicoAuxiliarComponente::Categoria,
            ));
        }
        if cuadrilla::Entity::find_by_id(componente_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok((
                TipoBasicoAuxiliarComponente::ManoObra,
                NaturalezaBasicoAuxiliarComponente::Cuadrilla,
            ));
        }
        if equipo_costo_horario::Entity::find_by_id(componente_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok((
                TipoBasicoAuxiliarComponente::EquipoHerramienta,
                NaturalezaBasicoAuxiliarComponente::CostoHorario,
            ));
        }
        if basico_auxiliar::Entity::find_by_id(componente_insumo_id)
            .one(txn)
            .await?
            .is_some()
        {
            return Ok((
                TipoBasicoAuxiliarComponente::BasicoAuxiliar,
                NaturalezaBasicoAuxiliarComponente::BasicoAuxiliar,
            ));
        }
        Err(ServiceError::Validacion(format!(
            "\"{componente_insumo_id}\" no es un material, categoría FASAR, cuadrilla, equipo de costo horario ni básico auxiliar"
        )))
    }

    fn resolver_naturaleza(
        tipo: TipoBasicoAuxiliarComponente,
        derivada: NaturalezaBasicoAuxiliarComponente,
        propuesta: Option<NaturalezaBasicoAuxiliarComponente>,
    ) -> Result<NaturalezaBasicoAuxiliarComponente, ServiceError> {
        if let Some(propuesta) = propuesta {
            if propuesta != derivada {
                return Err(ServiceError::Validacion(
                    "la naturaleza la define la extensión del insumo; no se puede capturar otra"
                        .into(),
                ));
            }
        }
        if !derivada.valida_para(&tipo) {
            return Err(ServiceError::Validacion(
                "naturaleza incompatible con el tipo del componente".into(),
            ));
        }
        Ok(derivada)
    }

    async fn validar_referencia(
        txn: &DatabaseTransaction,
        basico_auxiliar_id: &str,
        componente_insumo_id: &str,
        excepto_id: Option<&str>,
    ) -> Result<(), ServiceError> {
        if componente_insumo_id == basico_auxiliar_id {
            return Err(ServiceError::Validacion(
                "un básico auxiliar no puede referenciarse a sí mismo".into(),
            ));
        }
        let padre = insumo::Entity::find_by_id(basico_auxiliar_id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(txn)
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("basico_auxiliar {basico_auxiliar_id}"))
            })?;
        let hijo = insumo::Entity::find_by_id(componente_insumo_id)
            .filter(insumo::Column::Deleted.eq(false))
            .one(txn)
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("insumo {componente_insumo_id}")))?;
        if padre.organizacion_id != hijo.organizacion_id {
            return Err(ServiceError::Validacion(
                "el componente debe pertenecer a la misma organización".into(),
            ));
        }
        let mut consulta = basico_auxiliar_componente::Entity::find()
            .filter(basico_auxiliar_componente::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_componente::Column::ComponenteInsumoId.eq(componente_insumo_id))
            .filter(basico_auxiliar_componente::Column::Deleted.eq(false));
        if let Some(excepto_id) = excepto_id {
            consulta = consulta.filter(basico_auxiliar_componente::Column::Id.ne(excepto_id));
        }
        if consulta.one(txn).await?.is_some() {
            return Err(ServiceError::Validacion(
                "ese insumo ya está en la receta".into(),
            ));
        }
        Ok(())
    }

    async fn forma_ciclo(
        txn: &DatabaseTransaction,
        padre_id: &str,
        candidato_id: &str,
    ) -> Result<bool, ServiceError> {
        if padre_id == candidato_id {
            return Ok(true);
        }
        let mut pila = vec![candidato_id.to_string()];
        let mut vistos = HashSet::new();
        while let Some(id) = pila.pop() {
            if id == padre_id {
                return Ok(true);
            }
            if !vistos.insert(id.clone()) {
                continue;
            }
            let hijos = basico_auxiliar_componente::Entity::find()
                .filter(basico_auxiliar_componente::Column::BasicoAuxiliarId.eq(&id))
                .filter(basico_auxiliar_componente::Column::Deleted.eq(false))
                .filter(
                    basico_auxiliar_componente::Column::Tipo
                        .eq(TipoBasicoAuxiliarComponente::BasicoAuxiliar),
                )
                .all(txn)
                .await?;
            for h in hijos {
                pila.push(h.componente_insumo_id);
            }
        }
        Ok(false)
    }

    async fn siguiente_orden(
        txn: &DatabaseTransaction,
        basico_auxiliar_id: &str,
    ) -> Result<i32, ServiceError> {
        let max = basico_auxiliar_componente::Entity::find()
            .filter(basico_auxiliar_componente::Column::BasicoAuxiliarId.eq(basico_auxiliar_id))
            .filter(basico_auxiliar_componente::Column::Deleted.eq(false))
            .order_by_desc(basico_auxiliar_componente::Column::Orden)
            .one(txn)
            .await?
            .map(|c| c.orden)
            .unwrap_or(-1);
        Ok(max + 1)
    }
}
