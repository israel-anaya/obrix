use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(FactorSalarioReal::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(FactorSalarioReal::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(FactorSalarioReal::OrganizacionId)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(FactorSalarioReal::Nombre).text().not_null())
                    .col(ColumnDef::new(FactorSalarioReal::RegionId).text())
                    .col(
                        ColumnDef::new(FactorSalarioReal::ModeloCalculoJson)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(FactorSalarioReal::ParametrosJson)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(FactorSalarioReal::CreatedAt).text().not_null())
                    .col(ColumnDef::new(FactorSalarioReal::CreatedBy).text().not_null())
                    .col(ColumnDef::new(FactorSalarioReal::UpdatedAt).text())
                    .col(ColumnDef::new(FactorSalarioReal::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(FactorSalarioReal::Table, FactorSalarioReal::OrganizacionId)
                            .to(Organizacion::Table, Organizacion::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(FactorSalarioReal::Table, FactorSalarioReal::RegionId)
                            .to(Region::Table, Region::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(FactorSalarioReal::Table, FactorSalarioReal::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(FactorSalarioReal::Table, FactorSalarioReal::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(FactorSalarioReal::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum FactorSalarioReal {
    Table,
    Id,
    OrganizacionId,
    Nombre,
    RegionId,
    ModeloCalculoJson,
    ParametrosJson,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum Organizacion {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Region {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Usuario {
    Table,
    Id,
}
