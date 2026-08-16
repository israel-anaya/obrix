use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Proveedor::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Proveedor::Id).text().not_null().primary_key())
                    .col(ColumnDef::new(Proveedor::OrganizacionId).text().not_null())
                    .col(ColumnDef::new(Proveedor::RazonSocial).text().not_null())
                    .col(ColumnDef::new(Proveedor::Rfc).text().not_null())
                    .col(ColumnDef::new(Proveedor::Contacto).text())
                    .col(ColumnDef::new(Proveedor::Calificacion).text())
                    .col(
                        ColumnDef::new(Proveedor::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(Proveedor::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Proveedor::CreatedBy).text().not_null())
                    .col(ColumnDef::new(Proveedor::UpdatedAt).text())
                    .col(ColumnDef::new(Proveedor::UpdatedBy).text())
                    .col(ColumnDef::new(Proveedor::DeletedAt).text())
                    .col(ColumnDef::new(Proveedor::DeletedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Proveedor::Table, Proveedor::OrganizacionId)
                            .to(Organizacion::Table, Organizacion::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Proveedor::Table, Proveedor::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Proveedor::Table, Proveedor::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Proveedor::Table, Proveedor::DeletedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // `insumo` es el pivote compartido por material/mano_obra/equipo_herramienta/
        // basico_auxiliar (ver diccionario de datos) — hoy solo `material` tiene
        // tabla de extensión implementada, el resto de `tipo` quedan reservados.
        manager
            .create_table(
                Table::create()
                    .table(Insumo::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Insumo::Id).text().not_null().primary_key())
                    .col(ColumnDef::new(Insumo::OrganizacionId).text().not_null())
                    .col(ColumnDef::new(Insumo::Clave).text().not_null())
                    .col(ColumnDef::new(Insumo::Tipo).text().not_null())
                    .col(ColumnDef::new(Insumo::Descripcion).text().not_null())
                    .col(ColumnDef::new(Insumo::UnidadId).text().not_null())
                    .col(ColumnDef::new(Insumo::FamiliaId).text())
                    .col(ColumnDef::new(Insumo::SubFamiliaId).text())
                    .col(
                        ColumnDef::new(Insumo::Deleted)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(Insumo::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Insumo::CreatedBy).text().not_null())
                    .col(ColumnDef::new(Insumo::UpdatedAt).text())
                    .col(ColumnDef::new(Insumo::UpdatedBy).text())
                    .col(ColumnDef::new(Insumo::DeletedAt).text())
                    .col(ColumnDef::new(Insumo::DeletedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Insumo::Table, Insumo::OrganizacionId)
                            .to(Organizacion::Table, Organizacion::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Insumo::Table, Insumo::UnidadId)
                            .to(UnidadMedida::Table, UnidadMedida::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Insumo::Table, Insumo::FamiliaId)
                            .to(FamiliaInsumo::Table, FamiliaInsumo::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Insumo::Table, Insumo::SubFamiliaId)
                            .to(FamiliaInsumo::Table, FamiliaInsumo::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Insumo::Table, Insumo::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Insumo::Table, Insumo::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Insumo::Table, Insumo::DeletedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Material::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Material::InsumoId)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Material::ProveedorId).text())
                    .col(ColumnDef::new(Material::MermaPorcentaje).integer())
                    .col(ColumnDef::new(Material::Marca).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Material::Table, Material::InsumoId)
                            .to(Insumo::Table, Insumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Material::Table, Material::ProveedorId)
                            .to(Proveedor::Table, Proveedor::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // Historial de precios de `material` — nunca se sobrescribe, cada
        // precio nuevo agrega una fila con su propia vigencia (ver diccionario).
        manager
            .create_table(
                Table::create()
                    .table(PrecioMaterial::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(PrecioMaterial::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(PrecioMaterial::MaterialId).text().not_null())
                    .col(ColumnDef::new(PrecioMaterial::RegionId).text())
                    .col(ColumnDef::new(PrecioMaterial::Precio).decimal().not_null())
                    .col(
                        ColumnDef::new(PrecioMaterial::Moneda)
                            .text()
                            .not_null()
                            .default("MXN"),
                    )
                    .col(
                        ColumnDef::new(PrecioMaterial::FechaVigenciaDesde)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(PrecioMaterial::FechaVigenciaHasta).text())
                    .col(ColumnDef::new(PrecioMaterial::CreatedAt).text().not_null())
                    .col(ColumnDef::new(PrecioMaterial::CreatedBy).text().not_null())
                    .col(ColumnDef::new(PrecioMaterial::UpdatedAt).text())
                    .col(ColumnDef::new(PrecioMaterial::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(PrecioMaterial::Table, PrecioMaterial::MaterialId)
                            .to(Material::Table, Material::InsumoId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(PrecioMaterial::Table, PrecioMaterial::RegionId)
                            .to(Region::Table, Region::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(PrecioMaterial::Table, PrecioMaterial::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(PrecioMaterial::Table, PrecioMaterial::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(PrecioMaterial::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Material::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Insumo::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Proveedor::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Organizacion {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Usuario {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum UnidadMedida {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum FamiliaInsumo {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Region {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum Proveedor {
    Table,
    Id,
    OrganizacionId,
    RazonSocial,
    Rfc,
    Contacto,
    Calificacion,
    Deleted,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
    DeletedAt,
    DeletedBy,
}

#[derive(DeriveIden)]
enum Insumo {
    Table,
    Id,
    OrganizacionId,
    Clave,
    Tipo,
    Descripcion,
    UnidadId,
    FamiliaId,
    SubFamiliaId,
    Deleted,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
    DeletedAt,
    DeletedBy,
}

#[derive(DeriveIden)]
enum Material {
    Table,
    InsumoId,
    ProveedorId,
    MermaPorcentaje,
    Marca,
}

#[derive(DeriveIden)]
enum PrecioMaterial {
    Table,
    Id,
    MaterialId,
    RegionId,
    Precio,
    Moneda,
    FechaVigenciaDesde,
    FechaVigenciaHasta,
    CreatedAt,
    CreatedBy,
    UpdatedAt,
    UpdatedBy,
}
