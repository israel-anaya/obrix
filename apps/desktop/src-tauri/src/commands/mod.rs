pub const EVENTO_CSV_PROGRESO: &str = "csv-progreso";

#[derive(Clone, serde::Serialize)]
pub struct CsvProgresoPayload {
    pub actual: u32,
    pub total: u32,
}

pub mod archivo_json;
pub mod auth;
pub mod basicos_auxiliares;
pub mod categorias_fasar;
pub mod clientes;
pub mod cuadrillas;
pub mod equipos_costo_horario;
pub mod factores_salario_real;
pub mod familias_insumo;
pub mod herramientas;
pub mod materiales;
pub mod monedas;
pub mod organizaciones;
pub mod perfiles_inactividad_equipo;
pub mod portafolio;
pub mod precios_material;
pub mod proveedores;
pub mod regiones;
pub mod salarios_categoria_fasar;
pub mod unidades_medida;
pub mod usuarios;
