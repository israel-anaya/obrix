use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Tabla de referencia (no cuelga de `insumo`): porcentaje de cada
        // rubro de costo horario que aplica cuando el equipo está inactivo
        // ("en espera" o "en reserva"), según el criterio de la
        // dependencia/cámara publicante — ver diccionario de datos. Fuente
        // de verdad del sembrado en `data/initial/perfil_inactividad_equipo.csv`.
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
                    .col(ColumnDef::new(PerfilInactividadEquipo::Tipo).text().not_null())
                    .col(ColumnDef::new(PerfilInactividadEquipo::Rubro).text().not_null())
                    .col(ColumnDef::new(PerfilInactividadEquipo::Perfil).text().not_null())
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::Valor)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(PerfilInactividadEquipo::UpdatedAt).text())
                    .col(
                        ColumnDef::new(PerfilInactividadEquipo::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(PerfilInactividadEquipo::UpdatedBy).text())
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
                    .index(
                        Index::create()
                            .name("idx-perfil_inactividad_equipo-tipo-rubro-perfil")
                            .col(PerfilInactividadEquipo::Tipo)
                            .col(PerfilInactividadEquipo::Rubro)
                            .col(PerfilInactividadEquipo::Perfil)
                            .unique(),
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
enum Usuario {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum PerfilInactividadEquipo {
    Table,
    Id,
    Tipo,
    Rubro,
    Perfil,
    Valor,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}
