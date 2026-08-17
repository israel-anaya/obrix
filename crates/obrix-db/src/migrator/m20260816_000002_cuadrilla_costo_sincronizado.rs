use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(CuadrillaCosto::Table)
                    .add_column(ColumnDef::new(CuadrillaCosto::SincronizadoEn).text())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(CuadrillaCostoDetalle::Table)
                    .add_column(ColumnDef::new(CuadrillaCostoDetalle::FechaPrecio).text())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(CuadrillaCostoDetalle::Table)
                    .drop_column(CuadrillaCostoDetalle::FechaPrecio)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(CuadrillaCosto::Table)
                    .drop_column(CuadrillaCosto::SincronizadoEn)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum CuadrillaCosto {
    Table,
    SincronizadoEn,
}

#[derive(DeriveIden)]
enum CuadrillaCostoDetalle {
    Table,
    FechaPrecio,
}
