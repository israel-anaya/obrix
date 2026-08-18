use obrix_db::PortafolioRepository;
use obrix_db::entities::factor_salario_real::{ActiveModel, Column, Entity, Model};
use obrix_db::entities::region;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};

use crate::organizacion::OrganizacionService;
use crate::usuario::UsuarioService;
use crate::{DatosIniciales, ServiceError, nuevo_id};

/// Modelo de cálculo estándar (FSR, Art. 160 RLOPSRM) con el que se siembra un
/// renglón nuevo cuando no se especifica uno propio — fuente de verdad en
/// `data/initial/factor_salario_real.json`, embebido tal cual en el binario.
const MODELO_ESTANDAR_VARIABLES_JSON: &str =
    include_str!("../../../data/initial/factor_salario_real.json");

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
    let Some(parametros) = modelo
        .get("parametros")
        .and_then(serde_json::Value::as_array)
    else {
        return "{}".to_string();
    };
    let mut valores = serde_json::Map::new();
    for p in parametros {
        if p.get("tipo").and_then(serde_json::Value::as_str) == Some("rango") {
            continue;
        }
        if let (Some(id), Some(valor_default)) = (
            p.get("id").and_then(serde_json::Value::as_str),
            p.get("valor_default"),
        ) {
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
            let accion = crate::accion(actualizando);
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} un FSR sin nombre."
            )));
        }
        if let Some(region_id) = &datos.region_id {
            if region_id.trim().is_empty() {
                return Err(ServiceError::Validacion(
                    "region_id no puede ser una cadena vacía; usa null para un FSR nacional."
                        .to_string(),
                ));
            }
        }
        Ok(())
    }

    /// Un `region_id` (incluyendo `None` = nacional) solo puede tener un FSR
    /// activo por organización — `excluir_id` deja pasar al propio renglón
    /// al actualizar sin tocar su región.
    async fn validar_region_unica(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        region_id: &Option<String>,
        excluir_id: Option<&str>,
    ) -> Result<(), ServiceError> {
        let mut query = Entity::find()
            .filter(Column::OrganizacionId.eq(organizacion_id))
            .filter(Column::Deleted.eq(false));
        query = match region_id {
            Some(id) => query.filter(Column::RegionId.eq(id.clone())),
            None => query.filter(Column::RegionId.is_null()),
        };
        if let Some(id) = excluir_id {
            query = query.filter(Column::Id.ne(id));
        }
        if query.one(repo.conexion()).await?.is_some() {
            return Err(ServiceError::Validacion(
                "ya existe un FSR para esa región.".to_string(),
            ));
        }
        Ok(())
    }

    pub async fn listar(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::OrganizacionId.eq(organizacion_id))
            .filter(Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    pub async fn obtener(
        repo: &dyn PortafolioRepository,
        id: String,
    ) -> Result<Model, ServiceError> {
        Entity::find_by_id(&id)
            .filter(Column::Deleted.eq(false))
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
        crate::validar_region_existe(repo, &datos.region_id).await?;
        Self::validar_region_unica(repo, &organizacion_id, &datos.region_id, None).await?;
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
            deleted: Set(false),
            created_at: Set(crate::ahora()),
            created_by: Set(creado_por),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
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
        crate::validar_region_existe(repo, &datos.region_id).await?;
        let existente = Entity::find_by_id(&id)
            .filter(Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("FSR {id}")))?;
        Self::validar_region_unica(
            repo,
            &existente.organizacion_id,
            &datos.region_id,
            Some(&id),
        )
        .await?;
        let mut modelo: ActiveModel = existente.into();
        modelo.nombre = Set(datos.nombre);
        modelo.region_id = Set(datos.region_id);
        modelo.modelo_calculo_json = Set(datos.modelo_calculo_json);
        modelo.parametros_json = Set(datos.parametros_json);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(Some(actualizado_por));
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(
        repo: &dyn PortafolioRepository,
        id: String,
        eliminado_por: String,
    ) -> Result<(), ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .filter(Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("FSR {id}")))?
            .into();
        modelo.deleted = Set(true);
        modelo.deleted_at = Set(Some(crate::ahora()));
        modelo.deleted_by = Set(Some(eliminado_por));
        modelo.update(repo.conexion()).await?;
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
        let regiones = region::Entity::find()
            .filter(region::Column::OrganizacionId.eq(&organizacion.id))
            .filter(region::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?;
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
    use rust_decimal::Decimal;

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
        let resultado: serde_json::Value =
            serde_json::from_str(&parametros_json_default(modelo)).unwrap();
        assert_eq!(resultado["a"], 5);
        assert_eq!(resultado["b"], true);
        assert!(
            resultado.get("c").is_none(),
            "los parámetros tipo rango no deben incluirse"
        );
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

    #[test]
    fn validar_rechaza_region_id_vacio() {
        let mut datos = datos_con_nombre("FSR — Norte");
        datos.region_id = Some(String::new());
        assert!(FactorSalarioRealService::validar(&datos, false).is_err());
    }

    #[test]
    fn validar_acepta_region_id_nulo() {
        let datos = datos_con_nombre("FSR — Nacional");
        assert!(FactorSalarioRealService::validar(&datos, false).is_ok());
    }

    async fn portafolio_con_region() -> (obrix_db::PortafolioSqliteRepository, String) {
        use obrix_db::PortafolioSqliteRepository;
        use obrix_db::entities::{moneda, organizacion, region, usuario};
        use sea_orm::ActiveModelTrait;
        use std::path::Path;

        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set("admin@obrix.local".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(crate::ahora()),
            created_by: Set(None),
            updated_at: Set(None),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .expect("crear usuario");
        moneda::ActiveModel {
            id: Set("mon-1".into()),
            codigo: Set("MXN".into()),
            nombre: Set("Peso mexicano".into()),
            simbolo: Set("$".into()),
            decimales: Set(2),
            created_at: Set(crate::ahora()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .expect("crear moneda");
        organizacion::ActiveModel {
            id: Set("org-1".into()),
            razon_social: Set("Org".into()),
            rfc: Set("XAXX010101000".into()),
            tipo: Set(organizacion::TipoOrganizacion::Despacho),
            moneda_default_id: Set("mon-1".into()),
            horas_jornada: Set(Decimal::from(8)),
            created_at: Set(crate::ahora()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .expect("crear organización");
        let region = region::ActiveModel {
            id: Set("reg-1".into()),
            organizacion_id: Set("org-1".into()),
            nombre: Set("Occidente".into()),
            estado: Set("Jalisco".into()),
            factor_ajuste: Set(None),
            visible: Set(true),
            deleted: Set(false),
            created_at: Set(crate::ahora()),
            created_by: Set("usr-1".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .expect("crear región");
        (portafolio, region.id)
    }

    #[tokio::test]
    async fn validar_region_existe_acepta_nulo() {
        let (portafolio, _) = portafolio_con_region().await;
        assert!(
            crate::validar_region_existe(&portafolio, &None)
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn validar_region_existe_acepta_region_existente() {
        let (portafolio, region_id) = portafolio_con_region().await;
        assert!(
            crate::validar_region_existe(&portafolio, &Some(region_id))
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn validar_region_existe_rechaza_region_inexistente() {
        let (portafolio, _) = portafolio_con_region().await;
        assert!(
            crate::validar_region_existe(&portafolio, &Some("no-existe".to_string()))
                .await
                .is_err()
        );
    }

    fn datos(nombre: &str, region_id: Option<String>) -> FactorSalarioRealData {
        FactorSalarioRealData {
            nombre: nombre.to_string(),
            region_id,
            modelo_calculo_json: String::new(),
            parametros_json: String::new(),
        }
    }

    /// `crear`/`actualizar` sí exigen la FK `organizacion_id` — `portafolio_con_region`
    /// ya siembra moneda y organización para poder colgar la región.
    async fn portafolio_con_organizacion_y_region() -> (obrix_db::PortafolioSqliteRepository, String)
    {
        portafolio_con_region().await
    }

    #[tokio::test]
    async fn crear_rechaza_region_duplicada() {
        let (portafolio, region_id) = portafolio_con_organizacion_y_region().await;
        FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            datos("FSR — Occidente", Some(region_id.clone())),
            "usr-1".into(),
        )
        .await
        .expect("crear el primer FSR de la región");

        let error = FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            datos("FSR — Occidente (dup)", Some(region_id)),
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir un segundo FSR para la misma región");
        assert!(matches!(error, ServiceError::Validacion(_)));
    }

    #[tokio::test]
    async fn crear_rechaza_nacional_duplicado() {
        let (portafolio, _) = portafolio_con_organizacion_y_region().await;
        FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            datos("FSR — Nacional", None),
            "usr-1".into(),
        )
        .await
        .expect("crear el primer FSR nacional");

        let error = FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            datos("FSR — Nacional (dup)", None),
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir un segundo FSR nacional");
        assert!(matches!(error, ServiceError::Validacion(_)));
    }

    #[tokio::test]
    async fn actualizar_permite_conservar_su_propia_region() {
        let (portafolio, region_id) = portafolio_con_organizacion_y_region().await;
        let creado = FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            datos("FSR — Occidente", Some(region_id.clone())),
            "usr-1".into(),
        )
        .await
        .expect("crear FSR");

        let actualizado = FactorSalarioRealService::actualizar(
            &portafolio,
            creado.id.clone(),
            datos("FSR — Occidente, renombrado", Some(region_id)),
            "usr-1".into(),
        )
        .await
        .expect("actualizar sin cambiar de región no debe chocar consigo mismo");
        assert_eq!(actualizado.nombre, "FSR — Occidente, renombrado");
    }

    #[tokio::test]
    async fn actualizar_rechaza_region_ya_usada_por_otro_fsr() {
        let (portafolio, region_id) = portafolio_con_organizacion_y_region().await;
        FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            datos("FSR — Occidente", Some(region_id.clone())),
            "usr-1".into(),
        )
        .await
        .expect("crear FSR de la región");
        let nacional = FactorSalarioRealService::crear(
            &portafolio,
            "org-1".into(),
            datos("FSR — Nacional", None),
            "usr-1".into(),
        )
        .await
        .expect("crear FSR nacional");

        let error = FactorSalarioRealService::actualizar(
            &portafolio,
            nacional.id,
            datos("FSR — Nacional a Occidente", Some(region_id)),
            "usr-1".into(),
        )
        .await
        .expect_err("no debe permitir tomar la región de otro FSR ya existente");
        assert!(matches!(error, ServiceError::Validacion(_)));
    }
}
