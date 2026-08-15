//! Tabla de referencia (no cuelga de `insumo`): porcentaje de cada rubro de
//! costo horario que aplica cuando el equipo está inactivo ("en espera" o
//! "en reserva"), según el criterio publicante (CFE, GCDMX, CMIC de fábrica,
//! más los que el usuario agregue). Los 48 renglones sembrados (2 tipos × 8
//! rubros × 3 perfiles) vienen de
//! `data/initial/perfil_inactividad_equipo.csv`; el frontend edita `valor`
//! libremente y puede agregar/quitar un perfil completo (una "columna" de
//! la matriz) — internamente eso es crear/borrar los 16 renglones (2 tipos
//! × 8 rubros) de ese perfil.

use std::str::FromStr;

use obrix_db::entities::perfil_inactividad_equipo::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
    TransactionTrait,
};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

const PERFILES_CSV: &str = include_str!("../../../data/initial/perfil_inactividad_equipo.csv");

/// (nombre en el csv, slug guardado en `rubro`) — orden sin importancia,
/// el frontend define el orden de despliegue por sección.
const RUBROS: &[(&str, &str)] = &[
    ("Depreciación", "depreciacion"),
    ("Inversión", "inversion"),
    ("Seguros", "seguros"),
    ("Mantenimiento", "mantenimiento"),
    ("Combustibles", "combustibles"),
    ("Lubricantes", "lubricantes"),
    ("Llantas", "llantas"),
    ("Operación", "operacion"),
];

const TIPOS: &[(&str, &str)] = &[("Espera", "espera"), ("Reserva", "reserva")];

pub struct PerfilInactividadEquipoService;

impl PerfilInactividadEquipoService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .order_by_asc(Column::Tipo)
            .order_by_asc(Column::Rubro)
            .order_by_asc(Column::Perfil)
            .all(repo.conexion())
            .await?)
    }

    /// Único campo editable — los renglones (tipo/rubro/perfil) son fijos,
    /// se crean solo al sembrar.
    pub async fn actualizar_valor(
        repo: &dyn PortafolioRepository,
        id: String,
        valor: Decimal,
        actualizado_por: String,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| {
                ServiceError::NoEncontrado(format!("perfil de inactividad de equipo {id}"))
            })?
            .into();
        modelo.valor = Set(valor);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(Some(actualizado_por));
        Ok(modelo.update(repo.conexion()).await?)
    }

    /// Agrega un perfil (columna) nuevo: un renglón en 0 por cada
    /// combinación (tipo, rubro) existente, todo en una transacción. Falla
    /// si ya existe un perfil con ese nombre exacto.
    pub async fn agregar_columna(
        repo: &dyn PortafolioRepository,
        perfil: String,
        creado_por: String,
    ) -> Result<Vec<Model>, ServiceError> {
        let perfil = perfil.trim().to_string();
        if perfil.is_empty() {
            return Err(ServiceError::Validacion(
                "el nombre del perfil no puede estar vacío".into(),
            ));
        }
        let ya_existe = Entity::find()
            .filter(Column::Perfil.eq(perfil.clone()))
            .one(repo.conexion())
            .await?
            .is_some();
        if ya_existe {
            return Err(ServiceError::Validacion(format!(
                "ya existe un perfil llamado \"{perfil}\""
            )));
        }

        let txn = repo.conexion().begin().await?;
        let mut creados = Vec::with_capacity(TIPOS.len() * RUBROS.len());
        for (_, tipo) in TIPOS {
            for (_, rubro) in RUBROS {
                let modelo = ActiveModel {
                    id: Set(nuevo_id()),
                    tipo: Set(tipo.to_string()),
                    rubro: Set(rubro.to_string()),
                    perfil: Set(perfil.clone()),
                    valor: Set(Decimal::ZERO),
                    created_at: Set(crate::ahora()),
                    updated_at: Set(None),
                    created_by: Set(creado_por.clone()),
                    updated_by: Set(None),
                }
                .insert(&txn)
                .await?;
                creados.push(modelo);
            }
        }
        txn.commit().await?;
        Ok(creados)
    }

    /// Quita un perfil (columna) completo — todos sus renglones.
    pub async fn eliminar_columna(
        repo: &dyn PortafolioRepository,
        perfil: String,
    ) -> Result<(), ServiceError> {
        Entity::delete_many()
            .filter(Column::Perfil.eq(perfil))
            .exec(repo.conexion())
            .await?;
        Ok(())
    }
}

