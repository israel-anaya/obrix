mod auth;
mod gotrue;
mod licensing;
mod routes;
mod state;

use std::net::SocketAddr;

use state::AppState;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let app_state = AppState::from_env();
    let frontend_dist =
        std::env::var("FRONTEND_DIST").unwrap_or_else(|_| "./static".to_string());

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8090);

    let app = routes::router(app_state, &frontend_dist);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("admin-server escuchando en {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
