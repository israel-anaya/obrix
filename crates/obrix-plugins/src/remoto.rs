//! Conexión a un portafolio remoto (servidor). Vive separado de
//! `PortafolioFactory` (que solo abre/crea portafolios SQLite locales)
//! porque "conectarse a servidor" es la funcionalidad pensada para
//! resolverse vía plugin: [`PortafolioRemotoFactory::conectar`] delega en el
//! [`GatewayProvider`] registrado, que un plugin puede reemplazar para
//! soportar otro backend remoto sin tocar este archivo.

use async_trait::async_trait;
use obrix_db::PortafolioRepository;
use sea_orm::{Database, DatabaseConnection};
use sea_orm_migration::MigratorTrait;

use crate::{GatewayError, GatewayProvider, PluginRegistry, ServidorConfig};

fn url_postgres(config: &ServidorConfig) -> String {
    format!(
        "postgres://{}:{}@{}:{}/{}",
        config.usuario, config.password, config.host, config.puerto, config.base_datos
    )
}

/// Implementación de [`PortafolioRepository`] respaldada por un servidor
/// PostgreSQL en vez de un archivo SQLite local.
pub struct PortafolioPostgresRepository {
    conn: DatabaseConnection,
}

impl PortafolioRepository for PortafolioPostgresRepository {
    fn conexion(&self) -> &DatabaseConnection {
        &self.conn
    }
}

/// Proveedor built-in de [`GatewayProvider`]: conecta a un servidor
/// PostgreSQL real y aplica sobre él las mismas migraciones de
/// `obrix-db` que corren para SQLite.
pub struct ServidorGatewayPostgres;

#[async_trait]
impl GatewayProvider for ServidorGatewayPostgres {
    fn id(&self) -> &str {
        "postgres"
    }

    fn nombre(&self) -> &str {
        "PostgreSQL"
    }

    async fn conectar(&self, config: &ServidorConfig) -> Result<DatabaseConnection, GatewayError> {
        let conn = Database::connect(url_postgres(config)).await?;
        obrix_db::migrator::Migrator::up(&conn, None).await?;
        Ok(conn)
    }
}

/// Fachada para obtener un [`PortafolioRepository`] remoto — la contraparte
/// de `PortafolioFactory` para "conectarse a servidor". La conexión concreta
/// la resuelve el `GatewayProvider` registrado bajo `proveedor_id` (por
/// defecto, `"postgres"`); un plugin externo podría registrar otro backend
/// bajo otro id sin que este método cambie.
pub struct PortafolioRemotoFactory;

impl PortafolioRemotoFactory {
    pub async fn conectar(
        config: &ServidorConfig,
    ) -> Result<Box<dyn PortafolioRepository>, GatewayError> {
        Self::conectar_con(&PluginRegistry::nuevo(), "postgres", config).await
    }

    pub async fn conectar_con(
        registro: &PluginRegistry,
        proveedor_id: &str,
        config: &ServidorConfig,
    ) -> Result<Box<dyn PortafolioRepository>, GatewayError> {
        let proveedor = registro
            .proveedor(proveedor_id)
            .ok_or(GatewayError::NoImplementado)?;
        let conn = proveedor.conectar(config).await?;
        Ok(Box::new(PortafolioPostgresRepository { conn }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arma_la_url_de_conexion_postgres() {
        let config = ServidorConfig {
            host: "db.local".into(),
            puerto: 5432,
            base_datos: "obrix".into(),
            usuario: "obrix".into(),
            password: "secreto".into(),
        };
        assert_eq!(
            url_postgres(&config),
            "postgres://obrix:secreto@db.local:5432/obrix"
        );
    }

    #[test]
    fn el_registro_por_defecto_incluye_el_proveedor_postgres() {
        let registro = PluginRegistry::nuevo();
        let proveedor = registro
            .proveedor("postgres")
            .expect("postgres debe estar registrado por defecto");
        assert_eq!(proveedor.nombre(), "PostgreSQL");
    }
}
