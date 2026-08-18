use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // sea-query no soporta declarar foreign keys sobre columnas
        // agregadas en un `alter_table` para SQLite — se hace con SQL
        // directo (SQLite sí acepta `REFERENCES` en `ADD COLUMN`).
        // `NOT NULL` exige un `DEFAULT` no nulo; el backfill de abajo
        // lo sustituye por la organización del portafolio.
        manager
            .get_connection()
            .execute_unprepared(
                "ALTER TABLE region ADD COLUMN organizacion_id TEXT NOT NULL REFERENCES organizacion(id) DEFAULT ''",
            )
            .await?;
        manager
            .get_connection()
            .execute_unprepared(
                "UPDATE region SET organizacion_id = (
                    SELECT id FROM organizacion WHERE deleted = 0 ORDER BY created_at LIMIT 1
                ) WHERE organizacion_id = '' OR organizacion_id IS NULL",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("ALTER TABLE region DROP COLUMN organizacion_id")
            .await?;
        Ok(())
    }
}
