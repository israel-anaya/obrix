//! Cache valuado de un renglón de receta dentro de un
//! `equipo_costo_horario_costo` — `costo`/`importe` los deriva
//! `EquipoCostoHorarioCostoService::recalcular_valuacion`. Las filas
//! nacen/mueren junto con la receta (`EquipoCostoHorarioDetalleService`) o
//! al materializar el cache de una zona
//! (`EquipoCostoHorarioCostoService::asegurar_zonas`). `cantidad` no vive
//! aquí: es de `equipo_costo_horario_detalle`.

use obrix_db::PortafolioRepository;
use obrix_db::entities::equipo_costo_horario_costo_detalle;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

use crate::ServiceError;

pub struct EquipoCostoHorarioCostoDetalleService;

impl EquipoCostoHorarioCostoDetalleService {
    pub async fn listar_por_costo(
        repo: &dyn PortafolioRepository,
        equipo_costo_horario_costo_id: &str,
    ) -> Result<Vec<equipo_costo_horario_costo_detalle::Model>, ServiceError> {
        Ok(equipo_costo_horario_costo_detalle::Entity::find()
            .filter(
                equipo_costo_horario_costo_detalle::Column::EquipoCostoHorarioCostoId
                    .eq(equipo_costo_horario_costo_id),
            )
            .filter(equipo_costo_horario_costo_detalle::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }
}
