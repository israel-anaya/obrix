use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // `equipo_costo_horario` es la extensión 1:1 de `insumo` para
        // `tipo = equipo_herramienta` cuando se trata de equipo propio
        // costado por depreciación/consumo (metodología SCT/CMIC), a
        // diferencia de `herramienta` (sin depreciación) y `equipo_rentado`
        // (de terceros) — ver diccionario de datos. Los campos `cf_*` de
        // cache se recalculan en
        // `EquipoCostoHorarioService::calcular_cargos_fijos`;
        // `cargo_variable_hora`/`costo_horario_total` los recalcula
        // `EquipoCostoHorarioDetalleService::recalcular`.
        manager
            .create_table(
                Table::create()
                    .table(EquipoCostoHorario::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(EquipoCostoHorario::InsumoId)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(EquipoCostoHorario::RegionId).text())
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfCostoMaquina)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfValorLlantas)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfValorPiezasEspeciales)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfValorMaquina)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfValorRescatePorcentaje)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfValorRescate)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfVidaEconomicaAnios)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfHorasUsoAnual)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfVidaUtilHoras)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfTasaInteresAnualPorcentaje)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfTasaSegurosAnualPorcentaje)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfMantenimientoPorcentaje)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfDepreciacionHora)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfInversionHora)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfSeguroHora)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfMantenimientoHora)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CfCargoFijoHora)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CargoVariableHora)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorario::CostoHorarioTotal)
                            .decimal()
                            .not_null()
                            .default(0),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(EquipoCostoHorario::Table, EquipoCostoHorario::InsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(EquipoCostoHorario::Table, EquipoCostoHorario::RegionId)
                            .to(Region::Table, Region::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // Composición plana de un equipo_costo_horario — cada fila es un
        // consumo (material) o una operación (categoria_fasar/cuadrilla),
        // nunca otro equipo_costo_horario (misma nota "no recursiva" que
        // `cuadrilla_detalle`).
        manager
            .create_table(
                Table::create()
                    .table(EquipoCostoHorarioDetalle::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(EquipoCostoHorarioDetalle::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorarioDetalle::EquipoCostoHorarioInsumoId)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorarioDetalle::DetalleInsumoId)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(EquipoCostoHorarioDetalle::Tipo).text().not_null())
                    .col(ColumnDef::new(EquipoCostoHorarioDetalle::Orden).integer().not_null())
                    .col(
                        ColumnDef::new(EquipoCostoHorarioDetalle::Cantidad)
                            .decimal()
                            .not_null(),
                    )
                    .col(ColumnDef::new(EquipoCostoHorarioDetalle::Costo).decimal().not_null())
                    .col(
                        ColumnDef::new(EquipoCostoHorarioDetalle::Importe)
                            .decimal()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorarioDetalle::CreatedAt)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(EquipoCostoHorarioDetalle::CreatedBy)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(EquipoCostoHorarioDetalle::UpdatedAt).text())
                    .col(ColumnDef::new(EquipoCostoHorarioDetalle::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(
                                EquipoCostoHorarioDetalle::Table,
                                EquipoCostoHorarioDetalle::EquipoCostoHorarioInsumoId,
                            )
                            .to(EquipoCostoHorario::Table, EquipoCostoHorario::InsumoId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(EquipoCostoHorarioDetalle::Table, EquipoCostoHorarioDetalle::DetalleInsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(EquipoCostoHorarioDetalle::Table, EquipoCostoHorarioDetalle::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(EquipoCostoHorarioDetalle::Table, EquipoCostoHorarioDetalle::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(EquipoCostoHorarioDetalle::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(EquipoCostoHorario::Table).to_owned())
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
enum EquipoCostoHorario {
    Table,
    InsumoId,
    RegionId,
    CfCostoMaquina,
    CfValorLlantas,
    CfValorPiezasEspeciales,
    CfValorMaquina,
    CfValorRescatePorcentaje,
    CfValorRescate,
    CfVidaEconomicaAnios,
    CfHorasUsoAnual,
    CfVidaUtilHoras,
    CfTasaInteresAnualPorcentaje,
    CfTasaSegurosAnualPorcentaje,
    CfMantenimientoPorcentaje,
    CfDepreciacionHora,
    CfInversionHora,
    CfSeguroHora,
    CfMantenimientoHora,
    CfCargoFijoHora,
    CargoVariableHora,
    CostoHorarioTotal,
}

#[derive(DeriveIden)]
enum EquipoCostoHorarioDetalle {
    Table,
    Id,
    EquipoCostoHorarioInsumoId,
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
