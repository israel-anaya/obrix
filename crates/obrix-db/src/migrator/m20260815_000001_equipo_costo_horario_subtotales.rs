use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Desglosa `cargo_variable_hora` en sus dos componentes cacheados —
        // la vista de lista necesita mostrar consumo y operación por
        // separado además de cargos fijos (antes solo se distinguía
        // fijo/variable). `cargo_variable_hora` sigue siendo
        // subtotal_consumo + subtotal_operacion, la mantiene
        // `EquipoCostoHorarioDetalleService::recalcular`.
        manager
            .alter_table(
                Table::alter()
                    .table(EquipoCostoHorario::Table)
                    .add_column(
                        ColumnDef::new(EquipoCostoHorario::SubtotalConsumo)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(EquipoCostoHorario::Table)
                    .add_column(
                        ColumnDef::new(EquipoCostoHorario::SubtotalOperacion)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(EquipoCostoHorario::Table)
                    .drop_column(EquipoCostoHorario::SubtotalOperacion)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(EquipoCostoHorario::Table)
                    .drop_column(EquipoCostoHorario::SubtotalConsumo)
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum EquipoCostoHorario {
    Table,
    SubtotalConsumo,
    SubtotalOperacion,
}
