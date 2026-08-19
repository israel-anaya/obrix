#[derive(Clone)]
pub struct AppState {
    pub http: reqwest::Client,
    pub licensing_server_url: String,
    pub gotrue_url: String,
    pub gotrue_jwt_secret: String,
    pub admin_username: String,
    pub admin_password: String,
    pub admin_session_secret: String,
}

impl AppState {
    pub fn from_env() -> Self {
        Self {
            http: reqwest::Client::new(),
            licensing_server_url: std::env::var("LICENSING_SERVER_URL")
                .unwrap_or_else(|_| "http://licensing-server:8081".to_string()),
            gotrue_url: std::env::var("GOTRUE_URL")
                .unwrap_or_else(|_| "http://gotrue:9999".to_string()),
            gotrue_jwt_secret: std::env::var("GOTRUE_JWT_SECRET")
                .expect("GOTRUE_JWT_SECRET debe estar definida — se usa para firmar el JWT admin que autoriza las llamadas a la API admin de GoTrue"),
            admin_username: std::env::var("ADMIN_USERNAME")
                .expect("ADMIN_USERNAME debe estar definida"),
            admin_password: std::env::var("ADMIN_PASSWORD")
                .expect("ADMIN_PASSWORD debe estar definida"),
            admin_session_secret: std::env::var("ADMIN_SESSION_SECRET")
                .expect("ADMIN_SESSION_SECRET debe estar definida — firma la cookie de sesión del panel"),
        }
    }
}
