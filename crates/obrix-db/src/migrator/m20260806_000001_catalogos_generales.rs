use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // `usuario` se crea primero: el resto de tablas usan `created_by`/
        // `updated_by` como FK → `usuario.id`, así que tiene que existir
        // antes que ellas (incluida `organizacion`). El propio `usuario` se
        // referencia a sí mismo para sus `created_by`/`updated_by`, lo cual
        // sí es válido dentro del mismo `CREATE TABLE`.
        manager
            .create_table(
                Table::create()
                    .table(Usuario::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Usuario::Id).text().not_null().primary_key())
                    .col(ColumnDef::new(Usuario::Nombre).text().not_null())
                    .col(
                        ColumnDef::new(Usuario::Correo)
                            .text()
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(Usuario::Rol).text().not_null())
                    .col(
                        ColumnDef::new(Usuario::Activo)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(ColumnDef::new(Usuario::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Usuario::UpdatedAt).text())
                    .col(ColumnDef::new(Usuario::CreatedBy).text())
                    .col(ColumnDef::new(Usuario::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Usuario::Table, Usuario::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Usuario::Table, Usuario::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Organizacion::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Organizacion::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Organizacion::RazonSocial).text().not_null())
                    .col(ColumnDef::new(Organizacion::Rfc).text().not_null())
                    .col(ColumnDef::new(Organizacion::Tipo).text().not_null())
                    .col(ColumnDef::new(Organizacion::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Organizacion::UpdatedAt).text())
                    .col(ColumnDef::new(Organizacion::CreatedBy).text().not_null())
                    .col(ColumnDef::new(Organizacion::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Organizacion::Table, Organizacion::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Organizacion::Table, Organizacion::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // Membresía: qué organizaciones puede ver un usuario (identidad
        // global, ver entidad `usuario`). `activo` revoca el acceso a esta
        // organización sin borrar la cuenta ni la membresía.
        manager
            .create_table(
                Table::create()
                    .table(OrganizacionUsuario::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(OrganizacionUsuario::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(OrganizacionUsuario::OrganizacionId)
                            .text()
                            .not_null(),
                    )
                    .col(ColumnDef::new(OrganizacionUsuario::UsuarioId).text().not_null())
                    .col(
                        ColumnDef::new(OrganizacionUsuario::Activo)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(ColumnDef::new(OrganizacionUsuario::CreatedAt).text().not_null())
                    .col(ColumnDef::new(OrganizacionUsuario::UpdatedAt).text())
                    .col(ColumnDef::new(OrganizacionUsuario::CreatedBy).text().not_null())
                    .col(ColumnDef::new(OrganizacionUsuario::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(OrganizacionUsuario::Table, OrganizacionUsuario::OrganizacionId)
                            .to(Organizacion::Table, Organizacion::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(OrganizacionUsuario::Table, OrganizacionUsuario::UsuarioId)
                            .to(Usuario::Table, Usuario::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(OrganizacionUsuario::Table, OrganizacionUsuario::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(OrganizacionUsuario::Table, OrganizacionUsuario::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .index(
                        Index::create()
                            .name("idx-organizacion_usuario-organizacion_id-usuario_id")
                            .col(OrganizacionUsuario::OrganizacionId)
                            .col(OrganizacionUsuario::UsuarioId)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Cliente::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Cliente::Id).text().not_null().primary_key())
                    .col(ColumnDef::new(Cliente::OrganizacionId).text().not_null())
                    .col(ColumnDef::new(Cliente::RazonSocial).text().not_null())
                    .col(ColumnDef::new(Cliente::Rfc).text().not_null())
                    .col(ColumnDef::new(Cliente::Tipo).text().not_null())
                    .col(ColumnDef::new(Cliente::ContactoNombre).text())
                    .col(ColumnDef::new(Cliente::ContactoCorreo).text())
                    .col(ColumnDef::new(Cliente::ContactoTelefono).text())
                    .col(ColumnDef::new(Cliente::DomicilioFiscal).text())
                    .col(ColumnDef::new(Cliente::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Cliente::UpdatedAt).text())
                    .col(ColumnDef::new(Cliente::CreatedBy).text().not_null())
                    .col(ColumnDef::new(Cliente::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Cliente::Table, Cliente::OrganizacionId)
                            .to(Organizacion::Table, Organizacion::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Cliente::Table, Cliente::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Cliente::Table, Cliente::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(UnidadMedida::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(UnidadMedida::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(UnidadMedida::Simbolo).text().not_null())
                    .col(ColumnDef::new(UnidadMedida::SimboloImpresion).text().not_null())
                    .col(ColumnDef::new(UnidadMedida::Variantes).text().not_null())
                    .col(ColumnDef::new(UnidadMedida::ClaveSat).text())
                    .col(ColumnDef::new(UnidadMedida::Descripcion).text().not_null())
                    .col(ColumnDef::new(UnidadMedida::TipoMagnitud).text().not_null())
                    .col(ColumnDef::new(UnidadMedida::CreatedAt).text().not_null())
                    .col(ColumnDef::new(UnidadMedida::UpdatedAt).text())
                    .col(ColumnDef::new(UnidadMedida::CreatedBy).text().not_null())
                    .col(ColumnDef::new(UnidadMedida::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(UnidadMedida::Table, UnidadMedida::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(UnidadMedida::Table, UnidadMedida::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Region::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Region::Id).text().not_null().primary_key())
                    .col(ColumnDef::new(Region::Nombre).text().not_null())
                    .col(ColumnDef::new(Region::Estado).text().not_null())
                    .col(ColumnDef::new(Region::FactorAjuste).text())
                    .col(ColumnDef::new(Region::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Region::UpdatedAt).text())
                    .col(ColumnDef::new(Region::CreatedBy).text().not_null())
                    .col(ColumnDef::new(Region::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Region::Table, Region::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Region::Table, Region::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(FamiliaInsumo::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(FamiliaInsumo::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(FamiliaInsumo::ParentId).text())
                    .col(ColumnDef::new(FamiliaInsumo::Nombre).text().not_null())
                    .col(ColumnDef::new(FamiliaInsumo::CreatedAt).text().not_null())
                    .col(ColumnDef::new(FamiliaInsumo::UpdatedAt).text())
                    .col(ColumnDef::new(FamiliaInsumo::CreatedBy).text().not_null())
                    .col(ColumnDef::new(FamiliaInsumo::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(FamiliaInsumo::Table, FamiliaInsumo::ParentId)
                            .to(FamiliaInsumo::Table, FamiliaInsumo::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(FamiliaInsumo::Table, FamiliaInsumo::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(FamiliaInsumo::Table, FamiliaInsumo::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Moneda::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Moneda::Id).text().not_null().primary_key())
                    .col(
                        ColumnDef::new(Moneda::Codigo)
                            .text()
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(Moneda::Nombre).text().not_null())
                    .col(ColumnDef::new(Moneda::Simbolo).text().not_null())
                    .col(
                        ColumnDef::new(Moneda::Decimales)
                            .integer()
                            .not_null()
                            .default(2),
                    )
                    .col(ColumnDef::new(Moneda::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Moneda::UpdatedAt).text())
                    .col(ColumnDef::new(Moneda::CreatedBy).text().not_null())
                    .col(ColumnDef::new(Moneda::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Moneda::Table, Moneda::CreatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Moneda::Table, Moneda::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // `proyecto_id` en HistorialCambio/Comentario es una FK lógica —
        // `proyecto` todavía no existe en el ORM (no es parte de las
        // secciones 1-2), así que no se declara `ForeignKey` sobre esa
        // columna hasta que la tabla exista.
        manager
            .create_table(
                Table::create()
                    .table(HistorialCambio::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(HistorialCambio::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(HistorialCambio::ProyectoId).text().not_null())
                    .col(ColumnDef::new(HistorialCambio::Entidad).text().not_null())
                    .col(ColumnDef::new(HistorialCambio::EntidadId).text().not_null())
                    .col(ColumnDef::new(HistorialCambio::Accion).text().not_null())
                    .col(ColumnDef::new(HistorialCambio::UsuarioId).text().not_null())
                    .col(ColumnDef::new(HistorialCambio::DiffJson).text().not_null())
                    .col(ColumnDef::new(HistorialCambio::CreatedAt).text().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .from(HistorialCambio::Table, HistorialCambio::UsuarioId)
                            .to(Usuario::Table, Usuario::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Comentario::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Comentario::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Comentario::ProyectoId).text().not_null())
                    .col(ColumnDef::new(Comentario::Entidad).text().not_null())
                    .col(ColumnDef::new(Comentario::EntidadId).text().not_null())
                    .col(ColumnDef::new(Comentario::UsuarioId).text().not_null())
                    .col(ColumnDef::new(Comentario::Texto).text().not_null())
                    .col(
                        ColumnDef::new(Comentario::Resuelto)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(Comentario::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Comentario::UpdatedAt).text())
                    .col(ColumnDef::new(Comentario::UpdatedBy).text())
                    .foreign_key(
                        ForeignKey::create()
                            .from(Comentario::Table, Comentario::UsuarioId)
                            .to(Usuario::Table, Usuario::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Comentario::Table, Comentario::UpdatedBy)
                            .to(Usuario::Table, Usuario::Id),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Comentario::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(HistorialCambio::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Moneda::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(FamiliaInsumo::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Region::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(UnidadMedida::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Cliente::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(OrganizacionUsuario::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Organizacion::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Usuario::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Organizacion {
    Table,
    Id,
    RazonSocial,
    Rfc,
    Tipo,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum Usuario {
    Table,
    Id,
    Nombre,
    Correo,
    Rol,
    Activo,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum OrganizacionUsuario {
    Table,
    Id,
    OrganizacionId,
    UsuarioId,
    Activo,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum Cliente {
    Table,
    Id,
    OrganizacionId,
    RazonSocial,
    Rfc,
    Tipo,
    ContactoNombre,
    ContactoCorreo,
    ContactoTelefono,
    DomicilioFiscal,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum UnidadMedida {
    Table,
    Id,
    Simbolo,
    SimboloImpresion,
    Variantes,
    ClaveSat,
    Descripcion,
    TipoMagnitud,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum Region {
    Table,
    Id,
    Nombre,
    Estado,
    FactorAjuste,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum FamiliaInsumo {
    Table,
    Id,
    ParentId,
    Nombre,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum Moneda {
    Table,
    Id,
    Codigo,
    Nombre,
    Simbolo,
    Decimales,
    CreatedAt,
    UpdatedAt,
    CreatedBy,
    UpdatedBy,
}

#[derive(DeriveIden)]
enum HistorialCambio {
    Table,
    Id,
    ProyectoId,
    Entidad,
    EntidadId,
    Accion,
    UsuarioId,
    DiffJson,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Comentario {
    Table,
    Id,
    ProyectoId,
    Entidad,
    EntidadId,
    UsuarioId,
    Texto,
    Resuelto,
    CreatedAt,
    UpdatedAt,
    UpdatedBy,
}
