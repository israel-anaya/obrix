mod m20260806_000001_catalogos_generales;
mod m20260810_000001_insumos_materiales;
mod m20260810_000002_organizacion_moneda_default;
mod m20260810_000004_factor_salario_real;
mod m20260812_000001_categoria_fasar;
mod m20260814_000001_herramienta;
mod m20260814_000002_cuadrilla;

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
        ]
    }
}
