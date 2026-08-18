use std::path::{Path, PathBuf};

use sea_orm::{Database, DatabaseConnection};
use sea_orm_migration::MigratorTrait;

use crate::DbError;
use crate::migrator::Migrator;

/// Abstrae el acceso a los datos de un portafolio — hoy un archivo SQLite
/// local, a futuro también un servidor remoto (Postgres). El resto de la
/// app (comandos de Tauri, servicios) solo conoce esta interfaz, nunca el
/// backend concreto.
pub trait PortafolioRepository: Send + Sync {
    fn conexion(&self) -> &DatabaseConnection;
}

/// Implementación de [`PortafolioRepository`] respaldada por un archivo
/// SQLite local — el contenedor que el usuario crea o abre desde la
/// pantalla de inicio. Un mismo portafolio puede contener varios `proyecto`
/// (obras).
pub struct PortafolioSqliteRepository {
    conn: DatabaseConnection,
    path: PathBuf,
}

impl PortafolioSqliteRepository {
    /// Crea un portafolio nuevo en `path`. Falla si el archivo ya existe —
    /// usar `abrir` para reabrir uno existente.
    pub async fn crear(path: &Path) -> Result<Self, DbError> {
        if path != Path::new(":memory:") && path.exists() {
            return Err(DbError::PortafolioYaExiste(path.to_path_buf()));
        }
        Self::conectar_y_migrar(path).await
    }

    /// Abre un portafolio existente en `path`. Falla si el archivo no existe.
    pub async fn abrir(path: &Path) -> Result<Self, DbError> {
        if path != Path::new(":memory:") && !path.exists() {
            return Err(DbError::PortafolioNoExiste(path.to_path_buf()));
        }
        Self::conectar_y_migrar(path).await
    }

    async fn conectar_y_migrar(path: &Path) -> Result<Self, DbError> {
        let url = if path == Path::new(":memory:") {
            "sqlite::memory:".to_string()
        } else {
            format!("sqlite:{}?mode=rwc", path.display())
        };
        let conn = Database::connect(url).await?;
        Migrator::up(&conn, None).await?;
        Ok(Self {
            conn,
            path: path.to_path_buf(),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl PortafolioRepository for PortafolioSqliteRepository {
    fn conexion(&self) -> &DatabaseConnection {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::EntityTrait;

    #[tokio::test]
    async fn crea_portafolio_en_memoria_y_aplica_migraciones() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("debe crear y migrar el portafolio");

        let organizaciones = crate::entities::organizacion::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("debe poder consultar la tabla organizacion");

        assert!(
            organizaciones.is_empty(),
            "portafolio nuevo no debe tener organizaciones"
        );
    }

    #[tokio::test]
    async fn organizacion_cliente_persisten_y_respetan_la_fk() {
        use crate::entities::{cliente, moneda, organizacion, usuario};
        use sea_orm::{ActiveModelTrait, ActiveValue::Set};

        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-06T00:00:00Z".to_string();

        let admin = usuario::ActiveModel {
            id: Set("usr-admin".into()),
            nombre: Set("Admin".into()),
            correo: Set("admin@obrix.local".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(now.clone()),
            created_by: Set(None),
            updated_at: Set(None),
            updated_by: Set(None),
        };
        admin
            .insert(portafolio.conexion())
            .await
            .expect("insertar usuario admin");

        let mxn = moneda::ActiveModel {
            id: Set("mon-mxn".into()),
            codigo: Set("MXN".into()),
            nombre: Set("Peso mexicano".into()),
            simbolo: Set("$".into()),
            decimales: Set(2),
            created_at: Set(now.clone()),
            created_by: Set("usr-admin".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        };
        mxn.insert(portafolio.conexion())
            .await
            .expect("insertar moneda mxn");

        let org = organizacion::ActiveModel {
            id: Set("org-1".into()),
            razon_social: Set("Despacho demo".into()),
            rfc: Set("XAXX010101000".into()),
            tipo: Set(organizacion::TipoOrganizacion::Despacho),
            moneda_default_id: Set("mon-mxn".into()),
            horas_jornada: Set(rust_decimal::Decimal::from(8)),
            created_at: Set(now.clone()),
            created_by: Set("usr-admin".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        };
        org.insert(portafolio.conexion())
            .await
            .expect("insertar organizacion");

        let cli = cliente::ActiveModel {
            id: Set("cli-1".into()),
            organizacion_id: Set("org-1".into()),
            razon_social: Set("Cliente demo".into()),
            rfc: Set("XAXX010101000".into()),
            tipo: Set(cliente::TipoCliente::Privado),
            contacto_nombre: Set(None),
            contacto_correo: Set(None),
            contacto_telefono: Set(None),
            domicilio_fiscal: Set(None),
            created_at: Set(now),
            created_by: Set("usr-admin".into()),
            updated_at: Set(None),
            updated_by: Set(None),
            deleted: Set(false),
            deleted_at: Set(None),
            deleted_by: Set(None),
        };
        cli.insert(portafolio.conexion())
            .await
            .expect("insertar cliente referenciando la organizacion");

        let clientes = cliente::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar clientes");
        assert_eq!(clientes.len(), 1);
        assert_eq!(clientes[0].organizacion_id, "org-1");
    }
}