impl DatosIniciales for PerfilInactividadEquipoService {
    /// Un renglón por cada perfil (CFE/GCDMX/CMIC) de cada fila de
    /// `data/initial/perfil_inactividad_equipo.csv`.
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let mut lector = csv::ReaderBuilder::new().from_reader(PERFILES_CSV.as_bytes());
        for (i, registro) in lector.deserialize::<RegistroCsvPerfil>().enumerate() {
            let fila = i + 2;
            let registro = registro.map_err(|e| {
                ServiceError::Validacion(format!(
                    "perfil_inactividad_equipo.csv fila {fila}: {e}"
                ))
            })?;
            let tipo = TIPOS
                .iter()
                .find(|(nombre, _)| *nombre == registro.tipo.trim())
                .map(|(_, slug)| *slug)
                .ok_or_else(|| {
                    ServiceError::Validacion(format!(
                        "perfil_inactividad_equipo.csv fila {fila}: tipo desconocido {}",
                        registro.tipo
                    ))
                })?;
            let rubro = RUBROS
                .iter()
                .find(|(nombre, _)| *nombre == registro.rubro.trim())
                .map(|(_, slug)| *slug)
                .ok_or_else(|| {
                    ServiceError::Validacion(format!(
                        "perfil_inactividad_equipo.csv fila {fila}: rubro desconocido {}",
                        registro.rubro
                    ))
                })?;
            for (perfil, texto) in [
                ("cfe", &registro.cfe),
                ("gcdmx", &registro.gcdmx),
                ("cmic", &registro.cmic),
            ] {
                let valor = Decimal::from_str(texto.trim()).map_err(|e| {
                    ServiceError::Validacion(format!(
                        "perfil_inactividad_equipo.csv fila {fila}: valor inválido para {perfil}: {e}"
                    ))
                })?;
                ActiveModel {
                    id: Set(nuevo_id()),
                    tipo: Set(tipo.to_string()),
                    rubro: Set(rubro.to_string()),
                    perfil: Set(perfil.to_string()),
                    valor: Set(valor),
                    created_at: Set(crate::ahora()),
                    updated_at: Set(None),
                    created_by: Set(admin.id.clone()),
                    updated_by: Set(None),
                }
                .insert(repo.conexion())
                .await?;
            }
        }
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct RegistroCsvPerfil {
    #[serde(rename = "Tipo")]
    tipo: String,
    #[serde(rename = "Rubro")]
    rubro: String,
    #[serde(rename = "CFE")]
    cfe: String,
    #[serde(rename = "GCDMX")]
    gcdmx: String,
    #[serde(rename = "CMIC")]
    cmic: String,
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

    #[tokio::test]
    async fn sembrar_crea_48_renglones_y_es_idempotente() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        UsuarioService::sembrar(&portafolio).await.expect("sembrar usuario");

        PerfilInactividadEquipoService::sembrar(&portafolio)
            .await
            .expect("primer sembrado");
        PerfilInactividadEquipoService::sembrar(&portafolio)
            .await
            .expect("segundo sembrado (no debe duplicar)");

        let renglones = PerfilInactividadEquipoService::listar(&portafolio)
            .await
            .expect("listar");
        assert_eq!(renglones.len(), 48, "2 tipos x 8 rubros x 3 perfiles");

        let mantenimiento_gcdmx_espera = renglones
            .iter()
            .find(|r| r.tipo == "espera" && r.rubro == "mantenimiento" && r.perfil == "gcdmx")
            .expect("mantenimiento gcdmx espera");
        assert_eq!(mantenimiento_gcdmx_espera.valor, Decimal::from_str("75").unwrap());
    }

