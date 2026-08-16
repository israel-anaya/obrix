use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(FamiliaInsumo::Table)
                    .add_column(ColumnDef::new(FamiliaInsumo::InsumosAsociados).text())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(FamiliaInsumo::Table)
                    .drop_column(FamiliaInsumo::InsumosAsociados)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum FamiliaInsumo {
    Table,
    InsumosAsociados,
}
