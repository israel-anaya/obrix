use obrix_db::PortafolioRepository;
use obrix_db::entities::{
    moneda,
    organizacion::{ActiveModel, Column, Entity, Model, TipoOrganizacion},
};
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};

use crate::organizacion_usuario::OrganizacionUsuarioService;
use crate::usuario::UsuarioService;
use crate::{DatosIniciales, ServiceError, nuevo_id};

/// Jornada diurna LFT — valor con el que nace toda organización.
const HORAS_JORNADA_DEFAULT: i64 = 8;

#[derive(serde::Deserialize)]
pub struct OrganizacionData {
    pub razon_social: String,
    pub rfc: String,
    /// Recibido como texto (no `TipoOrganizacion`) para poder devolver
    /// `ServiceError::Validacion` en vez de que la fila nueva sin tocar del
    /// grid (que llega con `tipo: ""`) truene al deserializar el comando.
    pub tipo: String,
    pub moneda_default_id: String,
    pub horas_jornada: Decimal,
}

pub struct OrganizacionService;

impl OrganizacionService {
    /// Validación de `OrganizacionData` común a `crear`/`actualizar` —
    /// `actualizando` distingue alta de edición por si una regla futura solo
    /// aplica a uno de los dos casos.
    fn validar(datos: &OrganizacionData, actualizando: bool) -> Result<(), ServiceError> {
        let accion = crate::accion(actualizando);
        if datos.razon_social.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una organización sin razón social."
            )));
        }
        if datos.rfc.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una organización sin RFC."
            )));
        }
        if datos.tipo.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una organización sin tipo."
            )));
        }
        if datos.moneda_default_id.trim().is_empty() {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una organización sin moneda default."
            )));
        }
        if datos.horas_jornada <= Decimal::ZERO {
            return Err(ServiceError::Validacion(format!(
                "No se puede {accion} una organización con horas de jornada menores o iguales a cero."
            )));
        }
        Ok(())
    }

    fn tipo_desde_str(tipo: &str) -> Result<TipoOrganizacion, ServiceError> {
        match tipo.trim() {
            "despacho" => Ok(TipoOrganizacion::Despacho),
            "constructora" => Ok(TipoOrganizacion::Constructora),
            "gobierno" => Ok(TipoOrganizacion::Gobierno),
            otro => Err(ServiceError::Validacion(format!(
                "Tipo de organización inválido: \"{otro}\"."
            ))),
        }
    }

    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .filter(Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    /// Organizaciones donde `usuario_id` tiene membresía activa — usado para
    /// poblar el selector de organización activa en el sidebar.
    pub async fn listar_por_usuario(
        repo: &dyn PortafolioRepository,
        usuario_id: &str,
    ) -> Result<Vec<Model>, ServiceError> {
        let membresias = OrganizacionUsuarioService::listar_por_usuario(repo, usuario_id).await?;
        let ids: Vec<String> = membresias
            .into_iter()
            .filter(|m| m.activo)
            .map(|m| m.organizacion_id)
            .collect();
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        Ok(Entity::find()
            .filter(Column::Id.is_in(ids))
            .filter(Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }

    pub async fn buscar_por_id(
        repo: &dyn PortafolioRepository,
        id: &str,
    ) -> Result<Model, ServiceError> {
        Entity::find_by_id(id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("organización {id}")))
    }

    /// La organización sembrada por el usuario "sistema" (`admin@obrix.local`)
    /// — es decir, la organización demo creada junto con el portafolio.
    pub async fn buscar_admin_obrix(
        repo: &dyn PortafolioRepository,
    ) -> Result<Model, ServiceError> {
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        Entity::find()
            .filter(Column::CreatedBy.eq(admin.id))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado("organización sembrada".to_string()))
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: OrganizacionData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        Self::validar(&datos, false)?;
        let tipo = Self::tipo_desde_str(&datos.tipo)?;
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            razon_social: Set(datos.razon_social),
            rfc: Set(datos.rfc),
            tipo: Set(tipo),
            moneda_default_id: Set(datos.moneda_default_id),
            horas_jornada: Set(datos.horas_jornada),
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
        datos: OrganizacionData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        Self::validar(&datos, true)?;
        let tipo = Self::tipo_desde_str(&datos.tipo)?;
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("organización {id}")))?
            .into();
        modelo.razon_social = Set(datos.razon_social);
        modelo.rfc = Set(datos.rfc);
        modelo.tipo = Set(tipo);
        modelo.moneda_default_id = Set(datos.moneda_default_id);
        modelo.horas_jornada = Set(datos.horas_jornada);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(actualizado_por);
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
            .ok_or_else(|| ServiceError::NoEncontrado(format!("organización {id}")))?
            .into();
        modelo.deleted = Set(true);
        modelo.deleted_at = Set(Some(crate::ahora()));
        modelo.deleted_by = Set(Some(eliminado_por));
        modelo.update(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for OrganizacionService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        // `moneda` ya se sembró antes que `organizacion` (ver orden en
        // `seed::sembrar_catalogos_generales`), así que MXN ya existe aquí.
        let mxn = moneda::Entity::find()
            .filter(moneda::Column::Codigo.eq("MXN"))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(
                    "moneda MXN (debe sembrarse antes que organizacion)".to_string(),
                )
            })?;
        Self::crear(
            repo,
            OrganizacionData {
                razon_social: "Despacho demo".to_string(),
                rfc: "XAXX010101000".to_string(),
                tipo: "despacho".to_string(),
                moneda_default_id: mxn.id,
                horas_jornada: Decimal::from(HORAS_JORNADA_DEFAULT),
            },
            admin.id,
        )
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn datos(
        razon_social: &str,
        rfc: &str,
        tipo: &str,
        moneda_default_id: &str,
    ) -> OrganizacionData {
        datos_con_horas(
            razon_social,
            rfc,
            tipo,
            moneda_default_id,
            Decimal::from(HORAS_JORNADA_DEFAULT),
        )
    }

    fn datos_con_horas(
        razon_social: &str,
        rfc: &str,
        tipo: &str,
        moneda_default_id: &str,
        horas_jornada: Decimal,
    ) -> OrganizacionData {
        OrganizacionData {
            razon_social: razon_social.to_string(),
            rfc: rfc.to_string(),
            tipo: tipo.to_string(),
            moneda_default_id: moneda_default_id.to_string(),
            horas_jornada,
        }
    }

    #[test]
    fn validar_rechaza_razon_social_vacia_o_solo_espacios() {
        assert!(
            OrganizacionService::validar(&datos("", "XAXX010101000", "despacho", "mxn"), false)
                .is_err()
        );
        assert!(
            OrganizacionService::validar(&datos("   ", "XAXX010101000", "despacho", "mxn"), true)
                .is_err()
        );
    }

    #[test]
    fn validar_rechaza_rfc_vacio() {
        assert!(
            OrganizacionService::validar(&datos("Despacho demo", "", "despacho", "mxn"), false)
                .is_err()
        );
    }

    #[test]
    fn validar_rechaza_tipo_vacio() {
        assert!(
            OrganizacionService::validar(
                &datos("Despacho demo", "XAXX010101000", "", "mxn"),
                false
            )
            .is_err()
        );
    }

    #[test]
    fn validar_rechaza_moneda_default_id_vacio() {
        assert!(
            OrganizacionService::validar(
                &datos("Despacho demo", "XAXX010101000", "despacho", ""),
                false
            )
            .is_err()
        );
    }

    #[test]
    fn validar_rechaza_horas_jornada_cero_o_negativas() {
        assert!(
            OrganizacionService::validar(
                &datos_con_horas(
                    "Despacho demo",
                    "XAXX010101000",
                    "despacho",
                    "mxn",
                    Decimal::ZERO
                ),
                false,
            )
            .is_err()
        );
        assert!(
            OrganizacionService::validar(
                &datos_con_horas(
                    "Despacho demo",
                    "XAXX010101000",
                    "despacho",
                    "mxn",
                    Decimal::from(-1),
                ),
                true,
            )
            .is_err()
        );
    }

    #[test]
    fn validar_acepta_horas_jornada_fraccionarias() {
        assert!(
            OrganizacionService::validar(
                &datos_con_horas(
                    "Despacho demo",
                    "XAXX010101000",
                    "despacho",
                    "mxn",
                    Decimal::new(75, 1),
                ),
                false,
            )
            .is_ok()
        );
    }

    #[test]
    fn validar_acepta_datos_completos() {
        assert!(
            OrganizacionService::validar(
                &datos("Despacho demo", "XAXX010101000", "despacho", "mxn"),
                false
            )
            .is_ok()
        );
    }

    #[test]
    fn tipo_desde_str_rechaza_valor_desconocido() {
        assert!(OrganizacionService::tipo_desde_str("no_existe").is_err());
    }

    #[test]
    fn tipo_desde_str_acepta_los_tres_valores_validos() {
        assert!(OrganizacionService::tipo_desde_str("despacho").is_ok());
        assert!(OrganizacionService::tipo_desde_str("constructora").is_ok());
        assert!(OrganizacionService::tipo_desde_str("gobierno").is_ok());
    }
}
