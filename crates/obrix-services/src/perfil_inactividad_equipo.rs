//! Receta reutilizable (no cuelga de `insumo`, igual que
//! `factor_salario_real`): porcentaje de cada rubro de costo horario que
//! aplica cuando un equipo está inactivo ("en espera" o "en reserva") — ver
//! `perfil_inactividad_equipo` en el diccionario de datos. El despacho edita
//! los porcentajes libremente y puede agregar o eliminar perfiles completos
//! (borrado lógico); el sembrado inicial es solo una receta de partida
//! (frente/patio), no una norma.

use obrix_db::entities::perfil_inactividad_equipo::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};

use crate::organizacion::OrganizacionService;
use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

/// Perfiles de referencia (CFE/GCDMX/CMIC/SICT) — fuente de verdad en
/// `data/initial/perfil_inactividad_equipo.csv`, embebido tal cual en el
/// binario (mismo patrón que `categoria_fasar.csv`). El consumo va partido
/// por naturaleza (combustible, lubricante, llantas, piezas especiales,
/// otras fuentes), no un % único sobre `subtotal_consumo`.
const PERFILES_CSV: &str = include_str!("../../../data/initial/perfil_inactividad_equipo.csv");

#[derive(serde::Deserialize)]
pub struct PerfilInactividadEquipoData {
    pub nombre: String,
    pub espera_depreciacion_porcentaje: Decimal,
    pub espera_inversion_porcentaje: Decimal,
    pub espera_seguro_porcentaje: Decimal,
    pub espera_mantenimiento_porcentaje: Decimal,
    pub espera_combustible_porcentaje: Decimal,
    pub espera_lubricante_porcentaje: Decimal,
    pub espera_llantas_porcentaje: Decimal,
    pub espera_piezas_especiales_porcentaje: Decimal,
    pub espera_otras_fuentes_porcentaje: Decimal,
    pub espera_operacion_porcentaje: Decimal,
    pub reserva_depreciacion_porcentaje: Decimal,
    pub reserva_inversion_porcentaje: Decimal,
    pub reserva_seguro_porcentaje: Decimal,
    pub reserva_mantenimiento_porcentaje: Decimal,
    pub reserva_combustible_porcentaje: Decimal,
    pub reserva_lubricante_porcentaje: Decimal,
    pub reserva_llantas_porcentaje: Decimal,
    pub reserva_piezas_especiales_porcentaje: Decimal,
    pub reserva_otras_fuentes_porcentaje: Decimal,
    pub reserva_operacion_porcentaje: Decimal,
}

pub struct PerfilInactividadEquipoService;

