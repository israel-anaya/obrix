use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::str::FromStr;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migrate(#[from] sqlx::migrate::MigrateError),
}

/// Abre (creando si no existe) la base de datos local de un proyecto y
/// aplica las migraciones pendientes. `path` es la ruta a un archivo `.db`,
/// o `:memory:` para pruebas.
pub async fn open_proyecto(path: &str) -> Result<SqlitePool, DbError> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite:{path}"))?.create_if_missing(true);
    let pool = SqlitePoolOptions::new().connect_with(options).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn abre_base_en_memoria_y_aplica_migraciones() {
        let pool = open_proyecto(":memory:").await.expect("debe abrir y migrar");

        let tablas: Vec<(String,)> = sqlx::query_as(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'proyecto'",
        )
        .fetch_all(&pool)
        .await
        .expect("debe poder consultar sqlite_master");

        assert_eq!(tablas.len(), 1, "la tabla 'proyecto' debe existir tras migrar");
    }
}
