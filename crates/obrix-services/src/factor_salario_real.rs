use obrix_db::entities::factor_salario_real::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait, QueryOrder};

use crate::{nuevo_id, ServiceError};

/// Modelo de cálculo estándar (FSR, Art. 160 RLOPSRM) con el que se siembra un
/// renglón nuevo cuando no se especifica uno propio — fuente de verdad en
/// `data/modelo-calculo-fasar.json`, embebido tal cual en el binario.
const MODELO_ESTANDAR_VARIABLES_JSON: &str = include_str!("../../../data/modelo-calculo-fasar.json");

#[derive(serde::Deserialize)]
pub struct FactorSalarioRealData {
    pub nombre: String,
    pub region_id: Option<String>,
    /// `VariableCalculo[]` serializado — CÓMO se calcula. Si viene vacío al
    /// crear, se usa el modelo estándar.
    pub modelo_calculo_json: String,
    /// Valores de las variables de entrada que ese modelo declara — ver
    /// `apps/desktop/src/lib/modeloCalculo.ts`.
    pub parametros_json: String,
    pub vigencia_desde: String,
    pub vigencia_hasta: Option<String>,
}

pub struct FactorSalarioRealService;

impl FactorSalarioRealService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .order_by_asc(Column::Nombre)
            .all(repo.conexion())
            .await?)
    }

    pub async fn obtener(repo: &dyn PortafolioRepository, id: String) -> Result<Model, ServiceError> {
        Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("FSR {id}")))
    }

    /// Renglón nuevo — si no se especifica `modelo_calculo_json`, se usa el
    /// modelo de cálculo estándar con sus valores por default.
    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: String,
        datos: FactorSalarioRealData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            organizacion_id: Set(organizacion_id),
            nombre: Set(datos.nombre),
            region_id: Set(datos.region_id),
            modelo_calculo_json: Set(if datos.modelo_calculo_json.trim().is_empty() {
                MODELO_ESTANDAR_VARIABLES_JSON.to_string()
            } else {
                datos.modelo_calculo_json
            }),
            parametros_json: Set(if datos.parametros_json.trim().is_empty() {
                "{}".to_string()
            } else {
                datos.parametros_json
            }),
            vigencia_desde: Set(datos.vigencia_desde),
            vigencia_hasta: Set(datos.vigencia_hasta),
            created_at: Set(crate::ahora()),
            updated_at: Set(None),
            created_by: Set(creado_por),
            updated_by: Set(None),
        };
        Ok(modelo.insert(repo.conexion()).await?)
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: FactorSalarioRealData,
        actualizado_por: String,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("FSR {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.region_id = Set(datos.region_id);
        modelo.modelo_calculo_json = Set(datos.modelo_calculo_json);
        modelo.parametros_json = Set(datos.parametros_json);
        modelo.vigencia_desde = Set(datos.vigencia_desde);
        modelo.vigencia_hasta = Set(datos.vigencia_hasta);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(Some(actualizado_por));
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}
