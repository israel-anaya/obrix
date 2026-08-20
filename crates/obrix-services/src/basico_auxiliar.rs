//! `basico_auxiliar` es una extensión 1:1 de `insumo` — este servicio
//! administra ambas tablas juntas. La receta de primer nivel vive en
//! `basico_auxiliar_componente`; la valuación por región, en
//! `basico_auxiliar_costo`. `costo_nacional` es un reflejo de conveniencia.

use obrix_db::PortafolioRepository;
use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{basico_auxiliar, basico_auxiliar_costo};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseTransaction, EntityTrait,
    QueryFilter, TransactionTrait,
};

use crate::{ServiceError, nuevo_id};

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
