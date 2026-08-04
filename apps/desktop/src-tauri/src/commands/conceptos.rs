use std::str::FromStr;

use obrix_core::models::Concepto;
use rust_decimal::Decimal;
use sqlx::Row;
use uuid::Uuid;

use crate::AppState;

#[derive(serde::Deserialize)]
pub struct NuevoConcepto {
    pub clave: String,
    pub descripcion: String,
    pub unidad: String,
    pub cantidad: String,
    pub parent_id: Option<String>,
}

#[tauri::command]
pub async fn list_conceptos(state: tauri::State<'_, AppState>) -> Result<Vec<Concepto>, String> {
    let rows = sqlx::query(
        "SELECT id, clave, descripcion, unidad, cantidad, parent_id FROM concepto WHERE proyecto_id = ? ORDER BY clave",
    )
    .bind(&state.proyecto_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let id_str: String = row.get("id");
            let cantidad_str: String = row.get("cantidad");
            let parent_id_str: Option<String> = row.get("parent_id");
            Ok(Concepto {
                id: Uuid::parse_str(&id_str).map_err(|e| e.to_string())?,
                clave: row.get("clave"),
                descripcion: row.get("descripcion"),
                unidad: row.get("unidad"),
                cantidad: Decimal::from_str(&cantidad_str).map_err(|e| e.to_string())?,
                parent_id: parent_id_str
                    .map(|s| Uuid::parse_str(&s).map_err(|e| e.to_string()))
                    .transpose()?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn create_concepto(
    state: tauri::State<'_, AppState>,
    concepto: NuevoConcepto,
) -> Result<Concepto, String> {
    let id = Uuid::new_v4();
    let now = chrono::Utc::now().to_rfc3339();
    let cantidad = Decimal::from_str(&concepto.cantidad).map_err(|e| e.to_string())?;
    let parent_id = concepto
        .parent_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| Uuid::parse_str(s).map_err(|e| e.to_string()))
        .transpose()?;

    sqlx::query(
        "INSERT INTO concepto (id, proyecto_id, parent_id, clave, descripcion, unidad, cantidad, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id.to_string())
    .bind(&state.proyecto_id)
    .bind(parent_id.map(|p| p.to_string()))
    .bind(&concepto.clave)
    .bind(&concepto.descripcion)
    .bind(&concepto.unidad)
    .bind(cantidad.to_string())
    .bind(&now)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Concepto {
        id,
        clave: concepto.clave,
        descripcion: concepto.descripcion,
        unidad: concepto.unidad,
        cantidad,
        parent_id,
    })
}
