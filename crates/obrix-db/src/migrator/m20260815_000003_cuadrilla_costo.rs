use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Reemplaza el esquema de `cuadrilla`/`cuadrilla_detalle` de
        // `m20260814_000002_cuadrilla`: separa receta (qué integra el
        // equipo, compartida entre regiones) de valuación (cuánto cuesta en
        // una región concreta) — ver diccionario de datos. Los tres caches
        // que vivían en `cuadrilla` migran a `cuadrilla_costo` (una fila por
        // región); `cuadrilla_detalle` deja de cargar `cantidad`/`costo`/
        // `importe`, eso ahora vive en `cuadrilla_costo_detalle`. Sin
        // compatibilidad con los datos del esquema viejo.
        manager
            .drop_table(Table::drop().table(CuadrillaDetalle::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Cuadrilla::Table).to_owned())
            .await?;

        // `cuadrilla` — extensión 1:1 de `insumo`, tabla delgada, sin cache.
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
                    .foreign_key(
                        ForeignKey::create()
                            .from(Cuadrilla::Table, Cuadrilla::InsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // `cuadrilla_detalle` — composición plana no recursiva (quién
        // integra el equipo), compartida entre regiones. `cantidad`/
        // `costo`/`importe` no viven aquí — varían por región y cuelgan de
        // `cuadrilla_costo_detalle`.
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
                        ColumnDef::new(CuadrillaDetalle::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
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
                    .col(ColumnDef::new(CuadrillaDetalle::DeletedAt).text())
                    .col(ColumnDef::new(CuadrillaDetalle::DeletedBy).text())
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
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaDetalle::Table, CuadrillaDetalle::DeletedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // `cuadrilla_costo` — valuación regional de una cuadrilla; los tres
        // caches que antes vivían en la extensión 1:1. Sin vigencias: se
        // deriva de `salario_categoria_fasar`, que ya historiza por fecha.
        // `region_id` nullable = nacional, toda cuadrilla nace con esa fila.
        manager
            .create_table(
                Table::create()
                    .table(CuadrillaCosto::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(CuadrillaCosto::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCosto::CuadrillaId)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(CuadrillaCosto::RegionId).text())
                    .col(
                        ColumnDef::new(CuadrillaCosto::SubTotalManoObra)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCosto::SubTotalHerramienta)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCosto::CostoTotal)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCosto::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(CuadrillaCosto::CreatedAt).text().not_null())
                    .col(ColumnDef::new(CuadrillaCosto::CreatedBy).text().not_null())
                    .col(ColumnDef::new(CuadrillaCosto::UpdatedAt).text())
                    .col(ColumnDef::new(CuadrillaCosto::UpdatedBy).text())
                    .col(ColumnDef::new(CuadrillaCosto::DeletedAt).text())
                    .col(ColumnDef::new(CuadrillaCosto::DeletedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaCosto::Table, CuadrillaCosto::CuadrillaId)
                            .to(Cuadrilla::Table, Cuadrilla::InsumoId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaCosto::Table, CuadrillaCosto::RegionId)
                            .to(Region::Table, Region::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaCosto::Table, CuadrillaCosto::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaCosto::Table, CuadrillaCosto::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CuadrillaCosto::Table, CuadrillaCosto::DeletedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // `cuadrilla_costo_detalle` — números de un renglón de receta en una
        // valuación. Toda valuación tiene exactamente un renglón por cada
        // `cuadrilla_detalle` de esa cuadrilla; `cantidad` es el único campo
        // capturable, `costo`/`importe` los deriva el recálculo del
        // `cuadrilla_costo` padre.
        manager
            .create_table(
                Table::create()
                    .table(CuadrillaCostoDetalle::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::CuadrillaCostoId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::CuadrillaDetalleId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::Cantidad)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::Costo)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::Importe)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CuadrillaCostoDetalle::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(CuadrillaCostoDetalle::UpdatedAt).text())
                    .col(ColumnDef::new(CuadrillaCostoDetalle::UpdatedBy).text())
                    .col(ColumnDef::new(CuadrillaCostoDetalle::DeletedAt).text())
                    .col(ColumnDef::new(CuadrillaCostoDetalle::DeletedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                CuadrillaCostoDetalle::Table,
                                CuadrillaCostoDetalle::CuadrillaCostoId,
                            )
                            .to(CuadrillaCosto::Table, CuadrillaCosto::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                CuadrillaCostoDetalle::Table,
                                CuadrillaCostoDetalle::CuadrillaDetalleId,
                            )
                            .to(CuadrillaDetalle::Table, CuadrillaDetalle::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                CuadrillaCostoDetalle::Table,
                                CuadrillaCostoDetalle::CreatedBy,
                            )
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                CuadrillaCostoDetalle::Table,
                                CuadrillaCostoDetalle::UpdatedBy,
                            )
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                CuadrillaCostoDetalle::Table,
                                CuadrillaCostoDetalle::DeletedBy,
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
            .drop_table(Table::drop().table(CuadrillaCostoDetalle::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(CuadrillaCosto::Table).to_owned())
            .await?;
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
enum Region {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Cuadrilla {
    Table,
    InsumoId,
}

#[derive(DeriveIden)]
enum CuadrillaDetalle {
    Table,
    Id,
    CuadrillaInsumoId,
    DetalleInsumoId,
    Tipo,
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
enum CuadrillaCosto {
    Table,
    Id,
    CuadrillaId,
    RegionId,
    SubTotalManoObra,
    SubTotalHerramienta,
    CostoTotal,
    Deleted,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
    DeletedAt,
    DeletedBy,
}

#[derive(DeriveIden)]
enum CuadrillaCostoDetalle {
    Table,
    Id,
    CuadrillaCostoId,
    CuadrillaDetalleId,
    Cantidad,
    Costo,
    Importe,
    Deleted,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
    DeletedAt,
    DeletedBy,
}
