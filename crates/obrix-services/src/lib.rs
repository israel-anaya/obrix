//! Capa de negocio: un `Service` por entidad, entre los comandos de Tauri y
//! `PortafolioRepository`. No conoce Tauri ni el protocolo de IPC — recibe
//! `&dyn PortafolioRepository` (y, para las entidades que lo necesitan, el
//! `organizacion_id` activo) y devuelve `ServiceError`, no `String`; los
//! comandos son quienes traducen ese error a texto para el frontend.

pub mod categoria_fasar;
pub mod cliente;
pub mod cuadrilla;
pub mod cuadrilla_detalle;
pub mod equipo_costo_horario;
pub mod equipo_costo_horario_detalle;
pub mod factor_salario_real;
pub mod familia_insumo;
pub mod herramienta;
pub mod material;
pub mod moneda;
pub mod organizacion;
pub mod organizacion_usuario;
pub mod precio_material;
pub mod proveedor;
pub mod region;
pub mod salario_categoria_fasar;
pub mod unidad_medida;
pub mod usuario;

pub mod seed;

#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error("no encontrado: {0}")]
    NoEncontrado(String),
    #[error(transparent)]
    Db(#[from] sea_orm::DbErr),
    #[error("{0}")]
    Validacion(String),
}

/// Datos default de una entidad. Cada `Service` que quiera precargar algo
/// implementa esto en su propio archivo — así el sembrado no vive en un
/// solo archivo gigante, cada entidad es dueña de sus propios datos
/// iniciales. `sembrar` debe ser idempotente (no duplicar si ya hay datos).
pub trait DatosIniciales {
    fn sembrar(
        repo: &dyn obrix_db::PortafolioRepository,
    ) -> impl std::future::Future<Output = Result<(), ServiceError>> + Send;
}

/// Id único para un nuevo registro.
pub fn nuevo_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Timestamp actual en el formato usado por `created_at`/`updated_at`.
pub fn ahora() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Fecha actual (sin hora), para columnas de solo fecha como `fecha_vigencia_desde`.
pub fn hoy() -> String {
    chrono::Utc::now().date_naive().to_string()
}
