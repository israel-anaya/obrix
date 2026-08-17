use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Receta reutilizable (no cuelga de `insumo`, igual que
        // `factor_salario_real`): porcentaje de cada rubro de costo horario
        // que aplica cuando un equipo está inactivo ("en espera" o "en
        // reserva") — ver diccionario de datos. El consumo va partido por
        // naturaleza (combustible, lubricante, llantas), no un % sobre
        // `subtotal_consumo`. Varios equipos pueden compartir el mismo
        // perfil; el borrado es lógico (`deleted`) y no rompe el vínculo de
        // equipos que ya lo usan.
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
                        ColumnDef::new(PerfilInactividadEquipo::EsperaCombustiblePorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::EsperaLubricantePorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::EsperaLlantasPorcentaje)
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
                        ColumnDef::new(PerfilInactividadEquipo::ReservaCombustiblePorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaLubricantePorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaLlantasPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::ReservaOperacionPorcentaje)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
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
                    .col(ColumnDef::new(PerfilInactividadEquipo::DeletedAt).text())
                    .col(ColumnDef::new(PerfilInactividadEquipo::DeletedBy).text())
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
                    .foreign_key(
                        ForeignKey::create()
                            .from(PerfilInactividadEquipo::Table, PerfilInactividadEquipo::DeletedBy)
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
    EsperaCombustiblePorcentaje,
    EsperaLubricantePorcentaje,
    EsperaLlantasPorcentaje,
    EsperaOperacionPorcentaje,
    ReservaDepreciacionPorcentaje,
    ReservaInversionPorcentaje,
    ReservaSeguroPorcentaje,
    ReservaMantenimientoPorcentaje,
    ReservaCombustiblePorcentaje,
    ReservaLubricantePorcentaje,
    ReservaLlantasPorcentaje,
    ReservaOperacionPorcentaje,
    Deleted,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
    DeletedAt,
    DeletedBy,
}
