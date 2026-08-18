mod m20260806_000001_catalogos_generales;
mod m20260810_000001_insumos_materiales;
mod m20260810_000002_organizacion_moneda_default;
mod m20260810_000004_factor_salario_real;
mod m20260812_000001_categoria_fasar;
mod m20260814_000001_herramienta;
mod m20260814_000002_cuadrilla;
mod m20260814_000003_equipo_costo_horario;
mod m20260815_000001_equipo_costo_horario_subtotales;
mod m20260815_000002_perfil_inactividad_equipo;
mod m20260815_000003_cuadrilla_costo;
mod m20260816_000001_familia_insumo_insumos_asociados;
mod m20260816_000002_cuadrilla_costo_sincronizado;
mod m20260817_000001_familia_insumo_icono;
mod m20260818_000001_cuadrilla_detalle_cantidad;
mod m20260818_000002_organizacion_horas_jornada;
mod m20260818_000003_region_visible;
mod m20260818_000004_region_organizacion;

use sea_orm_migration::prelude::*;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260806_000001_catalogos_generales::Migration),
            Box::new(m20260810_000001_insumos_materiales::Migration),
            Box::new(m20260810_000002_organizacion_moneda_default::Migration),
            Box::new(m20260810_000004_factor_salario_real::Migration),
            Box::new(m20260812_000001_categoria_fasar::Migration),
            Box::new(m20260814_000001_herramienta::Migration),
            Box::new(m20260814_000002_cuadrilla::Migration),
            Box::new(m20260814_000003_equipo_costo_horario::Migration),
            Box::new(m20260815_000001_equipo_costo_horario_subtotales::Migration),
            Box::new(m20260815_000002_perfil_inactividad_equipo::Migration),
            Box::new(m20260815_000003_cuadrilla_costo::Migration),
            Box::new(m20260816_000001_familia_insumo_insumos_asociados::Migration),
            Box::new(m20260816_000002_cuadrilla_costo_sincronizado::Migration),
            Box::new(m20260817_000001_familia_insumo_icono::Migration),
            Box::new(m20260818_000001_cuadrilla_detalle_cantidad::Migration),
            Box::new(m20260818_000002_organizacion_horas_jornada::Migration),
            Box::new(m20260818_000003_region_visible::Migration),
            Box::new(m20260818_000004_region_organizacion::Migration),
        ]
    }
}
