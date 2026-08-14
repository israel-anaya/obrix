use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // `herramienta` es la extensión 1:1 de `insumo` para
        // `tipo = equipo_herramienta` cuando se trata de herramienta
        // mayor/con motor, precio propio simple, sin cálculo de depreciación
        // (a diferencia de `equipo_costo_horario`) — ver diccionario de datos.
        // Sin precio propio: su costo dentro de una cuadrilla se resuelve
        // como `porcentaje_mano_obra` × `cuadrilla.sub_total_mano_obra`.
        manager
            .create_table(
                Table::create()
                    .table(Herramienta::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Herramienta::InsumoId)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Herramienta::PorcentajeManoObra).integer())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Herramienta::Table, Herramienta::InsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Herramienta::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Insumo {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Herramienta {
    Table,
    InsumoId,
    PorcentajeManoObra,
}
