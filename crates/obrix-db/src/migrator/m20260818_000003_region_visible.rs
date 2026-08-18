use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Region::Table)
                    .add_column(
                        ColumnDef::new(Region::Visible)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Region::Table)
                    .drop_column(Region::Visible)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum Region {
    Table,
    Visible,
}
