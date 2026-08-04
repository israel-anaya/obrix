#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use sqlx::{sqlite::SqlitePool, Row};
use tauri::Manager;
use uuid::Uuid;

pub struct AppState {
    pub pool: SqlitePool,
    pub proyecto_id: String,
}

async fn ensure_demo_proyecto(pool: &SqlitePool) -> Result<String, sqlx::Error> {
    if let Some(row) = sqlx::query("SELECT id FROM proyecto LIMIT 1")
        .fetch_optional(pool)
        .await?
    {
        return Ok(row.get("id"));
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO proyecto (id, folio, nombre, moneda, estatus, modo, created_at, updated_at) \
         VALUES (?, 'DEMO-001', 'Proyecto demo', 'MXN', 'borrador', 'local', ?, ?)",
    )
    .bind(&id)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(id)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let dir = handle
                    .path()
                    .app_data_dir()
                    .expect("no se pudo resolver el directorio de datos de la app");
                std::fs::create_dir_all(&dir).expect("no se pudo crear el directorio de datos");
                let db_path = dir.join("demo.db");

                let pool = obrix_db::open_proyecto(db_path.to_str().expect("ruta inválida"))
                    .await
                    .expect("no se pudo abrir/migrar la base de datos local");

                let proyecto_id = ensure_demo_proyecto(&pool)
                    .await
                    .expect("no se pudo crear el proyecto demo inicial");

                handle.manage(AppState { pool, proyecto_id });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::insumos::list_insumos,
            commands::insumos::create_insumo,
            commands::conceptos::list_conceptos,
            commands::conceptos::create_concepto,
        ])
        .run(tauri::generate_context!())
        .expect("error corriendo la aplicación Tauri");
}
