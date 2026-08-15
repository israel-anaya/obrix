use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;

/// Receta reutilizable (no cuelga de `insumo`, igual que
/// `factor_salario_real`): porcentaje de cada rubro de costo horario que
/// aplica cuando un equipo está inactivo, ver diccionario de datos. Cada
/// porcentaje (0-100) se aplica al rubro activo que ya cachea
/// `equipo_costo_horario` — los cuatro cargos fijos por separado más
/// `subtotal_consumo` y `subtotal_operacion`. Varios equipos pueden
/// compartir el mismo perfil; `activo = false` lo saca del catálogo sin
/// borrar el vínculo de equipos que ya lo usan.
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
    pub espera_consumo_porcentaje: Decimal,
    pub espera_operacion_porcentaje: Decimal,
    pub reserva_depreciacion_porcentaje: Decimal,
    pub reserva_inversion_porcentaje: Decimal,
    pub reserva_seguro_porcentaje: Decimal,
    pub reserva_mantenimiento_porcentaje: Decimal,
    pub reserva_consumo_porcentaje: Decimal,
    pub reserva_operacion_porcentaje: Decimal,
    pub activo: bool,
    pub created_at: String,
    pub created_by: String,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
