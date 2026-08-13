use obrix_db::entities::factor_salario_real::{ActiveModel, Column, Entity, Model};
use obrix_db::entities::region;
use obrix_db::PortafolioRepository;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder};

use crate::organizacion::OrganizacionService;
use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

/// Modelo de cálculo estándar (FSR, Art. 160 RLOPSRM) con el que se siembra un
/// renglón nuevo cuando no se especifica uno propio — fuente de verdad en
/// `data/modelo-calculo-fasar.json`, embebido tal cual en el binario.
const MODELO_ESTANDAR_VARIABLES_JSON: &str = include_str!("../../../data/modelo-calculo-fasar.json");

/// Valores `valor_default` de los parámetros `numero`/`booleano` de un
/// modelo de cálculo, como `parametros_json` inicial de un renglón nuevo
/// cuando no se especifica ninguno. Los `rango` se excluyen — ver
/// diccionario de datos: su valor siempre sale del modelo, nunca de
/// `parametros_json`. Si el modelo no parsea (no debería pasar), cae a
/// `"{}"` sin fallar la creación del renglón.
fn parametros_json_default(modelo_calculo_json: &str) -> String {
    let Ok(modelo) = serde_json::from_str::<serde_json::Value>(modelo_calculo_json) else {
        return "{}".to_string();
    };
    let Some(parametros) = modelo.get("parametros").and_then(serde_json::Value::as_array) else {
        return "{}".to_string();
    };
    let mut valores = serde_json::Map::new();
    for p in parametros {
        if p.get("tipo").and_then(serde_json::Value::as_str) == Some("rango") {
            continue;
        }
        if let (Some(id), Some(valor_default)) =
            (p.get("id").and_then(serde_json::Value::as_str), p.get("valor_default"))
        {
            valores.insert(id.to_string(), valor_default.clone());
        }
    }
    serde_json::Value::Object(valores).to_string()
}

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
}

pub struct FactorSalarioRealService;

impl FactorSalarioRealService {
    /// Validación de `FactorSalarioRealData` común a `crear`/`actualizar` —
    /// `actualizando` distingue alta de edición por si una regla futura solo
    /// aplica a uno de los dos casos.
    fn validar(datos: &FactorSalarioRealData, actualizando: bool) -> Result<(), ServiceError> {
        if datos.nombre.trim().is_empty() {
            let accion = if actualizando { "actualizar" } else { "crear" };
            return Err(ServiceError::Validacion(format!("No se puede {accion} un FSR sin nombre.")));
        }
        Ok(())
    }

    pub async fn listar(repo: &dyn PortafolioRepository, organizacion_id: &str) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::OrganizacionId.eq(organizacion_id))
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
        Self::validar(&datos, false)?;
        let modelo_calculo_json = if datos.modelo_calculo_json.trim().is_empty() {
            MODELO_ESTANDAR_VARIABLES_JSON.to_string()
        } else {
            datos.modelo_calculo_json
        };
        let parametros_json = if datos.parametros_json.trim().is_empty() {
            parametros_json_default(&modelo_calculo_json)
        } else {
            datos.parametros_json
        };
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            organizacion_id: Set(organizacion_id),
            nombre: Set(datos.nombre),
            region_id: Set(datos.region_id),
            modelo_calculo_json: Set(modelo_calculo_json),
            parametros_json: Set(parametros_json),
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
        Self::validar(&datos, true)?;
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("FSR {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.region_id = Set(datos.region_id);
        modelo.modelo_calculo_json = Set(datos.modelo_calculo_json);
        modelo.parametros_json = Set(datos.parametros_json);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(Some(actualizado_por));
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for FactorSalarioRealService {
    /// Un FSR nacional (`region_id` nulo) primero, y luego uno por cada
    /// región ya sembrada (ver `RegionService::sembrar`) — con el modelo de
    /// cálculo estándar y sus parámetros en los valores default que declara
    /// ese modelo (ver `parametros_json_default`); el usuario los ajusta
    /// desde "Calcular FSR" a los del ejercicio real.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let organizacion = OrganizacionService::buscar_admin_obrix(repo).await?;
        Self::crear(
            repo,
            organizacion.id.clone(),
            FactorSalarioRealData {
                nombre: "FSR — Nacional".to_string(),
                region_id: None,
                modelo_calculo_json: String::new(),
                parametros_json: String::new(),
            },
            admin.id.clone(),
        )
        .await?;
        let regiones = region::Entity::find().all(repo.conexion()).await?;
        for r in regiones {
            Self::crear(
                repo,
                organizacion.id.clone(),
                FactorSalarioRealData {
                    nombre: format!("FSR — {}", r.nombre),
                    region_id: Some(r.id),
                    modelo_calculo_json: String::new(),
                    parametros_json: String::new(),
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parametros_json_default_usa_valor_default_y_excluye_rango() {
        let modelo = r#"{
            "parametros": [
                {"id": "a", "tipo": "numero", "valor_default": 5},
                {"id": "b", "tipo": "booleano", "valor_default": true},
                {"id": "c", "tipo": "rango", "valor_default": [{"clasificacion": "", "inferior": 0, "superior": null, "valor": 1}]}
            ],
            "calculados": []
        }"#;
        let resultado: serde_json::Value = serde_json::from_str(&parametros_json_default(modelo)).unwrap();
        assert_eq!(resultado["a"], 5);
        assert_eq!(resultado["b"], true);
        assert!(resultado.get("c").is_none(), "los parámetros tipo rango no deben incluirse");
    }

    #[test]
    fn parametros_json_default_funciona_con_el_modelo_estandar_real() {
        let resultado: serde_json::Value =
            serde_json::from_str(&parametros_json_default(MODELO_ESTANDAR_VARIABLES_JSON)).unwrap();
        assert_eq!(resultado["salario_minimo"], 248.93);
        assert!(
            resultado.get("tasa_cesantia_vejez").is_none(),
            "tasa_cesantia_vejez es tipo rango, no debe quedar en parametros_json"
        );
    }

    #[test]
    fn parametros_json_default_con_modelo_invalido_cae_a_objeto_vacio() {
        assert_eq!(parametros_json_default("no es json"), "{}");
    }

    fn datos_con_nombre(nombre: &str) -> FactorSalarioRealData {
        FactorSalarioRealData {
            nombre: nombre.to_string(),
            region_id: None,
            modelo_calculo_json: String::new(),
            parametros_json: String::new(),
        }
    }

    #[test]
    fn validar_rechaza_nombre_vacio_o_solo_espacios() {
        assert!(FactorSalarioRealService::validar(&datos_con_nombre(""), false).is_err());
        assert!(FactorSalarioRealService::validar(&datos_con_nombre("   "), true).is_err());
    }

    #[test]
    fn validar_acepta_nombre_no_vacio() {
        assert!(FactorSalarioRealService::validar(&datos_con_nombre("FSR — Norte"), false).is_ok());
    }
}
