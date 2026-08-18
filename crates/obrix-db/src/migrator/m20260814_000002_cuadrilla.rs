use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // `cuadrilla` es la extensión 1:1 de `insumo` para `tipo = mano_obra`
        // cuando se trata de un equipo de trabajo compuesto (varios
        // trabajadores/herramientas), no un trabajador atómico como
        // `categoria_fasar` — ver diccionario de datos. Los tres subtotales
        // son cache: se recalculan desde `cuadrilla_detalle` cada vez que su
        // composición cambia (ver `CuadrillaDetalleService::recalcular`).
        manager
            .create_table(
                Table::create()
                    .table(Cuadrilla::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Cuadrilla::InsumoId)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Cuadrilla::SubTotalManoObra)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(Cuadrilla::SubTotalHerramienta)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(Cuadrilla::CostoTotal)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Cuadrilla::Table, Cuadrilla::InsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Composición plana de una cuadrilla — cada fila es un miembro
        // (categoria_fasar) o una herramienta (herramienta), nunca otra
        // cuadrilla (ver nota "no recursiva" en el diccionario).
        manager
            .create_table(
                Table::create()
                    .table(CuadrillaDetalle::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(CuadrillaDetalle::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaDetalle::CuadrillaInsumoId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaDetalle::DetalleInsumoId)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(CuadrillaDetalle::Tipo).text().not_null())
                    .col(ColumnDef::new(CuadrillaDetalle::Orden).integer().not_null())
                    .col(
                        ColumnDef::new(CuadrillaDetalle::Cantidad)
                            .decimal()
                            .not_null(),
                    )
                    .col(ColumnDef::new(CuadrillaDetalle::Costo).decimal().not_null())
                    .col(
                        ColumnDef::new(CuadrillaDetalle::Importe)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaDetalle::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaDetalle::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(CuadrillaDetalle::UpdatedAt).text())
                    .col(ColumnDef::new(CuadrillaDetalle::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaDetalle::Table, CuadrillaDetalle::CuadrillaInsumoId)
                            .to(Cuadrilla::Table, Cuadrilla::InsumoId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaDetalle::Table, CuadrillaDetalle::DetalleInsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaDetalle::Table, CuadrillaDetalle::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaDetalle::Table, CuadrillaDetalle::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(CuadrillaDetalle::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Cuadrilla::Table).to_owned())
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
enum Usuario {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Cuadrilla {
    Table,
    InsumoId,
    SubTotalManoObra,
    SubTotalHerramienta,
    CostoTotal,
}

#[derive(DeriveIden)]
enum CuadrillaDetalle {
    Table,
    Id,
    CuadrillaInsumoId,
    DetalleInsumoId,
    Tipo,
    Orden,
    Cantidad,
    Costo,
    Importe,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
}