    #[tokio::test]
    async fn actualizar_valor_cambia_solo_ese_renglon() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        UsuarioService::sembrar(&portafolio).await.expect("sembrar usuario");
        PerfilInactividadEquipoService::sembrar(&portafolio)
            .await
            .expect("sembrar");
        let admin = UsuarioService::buscar_admin_obrix(&portafolio)
            .await
            .expect("admin");

        let renglones = PerfilInactividadEquipoService::listar(&portafolio)
            .await
            .expect("listar");
        let objetivo = renglones
            .iter()
            .find(|r| r.tipo == "reserva" && r.rubro == "llantas" && r.perfil == "cmic")
            .expect("llantas cmic reserva")
            .clone();
        assert_eq!(objetivo.valor, Decimal::from_str("5").unwrap());

        let actualizado = PerfilInactividadEquipoService::actualizar_valor(
            &portafolio,
            objetivo.id.clone(),
            Decimal::from_str("8").unwrap(),
            admin.id.clone(),
        )
        .await
        .expect("actualizar");
        assert_eq!(actualizado.valor, Decimal::from_str("8").unwrap());
        assert_eq!(actualizado.updated_by.as_deref(), Some(admin.id.as_str()));

        let otro = renglones
            .iter()
            .find(|r| r.tipo == "reserva" && r.rubro == "llantas" && r.perfil == "gcdmx")
            .expect("llantas gcdmx reserva");
        assert_eq!(otro.valor, Decimal::from_str("0").unwrap());
    }

    #[tokio::test]
    async fn agregar_columna_crea_16_renglones_en_0_y_rechaza_nombre_repetido() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        UsuarioService::sembrar(&portafolio).await.expect("sembrar usuario");
        PerfilInactividadEquipoService::sembrar(&portafolio)
            .await
            .expect("sembrar");
        let admin = UsuarioService::buscar_admin_obrix(&portafolio)
            .await
            .expect("admin");

        let creados = PerfilInactividadEquipoService::agregar_columna(
            &portafolio,
            "Estado de México".into(),
            admin.id.clone(),
        )
        .await
        .expect("agregar columna");
        assert_eq!(creados.len(), 16, "2 tipos x 8 rubros");
        assert!(creados.iter().all(|r| r.valor == Decimal::ZERO));

        let renglones = PerfilInactividadEquipoService::listar(&portafolio)
            .await
            .expect("listar");
        assert_eq!(renglones.len(), 64, "48 originales + 16 de la columna nueva");

        let error = PerfilInactividadEquipoService::agregar_columna(
            &portafolio,
            "Estado de México".into(),
            admin.id.clone(),
        )
        .await
        .expect_err("no debe permitir un nombre repetido");
        assert!(matches!(error, ServiceError::Validacion(_)));
    }

    #[tokio::test]
    async fn eliminar_columna_quita_solo_sus_renglones() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        UsuarioService::sembrar(&portafolio).await.expect("sembrar usuario");
        PerfilInactividadEquipoService::sembrar(&portafolio)
            .await
            .expect("sembrar");
        let admin = UsuarioService::buscar_admin_obrix(&portafolio)
            .await
            .expect("admin");
        PerfilInactividadEquipoService::agregar_columna(&portafolio, "Jalisco".into(), admin.id.clone())
            .await
            .expect("agregar columna");

        PerfilInactividadEquipoService::eliminar_columna(&portafolio, "Jalisco".into())
            .await
            .expect("eliminar columna");

        let renglones = PerfilInactividadEquipoService::listar(&portafolio)
            .await
            .expect("listar");
        assert_eq!(renglones.len(), 48, "solo deben quedar los originales");
        assert!(renglones.iter().all(|r| r.perfil != "Jalisco"));
    }
}
