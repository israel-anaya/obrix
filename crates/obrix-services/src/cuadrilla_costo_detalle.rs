//! Cache valuado de un renglón de receta dentro de una `cuadrilla_costo` —
//! `costo`/`importe` los deriva `CuadrillaCostoService::recalcular_valuacion`.
//! Las filas nacen/mueren junto con la receta (`CuadrillaDetalleService`) o
//! junto con una valuación regional (`CuadrillaCostoService::crear_regional`/
//! `eliminar_regional`). `cantidad` no vive aquí: es de `cuadrilla_detalle`.

use obrix_db::entities::cuadrilla_costo_detalle;
use obrix_db::PortafolioRepository;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

use crate::ServiceError;

pub struct CuadrillaCostoDetalleService;

impl CuadrillaCostoDetalleService {
    pub async fn listar_por_costo(
        repo: &dyn PortafolioRepository,
        cuadrilla_costo_id: &str,
    ) -> Result<Vec<cuadrilla_costo_detalle::Model>, ServiceError> {
        Ok(cuadrilla_costo_detalle::Entity::find()
            .filter(cuadrilla_costo_detalle::Column::CuadrillaCostoId.eq(cuadrilla_costo_id))
            .filter(cuadrilla_costo_detalle::Column::Deleted.eq(false))
            .all(repo.conexion())
            .await?)
    }
}
