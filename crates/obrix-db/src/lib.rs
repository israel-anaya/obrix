pub mod entities;
pub mod migrator;
pub mod portafolio;

pub use portafolio::{PortafolioRepository, PortafolioSqliteRepository};

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error(transparent)]
    SeaOrm(#[from] sea_orm::DbErr),
    #[error("el portafolio ya existe: {0}")]
    PortafolioYaExiste(std::path::PathBuf),
    #[error("el portafolio no existe: {0}")]
    PortafolioNoExiste(std::path::PathBuf),
}