impl PerfilInactividadEquipoService {
    /// Validación de `PerfilInactividadEquipoData` común a `crear`/`actualizar`
    /// — `actualizando` distingue alta de edición (ver `crate::accion`). Cada
    /// porcentaje debe estar en 0–100 inclusive, igual que el diccionario.
    fn validar(datos: &PerfilInactividadEquipoData, actualizando: bool) -> Result<(), ServiceError> {
        let accion = crate::accion(actualizando);
        for (etiqueta, valor) in [
            ("espera · depreciación", datos.espera_depreciacion_porcentaje),
            ("espera · inversión", datos.espera_inversion_porcentaje),
            ("espera · seguro", datos.espera_seguro_porcentaje),
            ("espera · mantenimiento", datos.espera_mantenimiento_porcentaje),
            ("espera · combustible", datos.espera_combustible_porcentaje),
            ("espera · lubricante", datos.espera_lubricante_porcentaje),
            ("espera · llantas", datos.espera_llantas_porcentaje),
            ("espera · piezas especiales", datos.espera_piezas_especiales_porcentaje),
            ("espera · otras fuentes", datos.espera_otras_fuentes_porcentaje),
            ("espera · operación", datos.espera_operacion_porcentaje),
            ("reserva · depreciación", datos.reserva_depreciacion_porcentaje),
            ("reserva · inversión", datos.reserva_inversion_porcentaje),
            ("reserva · seguro", datos.reserva_seguro_porcentaje),
            ("reserva · mantenimiento", datos.reserva_mantenimiento_porcentaje),
            ("reserva · combustible", datos.reserva_combustible_porcentaje),
            ("reserva · lubricante", datos.reserva_lubricante_porcentaje),
            ("reserva · llantas", datos.reserva_llantas_porcentaje),
            ("reserva · piezas especiales", datos.reserva_piezas_especiales_porcentaje),
            ("reserva · otras fuentes", datos.reserva_otras_fuentes_porcentaje),
            ("reserva · operación", datos.reserva_operacion_porcentaje),
        ] {
            if valor < Decimal::ZERO || valor > Decimal::ONE_HUNDRED {
                return Err(ServiceError::Validacion(format!(
                    "No se puede {accion} un perfil de inactividad de equipo con {etiqueta} fuera del rango 0-100."
                )));
            }
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

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: PerfilInactividadEquipoData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        Self::validar(&datos, false)?;
        Ok(ActiveModel {
            id: Set(nuevo_id()),
            organizacion_id: Set(organizacion_id.to_string()),
            nombre: Set(datos.nombre),
            espera_depreciacion_porcentaje: Set(datos.espera_depreciacion_porcentaje),
            espera_inversion_porcentaje: Set(datos.espera_inversion_porcentaje),
            espera_seguro_porcentaje: Set(datos.espera_seguro_porcentaje),
            espera_mantenimiento_porcentaje: Set(datos.espera_mantenimiento_porcentaje),
            espera_combustible_porcentaje: Set(datos.espera_combustible_porcentaje),
            espera_lubricante_porcentaje: Set(datos.espera_lubricante_porcentaje),
            espera_llantas_porcentaje: Set(datos.espera_llantas_porcentaje),
            espera_piezas_especiales_porcentaje: Set(datos.espera_piezas_especiales_porcentaje),
            espera_otras_fuentes_porcentaje: Set(datos.espera_otras_fuentes_porcentaje),
            espera_operacion_porcentaje: Set(datos.espera_operacion_porcentaje),
            reserva_depreciacion_porcentaje: Set(datos.reserva_depreciacion_porcentaje),
            reserva_inversion_porcentaje: Set(datos.reserva_inversion_porcentaje),
            reserva_seguro_porcentaje: Set(datos.reserva_seguro_porcentaje),
            reserva_mantenimiento_porcentaje: Set(datos.reserva_mantenimiento_porcentaje),
            reserva_combustible_porcentaje: Set(datos.reserva_combustible_porcentaje),
            reserva_lubricante_porcentaje: Set(datos.reserva_lubricante_porcentaje),
            reserva_llantas_porcentaje: Set(datos.reserva_llantas_porcentaje),
            reserva_piezas_especiales_porcentaje: Set(datos.reserva_piezas_especiales_porcentaje),
            reserva_otras_fuentes_porcentaje: Set(datos.reserva_otras_fuentes_porcentaje),
            reserva_operacion_porcentaje: Set(datos.reserva_operacion_porcentaje),
            deleted: Set(false),
            created_at: Set(crate::ahora()),
            created_by: Set(creado_por),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted_at: Set(None),
            deleted_by: Set(None),
        }
        .insert(repo.conexion())
        .await?)
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: PerfilInactividadEquipoData,
        actualizado_por: String,
    ) -> Result<Model, ServiceError> {
        Self::validar(&datos, true)?;
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .filter(Column::Deleted.eq(false))
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("perfil de inactividad de equipo {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.espera_depreciacion_porcentaje = Set(datos.espera_depreciacion_porcentaje);
        modelo.espera_inversion_porcentaje = Set(datos.espera_inversion_porcentaje);
        modelo.espera_seguro_porcentaje = Set(datos.espera_seguro_porcentaje);
        modelo.espera_mantenimiento_porcentaje = Set(datos.espera_mantenimiento_porcentaje);
        modelo.espera_combustible_porcentaje = Set(datos.espera_combustible_porcentaje);
        modelo.espera_lubricante_porcentaje = Set(datos.espera_lubricante_porcentaje);
        modelo.espera_llantas_porcentaje = Set(datos.espera_llantas_porcentaje);
        modelo.espera_piezas_especiales_porcentaje = Set(datos.espera_piezas_especiales_porcentaje);
        modelo.espera_otras_fuentes_porcentaje = Set(datos.espera_otras_fuentes_porcentaje);
        modelo.espera_operacion_porcentaje = Set(datos.espera_operacion_porcentaje);
        modelo.reserva_depreciacion_porcentaje = Set(datos.reserva_depreciacion_porcentaje);
        modelo.reserva_inversion_porcentaje = Set(datos.reserva_inversion_porcentaje);
        modelo.reserva_seguro_porcentaje = Set(datos.reserva_seguro_porcentaje);
        modelo.reserva_mantenimiento_porcentaje = Set(datos.reserva_mantenimiento_porcentaje);
        modelo.reserva_combustible_porcentaje = Set(datos.reserva_combustible_porcentaje);
        modelo.reserva_lubricante_porcentaje = Set(datos.reserva_lubricante_porcentaje);
        modelo.reserva_llantas_porcentaje = Set(datos.reserva_llantas_porcentaje);
        modelo.reserva_piezas_especiales_porcentaje = Set(datos.reserva_piezas_especiales_porcentaje);
        modelo.reserva_otras_fuentes_porcentaje = Set(datos.reserva_otras_fuentes_porcentaje);
        modelo.reserva_operacion_porcentaje = Set(datos.reserva_operacion_porcentaje);
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
            .ok_or_else(|| ServiceError::NoEncontrado(format!("perfil de inactividad de equipo {id}")))?
            .into();
        modelo.deleted = Set(true);
        modelo.deleted_at = Set(Some(crate::ahora()));
        modelo.deleted_by = Set(Some(eliminado_por));
        modelo.update(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for PerfilInactividadEquipoService {
    /// Un perfil por cada fila de `data/initial/perfil_inactividad_equipo.csv`
    /// (CFE, GCDMX, CMIC, SICT) — recetas de partida (frente/patio) publicadas por
    /// cada criterio, no una norma: el despacho las edita.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let organizacion = OrganizacionService::buscar_admin_obrix(repo).await?;

        let mut lector = csv::ReaderBuilder::new().from_reader(PERFILES_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvPerfil>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!("perfil_inactividad_equipo.csv fila {fila}: {e}"))
            })?;
            Self::crear(
                repo,
                &organizacion.id,
                PerfilInactividadEquipoData {
                    nombre: registro.nombre,
                    espera_depreciacion_porcentaje: registro.espera_depreciacion,
                    espera_inversion_porcentaje: registro.espera_inversion,
                    espera_seguro_porcentaje: registro.espera_seguro,
                    espera_mantenimiento_porcentaje: registro.espera_mantenimiento,
                    espera_combustible_porcentaje: registro.espera_combustible,
                    espera_lubricante_porcentaje: registro.espera_lubricante,
                    espera_llantas_porcentaje: registro.espera_llantas,
                    espera_piezas_especiales_porcentaje: registro.espera_piezas_especiales,
                    espera_otras_fuentes_porcentaje: registro.espera_otras_fuentes,
                    espera_operacion_porcentaje: registro.espera_operacion,
                    reserva_depreciacion_porcentaje: registro.reserva_depreciacion,
                    reserva_inversion_porcentaje: registro.reserva_inversion,
                    reserva_seguro_porcentaje: registro.reserva_seguro,
                    reserva_mantenimiento_porcentaje: registro.reserva_mantenimiento,
                    reserva_combustible_porcentaje: registro.reserva_combustible,
                    reserva_lubricante_porcentaje: registro.reserva_lubricante,
                    reserva_llantas_porcentaje: registro.reserva_llantas,
                    reserva_piezas_especiales_porcentaje: registro.reserva_piezas_especiales,
                    reserva_otras_fuentes_porcentaje: registro.reserva_otras_fuentes,
                    reserva_operacion_porcentaje: registro.reserva_operacion,
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvPerfil {
    #[serde(rename = "Nombre")]
    nombre: String,
    #[serde(rename = "EsperaDepreciacion")]
    espera_depreciacion: Decimal,
    #[serde(rename = "EsperaInversion")]
    espera_inversion: Decimal,
    #[serde(rename = "EsperaSeguro")]
    espera_seguro: Decimal,
    #[serde(rename = "EsperaMantenimiento")]
    espera_mantenimiento: Decimal,
    #[serde(rename = "EsperaCombustible")]
    espera_combustible: Decimal,
    #[serde(rename = "EsperaLubricante")]
    espera_lubricante: Decimal,
    #[serde(rename = "EsperaLlantas")]
    espera_llantas: Decimal,
    #[serde(rename = "EsperaPiezasEspeciales")]
    espera_piezas_especiales: Decimal,
    #[serde(rename = "EsperaOtrasFuentes")]
    espera_otras_fuentes: Decimal,
    #[serde(rename = "EsperaOperacion")]
    espera_operacion: Decimal,
    #[serde(rename = "ReservaDepreciacion")]
    reserva_depreciacion: Decimal,
    #[serde(rename = "ReservaInversion")]
    reserva_inversion: Decimal,
    #[serde(rename = "ReservaSeguro")]
    reserva_seguro: Decimal,
    #[serde(rename = "ReservaMantenimiento")]
    reserva_mantenimiento: Decimal,
    #[serde(rename = "ReservaCombustible")]
    reserva_combustible: Decimal,
    #[serde(rename = "ReservaLubricante")]
    reserva_lubricante: Decimal,
    #[serde(rename = "ReservaLlantas")]
    reserva_llantas: Decimal,
    #[serde(rename = "ReservaPiezasEspeciales")]
    reserva_piezas_especiales: Decimal,
    #[serde(rename = "ReservaOtrasFuentes")]
    reserva_otras_fuentes: Decimal,
    #[serde(rename = "ReservaOperacion")]
    reserva_operacion: Decimal,
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::str::FromStr;

    use obrix_db::PortafolioSqliteRepository;
    use rust_decimal::Decimal;

    use crate::usuario::UsuarioService;
    use crate::DatosIniciales;

    use super::*;

    fn datos_prueba(nombre: &str) -> PerfilInactividadEquipoData {
        PerfilInactividadEquipoData {
            nombre: nombre.to_string(),
            espera_depreciacion_porcentaje: Decimal::from_str("100").unwrap(),
            espera_inversion_porcentaje: Decimal::from_str("100").unwrap(),
            espera_seguro_porcentaje: Decimal::from_str("100").unwrap(),
            espera_mantenimiento_porcentaje: Decimal::from_str("50").unwrap(),
            espera_combustible_porcentaje: Decimal::from_str("0").unwrap(),
            espera_lubricante_porcentaje: Decimal::from_str("0").unwrap(),
            espera_llantas_porcentaje: Decimal::from_str("0").unwrap(),
            espera_piezas_especiales_porcentaje: Decimal::from_str("0").unwrap(),
            espera_otras_fuentes_porcentaje: Decimal::from_str("0").unwrap(),
            espera_operacion_porcentaje: Decimal::from_str("100").unwrap(),
            reserva_depreciacion_porcentaje: Decimal::from_str("0").unwrap(),
            reserva_inversion_porcentaje: Decimal::from_str("100").unwrap(),
            reserva_seguro_porcentaje: Decimal::from_str("100").unwrap(),
            reserva_mantenimiento_porcentaje: Decimal::from_str("0").unwrap(),
            reserva_combustible_porcentaje: Decimal::from_str("0").unwrap(),
            reserva_lubricante_porcentaje: Decimal::from_str("0").unwrap(),
            reserva_llantas_porcentaje: Decimal::from_str("0").unwrap(),
            reserva_piezas_especiales_porcentaje: Decimal::from_str("0").unwrap(),
            reserva_otras_fuentes_porcentaje: Decimal::from_str("0").unwrap(),
            reserva_operacion_porcentaje: Decimal::from_str("0").unwrap(),
        }
    }

    /// Un setter por cada porcentaje — así el test de rango cubre los 20
    /// campos sin copiar el arreglo de `validar`.
    fn setters_porcentaje() -> Vec<fn(&mut PerfilInactividadEquipoData, Decimal)> {
        vec![
            |d, v| d.espera_depreciacion_porcentaje = v,
            |d, v| d.espera_inversion_porcentaje = v,
            |d, v| d.espera_seguro_porcentaje = v,
            |d, v| d.espera_mantenimiento_porcentaje = v,
            |d, v| d.espera_combustible_porcentaje = v,
            |d, v| d.espera_lubricante_porcentaje = v,
            |d, v| d.espera_llantas_porcentaje = v,
            |d, v| d.espera_piezas_especiales_porcentaje = v,
            |d, v| d.espera_otras_fuentes_porcentaje = v,
            |d, v| d.espera_operacion_porcentaje = v,
            |d, v| d.reserva_depreciacion_porcentaje = v,
            |d, v| d.reserva_inversion_porcentaje = v,
            |d, v| d.reserva_seguro_porcentaje = v,
            |d, v| d.reserva_mantenimiento_porcentaje = v,
            |d, v| d.reserva_combustible_porcentaje = v,
            |d, v| d.reserva_lubricante_porcentaje = v,
            |d, v| d.reserva_llantas_porcentaje = v,
            |d, v| d.reserva_piezas_especiales_porcentaje = v,
            |d, v| d.reserva_otras_fuentes_porcentaje = v,
            |d, v| d.reserva_operacion_porcentaje = v,
        ]
    }

    #[test]
    fn validar_rechaza_cualquier_porcentaje_fuera_de_rango() {
        let bajo = Decimal::from_str("-0.01").unwrap();
        let alto = Decimal::from_str("100.01").unwrap();
        for setter in setters_porcentaje() {
            let mut datos = datos_prueba("CMIC");
            setter(&mut datos, bajo);
            let err = PerfilInactividadEquipoService::validar(&datos, false).expect_err("rechaza < 0");
            match err {
                ServiceError::Validacion(mensaje) => {
                    assert!(mensaje.contains("fuera del rango 0-100"), "mensaje inesperado: {mensaje}");
                    assert!(mensaje.contains("crear"), "debe usar el verbo de alta: {mensaje}");
                }
                otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
            }

            let mut datos = datos_prueba("CMIC");
            setter(&mut datos, alto);
            let err = PerfilInactividadEquipoService::validar(&datos, true).expect_err("rechaza > 100");
            match err {
                ServiceError::Validacion(mensaje) => {
                    assert!(mensaje.contains("fuera del rango 0-100"), "mensaje inesperado: {mensaje}");
                    assert!(mensaje.contains("actualizar"), "debe usar el verbo de edición: {mensaje}");
                }
                otro => panic!("se esperaba Validacion, se obtuvo {otro}"),
            }
        }
    }

    #[test]
    fn validar_acepta_porcentajes_en_los_extremos_del_rango() {
        for setter in setters_porcentaje() {
            let mut en_cero = datos_prueba("CMIC");
            setter(&mut en_cero, Decimal::ZERO);
            assert!(PerfilInactividadEquipoService::validar(&en_cero, false).is_ok());

            let mut en_cien = datos_prueba("CMIC");
            setter(&mut en_cien, Decimal::ONE_HUNDRED);
            assert!(PerfilInactividadEquipoService::validar(&en_cien, true).is_ok());
        }
    }

    #[tokio::test]
    async fn sembrar_carga_perfil_inactividad_equipo_csv_y_es_idempotente() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        crate::seed::sembrar_catalogos_generales(&portafolio)
            .await
            .expect("sembrar catálogos generales");

        let organizacion = crate::organizacion::OrganizacionService::buscar_admin_obrix(&portafolio)
            .await
            .expect("organización sembrada");

        let perfiles = PerfilInactividadEquipoService::listar(&portafolio, &organizacion.id)
            .await
            .expect("listar");
        assert_eq!(perfiles.len(), 4, "CFE, GCDMX, CMIC y SICT de data/initial/perfil_inactividad_equipo.csv");

        let cmic = perfiles.iter().find(|p| p.nombre == "CMIC").expect("CMIC");
        assert_eq!(cmic.espera_mantenimiento_porcentaje, Decimal::from_str("50").unwrap());
        assert_eq!(cmic.espera_combustible_porcentaje, Decimal::from_str("5").unwrap());
        assert_eq!(cmic.espera_lubricante_porcentaje, Decimal::from_str("5").unwrap());
        assert_eq!(cmic.espera_llantas_porcentaje, Decimal::from_str("10").unwrap());
        assert_eq!(cmic.espera_piezas_especiales_porcentaje, Decimal::from_str("0").unwrap());
        assert_eq!(cmic.espera_otras_fuentes_porcentaje, Decimal::from_str("0").unwrap());
        assert_eq!(cmic.reserva_depreciacion_porcentaje, Decimal::from_str("15").unwrap());
        assert_eq!(cmic.reserva_combustible_porcentaje, Decimal::from_str("3").unwrap());
        assert_eq!(cmic.reserva_lubricante_porcentaje, Decimal::from_str("3").unwrap());
        assert_eq!(cmic.reserva_llantas_porcentaje, Decimal::from_str("5").unwrap());

        let cfe = perfiles.iter().find(|p| p.nombre == "CFE").expect("CFE");
        assert_eq!(cfe.espera_mantenimiento_porcentaje, Decimal::from_str("0").unwrap());
        assert_eq!(cfe.espera_llantas_porcentaje, Decimal::from_str("15").unwrap());
        assert_eq!(cfe.reserva_combustible_porcentaje, Decimal::from_str("0").unwrap());

        let sict = perfiles.iter().find(|p| p.nombre == "SICT").expect("SICT");
        assert_eq!(sict.espera_mantenimiento_porcentaje, Decimal::from_str("15").unwrap());
        assert_eq!(sict.espera_otras_fuentes_porcentaje, Decimal::from_str("5").unwrap());
        assert_eq!(sict.espera_llantas_porcentaje, Decimal::from_str("15").unwrap());
        assert_eq!(sict.reserva_operacion_porcentaje, Decimal::from_str("0").unwrap());

        // Sembrar de nuevo no debe duplicar — corta temprano si ya hay al
        // menos una fila en `perfil_inactividad_equipo`.
        PerfilInactividadEquipoService::sembrar(&portafolio)
            .await
            .expect("segundo sembrado (no debe duplicar)");
        let perfiles_repetido = PerfilInactividadEquipoService::listar(&portafolio, &organizacion.id)
            .await
            .expect("listar de nuevo");
        assert_eq!(perfiles_repetido.len(), 4, "no debe duplicar al sembrar dos veces");
    }

    #[tokio::test]
    async fn crear_listar_actualizar_eliminar_perfil() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        crate::seed::sembrar_catalogos_generales(&portafolio)
            .await
            .expect("sembrar catálogos generales");
        let admin = UsuarioService::buscar_admin_obrix(&portafolio).await.expect("admin");
        let organizacion = crate::organizacion::OrganizacionService::buscar_admin_obrix(&portafolio)
            .await
            .expect("organización sembrada");

        let creado = PerfilInactividadEquipoService::crear(
            &portafolio,
            &organizacion.id,
            datos_prueba("Estado de México"),
            admin.id.clone(),
        )
        .await
        .expect("crear perfil");
        assert_eq!(creado.nombre, "Estado de México");

        let listado = PerfilInactividadEquipoService::listar(&portafolio, &organizacion.id)
            .await
            .expect("listar");
        // El sembrado (`sembrar_catalogos_generales`) ya deja 4 perfiles (CFE/GCDMX/CMIC/SICT).
        assert_eq!(listado.len(), 5);

        let mut datos_actualizados = datos_prueba("Estado de México, revisado");
        datos_actualizados.espera_mantenimiento_porcentaje = Decimal::from_str("80").unwrap();
        let actualizado = PerfilInactividadEquipoService::actualizar(
            &portafolio,
            creado.id.clone(),
            datos_actualizados,
            admin.id.clone(),
        )
        .await
        .expect("actualizar perfil");
        assert_eq!(actualizado.nombre, "Estado de México, revisado");
        assert_eq!(actualizado.espera_mantenimiento_porcentaje, Decimal::from_str("80").unwrap());
        assert_eq!(actualizado.updated_by.as_deref(), Some(admin.id.as_str()));

        PerfilInactividadEquipoService::eliminar(&portafolio, creado.id.clone(), admin.id.clone())
            .await
            .expect("eliminar perfil");
        let listado = PerfilInactividadEquipoService::listar(&portafolio, &organizacion.id)
            .await
            .expect("listar");
        assert_eq!(listado.len(), 4);
        let restante = Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .expect("buscar perfil eliminado")
            .expect("el perfil sigue en la tabla");
        assert!(restante.deleted);
        assert_eq!(restante.deleted_by.as_deref(), Some(admin.id.as_str()));
        assert!(restante.deleted_at.is_some());
    }
}
