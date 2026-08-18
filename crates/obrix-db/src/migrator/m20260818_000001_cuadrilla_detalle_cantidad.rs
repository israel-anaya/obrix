use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // `cantidad` es definición de la receta (quién + cuántos), no de la
        // valuación regional. El cache por región solo guarda costo/importe
        // derivados de los salarios — ver diccionario de datos.
        manager
            .alter_table(
                Table::alter()
                    .table(CuadrillaDetalle::Table)
                    .add_column(
                        ColumnDef::new(CuadrillaDetalle::Cantidad)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;

        // Copia desde la valuación nacional (region_id IS NULL). Overrides
        // regionales de cantidad, si los había, se descartan a propósito.
        manager
            .get_connection()
            .execute_unprepared(
                "UPDATE cuadrilla_detalle SET cantidad = (
                    SELECT ccd.cantidad
                    FROM cuadrilla_costo_detalle ccd
                    JOIN cuadrilla_costo cc ON cc.id = ccd.cuadrilla_costo_id
                    WHERE ccd.cuadrilla_detalle_id = cuadrilla_detalle.id
                      AND cc.region_id IS NULL
                      AND ccd.deleted = 0
                      AND cc.deleted = 0
                    LIMIT 1
                )
                WHERE EXISTS (
                    SELECT 1
                    FROM cuadrilla_costo_detalle ccd
                    JOIN cuadrilla_costo cc ON cc.id = ccd.cuadrilla_costo_id
                    WHERE ccd.cuadrilla_detalle_id = cuadrilla_detalle.id
                      AND cc.region_id IS NULL
                      AND ccd.deleted = 0
                      AND cc.deleted = 0
                )",
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(CuadrillaCostoDetalle::Table)
                    .drop_column(CuadrillaCostoDetalle::Cantidad)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(CuadrillaCostoDetalle::Table)
                    .add_column(
                        ColumnDef::new(CuadrillaCostoDetalle::Cantidad)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .get_connection()
            .execute_unprepared(
                "UPDATE cuadrilla_costo_detalle SET cantidad = (
                    SELECT d.cantidad
                    FROM cuadrilla_detalle d
                    WHERE d.id = cuadrilla_costo_detalle.cuadrilla_detalle_id
                )",
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(CuadrillaDetalle::Table)
                    .drop_column(CuadrillaDetalle::Cantidad)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum CuadrillaDetalle {
    Table,
    Cantidad,
}

#[derive(DeriveIden)]
enum CuadrillaCostoDetalle {
    Table,
    Cantidad,
}
