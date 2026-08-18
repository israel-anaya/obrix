use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Receta reutilizable (no cuelga de `insumo`, igual que
/// `factor_salario_real`): porcentaje de cada rubro de costo horario que
/// aplica cuando un equipo está inactivo, ver diccionario de datos. Cada
/// porcentaje (0-100) se aplica al rubro activo que ya cachea
/// `equipo_costo_horario` — los cuatro cargos fijos por separado,
/// `subtotal_operacion`, y el consumo partido por naturaleza (combustible,
/// lubricante, llantas, piezas especiales, otras fuentes), no sobre
/// `subtotal_consumo` entero. Varios equipos
/// pueden compartir el mismo perfil; el borrado es lógico (`deleted`) y no
/// rompe el vínculo de equipos que ya lo usan.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, serde::Serialize, serde::Deserialize)]
#[sea_orm(table_name = "perfil_inactividad_equipo")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub organizacion_id: String,
    pub nombre: String,
    pub espera_depreciacion_porcentaje: Decimal,
    pub espera_inversion_porcentaje: Decimal,
    pub espera_seguro_porcentaje: Decimal,
    pub espera_mantenimiento_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `tipo = consumo` y `naturaleza = combustible`.
    pub espera_combustible_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = lubricante`.
    pub espera_lubricante_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = llantas`.
    pub espera_llantas_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = piezas_especiales`.
    pub espera_piezas_especiales_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = otras_fuentes`.
    pub espera_otras_fuentes_porcentaje: Decimal,
    pub espera_operacion_porcentaje: Decimal,
    pub reserva_depreciacion_porcentaje: Decimal,
    pub reserva_inversion_porcentaje: Decimal,
    pub reserva_seguro_porcentaje: Decimal,
    pub reserva_mantenimiento_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = combustible`.
    pub reserva_combustible_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = lubricante`.
    pub reserva_lubricante_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = llantas`.
    pub reserva_llantas_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = piezas_especiales`.
    pub reserva_piezas_especiales_porcentaje: Decimal,
    /// Sobre Σ importe de detalle `naturaleza = otras_fuentes`.
    pub reserva_otras_fuentes_porcentaje: Decimal,
    pub reserva_operacion_porcentaje: Decimal,
    pub deleted: bool,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
    pub deleted_at: Option<String>,
    pub deleted_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
