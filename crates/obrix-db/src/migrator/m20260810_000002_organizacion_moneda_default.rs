use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // `moneda` se crea después de `organizacion` en la migración anterior,
        // así que la FK solo puede agregarse aquí, vía ALTER TABLE — sea-query
        // no soporta declarar foreign keys sobre columnas agregadas en un
        // `alter_table` para SQLite, así que se hace con SQL directo (SQLite
        // sí soporta una cláusula `REFERENCES` en `ADD COLUMN`).
        //
        // `NOT NULL` requiere un `DEFAULT` no nulo en SQLite — en la práctica
        // nunca se usa: esta migración corre siempre sobre una `organizacion`
        // recién creada y vacía (el sembrado, que sí llena `moneda_default_id`
        // con un valor real, corre después — ver `seed::sembrar_catalogos_generales`).
        manager
            .get_connection()
            .execute_unprepared(
                "ALTER TABLE organizacion ADD COLUMN moneda_default_id TEXT NOT NULL REFERENCES moneda(id) DEFAULT ''",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("ALTER TABLE organizacion DROP COLUMN moneda_default_id")
            .await?;
        Ok(())
    }
}
