use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(CategoriaFsr::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(CategoriaFsr::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(CategoriaFsr::Nombre).text().not_null())
                    .col(ColumnDef::new(CategoriaFsr::CreatedAt).text().not_null())
                    .col(ColumnDef::new(CategoriaFsr::UpdatedAt).text())
                    .col(ColumnDef::new(CategoriaFsr::CreatedBy).text().not_null())
                    .col(ColumnDef::new(CategoriaFsr::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(CategoriaFsr::Table, CategoriaFsr::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CategoriaFsr::Table, CategoriaFsr::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(CategoriaFsr::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum CategoriaFsr {
    Table,
    Id,
    Nombre,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum Usuario {
    Table,
    Id,
}
