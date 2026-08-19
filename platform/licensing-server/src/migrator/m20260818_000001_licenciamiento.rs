use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Suscripcion::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Suscripcion::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Suscripcion::Correo)
                            .text()
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(Suscripcion::Plan).text().not_null())
                    .col(ColumnDef::new(Suscripcion::Estado).text().not_null())
                    .col(ColumnDef::new(Suscripcion::StripeCustomerId).text())
                    .col(ColumnDef::new(Suscripcion::StripeSubscriptionId).text())
                    .col(ColumnDef::new(Suscripcion::FechaInicio).text().not_null())
                    .col(ColumnDef::new(Suscripcion::FechaRenovacion).text())
                    .col(ColumnDef::new(Suscripcion::CreatedAt).text().not_null())
                    .col(ColumnDef::new(Suscripcion::UpdatedAt).text())
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(PlanCapacidad::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(PlanCapacidad::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(PlanCapacidad::Plan).text().not_null())
                    .col(ColumnDef::new(PlanCapacidad::Capacidad).text().not_null())
                    .col(ColumnDef::new(PlanCapacidad::Limite).integer())
                    .col(
                        ColumnDef::new(PlanCapacidad::Habilitado)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(ColumnDef::new(PlanCapacidad::CreatedAt).text().not_null())
                    .col(ColumnDef::new(PlanCapacidad::UpdatedAt).text())
                    .index(
                        Index::create()
                            .name("idx-plan_capacidad-plan-capacidad")
                            .col(PlanCapacidad::Plan)
                            .col(PlanCapacidad::Capacidad)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        // Semilla: límites acordados para cada plan. `NULL` en `limite` =
        // ilimitado. `multi_usuario` es un feature flag puro (gatea
        // `proyecto.modo = 'compartido'` y el acceso a sync-server), por
        // eso su `limite` siempre es NULL y lo que importa es `habilitado`.
        manager
            .get_connection()
            .execute_unprepared(
                "INSERT INTO plan_capacidad (id, plan, capacidad, limite, habilitado, created_at) VALUES
                (gen_random_uuid()::text, 'free', 'organizaciones', 1, true, now()::text),
                (gen_random_uuid()::text, 'free', 'proyectos', 3, true, now()::text),
                (gen_random_uuid()::text, 'free', 'multi_usuario', NULL, false, now()::text),
                (gen_random_uuid()::text, 'profesional', 'organizaciones', 3, true, now()::text),
                (gen_random_uuid()::text, 'profesional', 'proyectos', NULL, true, now()::text),
                (gen_random_uuid()::text, 'profesional', 'multi_usuario', NULL, false, now()::text),
                (gen_random_uuid()::text, 'enterprise', 'organizaciones', NULL, true, now()::text),
                (gen_random_uuid()::text, 'enterprise', 'proyectos', NULL, true, now()::text),
                (gen_random_uuid()::text, 'enterprise', 'multi_usuario', NULL, true, now()::text)",
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(PlanCapacidad::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Suscripcion::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Suscripcion {
    Table,
    Id,
    Correo,
    Plan,
    Estado,
    StripeCustomerId,
    StripeSubscriptionId,
    FechaInicio,
    FechaRenovacion,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum PlanCapacidad {
    Table,
    Id,
    Plan,
    Capacidad,
    Limite,
    Habilitado,
    CreatedAt,
    UpdatedAt,
}
