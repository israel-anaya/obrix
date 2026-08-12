use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // `categoria_fasar` es la extensión 1:1 de `insumo` para
        // `tipo = mano_obra` (trabajador atómico) — ver diccionario de datos.
        manager
            .create_table(
                Table::create()
                    .table(CategoriaFasar::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(CategoriaFasar::InsumoId)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CategoriaFasar::Table, CategoriaFasar::InsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Historial de salario+FSR de una `categoria_fasar` — nunca se
        // sobrescribe, cada vigencia nueva agrega una fila (ver diccionario).
        manager
            .create_table(
                Table::create()
                    .table(SalarioCategoriaFasar::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::InsumoId)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(SalarioCategoriaFasar::RegionId).text())
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::SalarioBaseDiario)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::FactorSalarioRealId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::FactorSalarioReal)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::SalarioRealDiario)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::FechaVigenciaDesde)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(SalarioCategoriaFasar::FechaVigenciaHasta).text())
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(SalarioCategoriaFasar::UpdatedAt).text())
                    .col(
                        ColumnDef::new(SalarioCategoriaFasar::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(SalarioCategoriaFasar::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(SalarioCategoriaFasar::Table, SalarioCategoriaFasar::InsumoId)
                            .to(CategoriaFasar::Table, CategoriaFasar::InsumoId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(SalarioCategoriaFasar::Table, SalarioCategoriaFasar::RegionId)
                            .to(Region::Table, Region::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                SalarioCategoriaFasar::Table,
                                SalarioCategoriaFasar::FactorSalarioRealId,
                            )
                            .to(FactorSalarioReal::Table, FactorSalarioReal::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(SalarioCategoriaFasar::Table, SalarioCategoriaFasar::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(SalarioCategoriaFasar::Table, SalarioCategoriaFasar::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(SalarioCategoriaFasar::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(CategoriaFasar::Table).to_owned())
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
enum Region {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum FactorSalarioReal {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Usuario {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum CategoriaFasar {
    Table,
    InsumoId,
}

#[derive(DeriveIden)]
enum SalarioCategoriaFasar {
    Table,
    Id,
    InsumoId,
    RegionId,
    SalarioBaseDiario,
    FactorSalarioRealId,
    FactorSalarioReal,
    SalarioRealDiario,
    FechaVigenciaDesde,
    FechaVigenciaHasta,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}
