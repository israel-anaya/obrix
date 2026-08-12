//! Punto de extensión de Obrix para "conectarse a servidor". La conexión a
//! un Portafolio local siempre es directa (SQLite vía
//! `obrix_db::PortafolioSqliteRepository`, sin abstracción). Conectarse a un
//! servidor remoto sí es pluggable: un plugin implementa [`GatewayProvider`]
//! para ofrecer una forma de resolver una `DatabaseConnection` a partir de
//! una [`ServidorConfig`]; [`remoto::PortafolioRemotoFactory`] envuelve esa
//! conexión en un [`obrix_db::PortafolioRepository`] remoto.
//!
//! El built-in registrado por defecto (`remoto::ServidorGatewayPostgres`) es
//! una implementación real de PostgreSQL — no hay carga dinámica de plugins
//! todavía (ver [`descubrir_externos`]), pero un plugin externo podría
//! registrar otro `GatewayProvider` (otro dialecto, una réplica vía
//! PowerSync, etc.) sin tocar el resto de la app.

use std::path::Path;

use async_trait::async_trait;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};

pub mod remoto;

pub use remoto::{PortafolioPostgresRepository, PortafolioRemotoFactory, ServidorGatewayPostgres};

/// Datos de conexión a un servidor remoto.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ServidorConfig {
    pub host: String,
    pub puerto: u16,
    pub base_datos: String,
    pub usuario: String,
    pub password: String,
}

#[derive(Debug, thiserror::Error)]
pub enum GatewayError {
    #[error("conexión a servidor no implementada todavía")]
    NoImplementado,
    #[error(transparent)]
    Db(#[from] sea_orm::DbErr),
}

/// Lo que un plugin implementa para ofrecer una forma de conectarse a un
/// servidor remoto. `id` debe ser estable (se usa para seleccionar el
/// proveedor desde configuración); `nombre` es lo que se muestra en la UI.
#[async_trait]
pub trait GatewayProvider: Send + Sync {
    fn id(&self) -> &str;
    fn nombre(&self) -> &str;
    async fn conectar(&self, config: &ServidorConfig) -> Result<DatabaseConnection, GatewayError>;
}

/// Fachada única para abrir un [`obrix_db::PortafolioRepository`] local:
/// crear uno nuevo o abrir uno existente. Usa siempre
/// `PortafolioSqliteRepository` — la contraparte remota es
/// [`remoto::PortafolioRemotoFactory`].
pub struct PortafolioFactory;

impl PortafolioFactory {
    /// Crea un portafolio nuevo en `path`. Falla si el archivo ya existe.
    pub async fn crear(
        path: &Path,
    ) -> Result<Box<dyn obrix_db::PortafolioRepository>, obrix_db::DbError> {
        Ok(Box::new(
            obrix_db::PortafolioSqliteRepository::crear(path).await?,
        ))
    }

    /// Abre un portafolio existente en `path`. Falla si el archivo no existe.
    pub async fn abrir(
        path: &Path,
    ) -> Result<Box<dyn obrix_db::PortafolioRepository>, obrix_db::DbError> {
        Ok(Box::new(
            obrix_db::PortafolioSqliteRepository::abrir(path).await?,
        ))
    }
}

/// Capacidades que un plugin puede declarar en su manifiesto. Hoy solo existe
/// `GatewayProvider`; el enum deja espacio para que futuras capacidades
/// (ej. importadores de bancos de precios) se sumen sin romper el formato.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Capacidad {
    GatewayProvider,
}

/// Forma del manifiesto que un plugin externo declararía (ej. `manifest.json`
/// junto a su binario/componente). No se lee de disco todavía — ver
/// [`descubrir_externos`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub nombre: String,
    pub version: String,
    pub capacidades: Vec<Capacidad>,
}

/// Registro de proveedores de Gateway disponibles en el proceso — hoy solo
/// contiene el built-in [`ServidorGatewayPostgres`], registrado a mano en
/// tiempo de compilación.
pub struct PluginRegistry {
    proveedores_gateway: Vec<Box<dyn GatewayProvider>>,
}

impl PluginRegistry {
    pub fn nuevo() -> Self {
        let mut registro = Self {
            proveedores_gateway: Vec::new(),
        };
        registro.registrar(Box::new(ServidorGatewayPostgres));
        registro
    }

    pub fn registrar(&mut self, proveedor: Box<dyn GatewayProvider>) {
        self.proveedores_gateway.push(proveedor);
    }

    pub fn proveedor(&self, id: &str) -> Option<&dyn GatewayProvider> {
        self.proveedores_gateway
            .iter()
            .map(|p| p.as_ref())
            .find(|p| p.id() == id)
    }

    pub fn proveedores(&self) -> impl Iterator<Item = &dyn GatewayProvider> {
        self.proveedores_gateway.iter().map(|p| p.as_ref())
    }
}

impl Default for PluginRegistry {
    fn default() -> Self {
        Self::nuevo()
    }
}

/// Boceto del descubrimiento de plugins externos — **no implementado**.
///
/// Dirección elegida para cuando se implemente: escanear `directorio` en
/// busca de subcarpetas con un `manifest.json` (deserializable a
/// [`PluginManifest`]) junto a un componente WASM, en vez de cargar
/// `.dll`/`.so`/`.dylib` nativos directamente — un componente WASM corre
/// aislado (sandboxed) y es portable entre plataformas, igual que el
/// extension host de VS Code aísla cada extensión en su propio proceso. Esa
/// carga (parseo de manifiestos + instanciar el runtime WASM) es trabajo
/// futuro; hoy esta función solo documenta el contrato y no toca disco.
pub fn descubrir_externos(_directorio: &Path) -> Result<Vec<PluginManifest>, GatewayError> {
    Ok(Vec::new())
}
