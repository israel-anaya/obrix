mod entities;
mod migrator;
mod routes;

use sea_orm::Database;
use sea_orm_migration::MigratorTrait;
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL debe estar definida (ej. postgres://obrix:obrix_dev_password@localhost:5432/obrix_licensing)");

    let db = Database::connect(&database_url)
        .await
        .expect("no se pudo conectar a la base de datos de licenciamiento");

    migrator::Migrator::up(&db, None)
        .await
        .expect("fallo al aplicar migraciones de licensing-server");

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8081);

    let app = routes::router(db);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("licensing-server escuchando en {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
