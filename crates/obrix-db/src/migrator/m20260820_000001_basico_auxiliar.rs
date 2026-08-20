use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(BasicoAuxiliar::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(BasicoAuxiliar::InsumoId)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BasicoAuxiliar::Table, BasicoAuxiliar::InsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BasicoAuxiliarComponente::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::BasicoAuxiliarId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::ComponenteInsumoId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::Tipo)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::Naturaleza)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::Orden)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarComponente::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(BasicoAuxiliarComponente::UpdatedAt).text())
                    .col(ColumnDef::new(BasicoAuxiliarComponente::UpdatedBy).text())
                    .col(ColumnDef::new(BasicoAuxiliarComponente::DeletedAt).text())
                    .col(ColumnDef::new(BasicoAuxiliarComponente::DeletedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarComponente::Table,
                                BasicoAuxiliarComponente::BasicoAuxiliarId,
                            )
                            .to(BasicoAuxiliar::Table, BasicoAuxiliar::InsumoId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarComponente::Table,
                                BasicoAuxiliarComponente::ComponenteInsumoId,
                            )
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarComponente::Table,
                                BasicoAuxiliarComponente::CreatedBy,
                            )
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarComponente::Table,
                                BasicoAuxiliarComponente::UpdatedBy,
                            )
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarComponente::Table,
                                BasicoAuxiliarComponente::DeletedBy,
                            )
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BasicoAuxiliarCosto::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::BasicoAuxiliarId)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(BasicoAuxiliarCosto::RegionId).text())
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::SubTotalMaterial)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::SubTotalManoObra)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::SubTotalEquipo)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::SubTotalBasicoAuxiliar)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::CostoTotal)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(BasicoAuxiliarCosto::FechaCosto).text())
                    .col(ColumnDef::new(BasicoAuxiliarCosto::SincronizadoEn).text())
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCosto::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(BasicoAuxiliarCosto::UpdatedAt).text())
                    .col(ColumnDef::new(BasicoAuxiliarCosto::UpdatedBy).text())
                    .col(ColumnDef::new(BasicoAuxiliarCosto::DeletedAt).text())
                    .col(ColumnDef::new(BasicoAuxiliarCosto::DeletedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarCosto::Table,
                                BasicoAuxiliarCosto::BasicoAuxiliarId,
                            )
                            .to(BasicoAuxiliar::Table, BasicoAuxiliar::InsumoId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BasicoAuxiliarCosto::Table, BasicoAuxiliarCosto::RegionId)
                            .to(Region::Table, Region::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BasicoAuxiliarCosto::Table, BasicoAuxiliarCosto::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BasicoAuxiliarCosto::Table, BasicoAuxiliarCosto::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(BasicoAuxiliarCosto::Table, BasicoAuxiliarCosto::DeletedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(BasicoAuxiliarCostoDetalle::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::BasicoAuxiliarCostoId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::BasicoAuxiliarComponenteId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::Cantidad)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::Rendimiento)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::Costo)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::Importe)
                            .decimal()
                            .not_null(),
                    )
                    .col(ColumnDef::new(BasicoAuxiliarCostoDetalle::FechaPrecio).text())
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::UsaCostoNacional)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(BasicoAuxiliarCostoDetalle::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(BasicoAuxiliarCostoDetalle::UpdatedAt).text())
                    .col(ColumnDef::new(BasicoAuxiliarCostoDetalle::UpdatedBy).text())
                    .col(ColumnDef::new(BasicoAuxiliarCostoDetalle::DeletedAt).text())
                    .col(ColumnDef::new(BasicoAuxiliarCostoDetalle::DeletedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarCostoDetalle::Table,
                                BasicoAuxiliarCostoDetalle::BasicoAuxiliarCostoId,
                            )
                            .to(BasicoAuxiliarCosto::Table, BasicoAuxiliarCosto::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarCostoDetalle::Table,
                                BasicoAuxiliarCostoDetalle::BasicoAuxiliarComponenteId,
                            )
                            .to(
                                BasicoAuxiliarComponente::Table,
                                BasicoAuxiliarComponente::Id,
                            )
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarCostoDetalle::Table,
                                BasicoAuxiliarCostoDetalle::CreatedBy,
                            )
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarCostoDetalle::Table,
                                BasicoAuxiliarCostoDetalle::UpdatedBy,
                            )
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                BasicoAuxiliarCostoDetalle::Table,
                                BasicoAuxiliarCostoDetalle::DeletedBy,
                            )
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(BasicoAuxiliarCostoDetalle::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(BasicoAuxiliarCosto::Table).to_owned())
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(BasicoAuxiliarComponente::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(BasicoAuxiliar::Table).to_owned())
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
enum Region {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum BasicoAuxiliar {
    Table,
    InsumoId,
}

#[derive(DeriveIden)]
enum BasicoAuxiliarComponente {
    Table,
    Id,
    BasicoAuxiliarId,
    ComponenteInsumoId,
    Tipo,
    Naturaleza,
    Orden,
    Deleted,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
    DeletedAt,
    DeletedBy,
}

#[derive(DeriveIden)]
enum BasicoAuxiliarCosto {
    Table,
    Id,
    BasicoAuxiliarId,
    RegionId,
    SubTotalMaterial,
    SubTotalManoObra,
    SubTotalEquipo,
    SubTotalBasicoAuxiliar,
    CostoTotal,
    FechaCosto,
    SincronizadoEn,
    Deleted,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
    DeletedAt,
    DeletedBy,
}

#[derive(DeriveIden)]
enum BasicoAuxiliarCostoDetalle {
    Table,
    Id,
    BasicoAuxiliarCostoId,
    BasicoAuxiliarComponenteId,
    Cantidad,
    Rendimiento,
    Costo,
    Importe,
    FechaPrecio,
    UsaCostoNacional,
    Deleted,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
    DeletedAt,
    DeletedBy,
}
