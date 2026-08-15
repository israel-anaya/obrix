use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Receta reutilizable (no cuelga de `insumo`, igual que
        // `factor_salario_real`): porcentaje de cada rubro de costo horario
        // que aplica cuando un equipo está inactivo ("en espera" o "en
        // reserva") — ver diccionario de datos. Varios equipos pueden
        // compartir el mismo perfil; `activo = false` lo saca del catálogo
        // sin borrar el vínculo de equipos que ya lo usan.
        manager
            .create_table(
                Table::create()
                    .table(PerfilInactividadEquipo::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::OrganizacionId)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(PerfilInactividadEquipo::Nombre).text().not_null())
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::EsperaDepreciacionPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::EsperaInversionPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::EsperaSeguroPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::EsperaMantenimientoPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::EsperaConsumoPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::EsperaOperacionPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaDepreciacionPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaInversionPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaSeguroPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaMantenimientoPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaConsumoPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaOperacionPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::Activo)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(PerfilInactividadEquipo::UpdatedAt).text())
                    .col(ColumnDef::new(PerfilInactividadEquipo::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(PerfilInactividadEquipo::Table, PerfilInactividadEquipo::OrganizacionId)
                            .to(Organizacion::Table, Organizacion::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(PerfilInactividadEquipo::Table, PerfilInactividadEquipo::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(PerfilInactividadEquipo::Table, PerfilInactividadEquipo::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(PerfilInactividadEquipo::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum Organizacion {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Usuario {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum PerfilInactividadEquipo {
    Table,
    Id,
    OrganizacionId,
    Nombre,
    EsperaDepreciacionPorcentaje,
    EsperaInversionPorcentaje,
    EsperaSeguroPorcentaje,
    EsperaMantenimientoPorcentaje,
    EsperaConsumoPorcentaje,
    EsperaOperacionPorcentaje,
    ReservaDepreciacionPorcentaje,
    ReservaInversionPorcentaje,
    ReservaSeguroPorcentaje,
    ReservaMantenimientoPorcentaje,
    ReservaConsumoPorcentaje,
    ReservaOperacionPorcentaje,
    Activo,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
}
