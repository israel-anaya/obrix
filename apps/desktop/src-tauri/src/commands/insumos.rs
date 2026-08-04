use std::str::FromStr;

use obrix_core::models::{Insumo, TipoInsumo};
use rust_decimal::Decimal;
use sqlx::Row;
use uuid::Uuid;

use crate::AppState;

#[derive(serde::Deserialize)]
pub struct NuevoInsumo {
    pub clave: String,
    pub tipo: TipoInsumo,
    pub descripcion: String,
    pub unidad: String,
    pub precio_base: String,
}

fn tipo_to_str(t: TipoInsumo) -> &'static str {
    match t {
        TipoInsumo::Material => "material",
        TipoInsumo::ManoObra => "mano_obra",
        TipoInsumo::EquipoHerramienta => "equipo_herramienta",
    }
}

fn tipo_from_str(s: &str) -> TipoInsumo {
    match s {
        "mano_obra" => TipoInsumo::ManoObra,
        "equipo_herramienta" => TipoInsumo::EquipoHerramienta,
        _ => TipoInsumo::Material,
    }
}

#[tauri::command]
pub async fn list_insumos(state: tauri::State<'_, AppState>) -> Result<Vec<Insumo>, String> {
    let rows = sqlx::query(
        "SELECT id, clave, tipo, descripcion, unidad, precio_base FROM insumo WHERE proyecto_id = ? ORDER BY clave",
    )
    .bind(&state.proyecto_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let id_str: String = row.get("id");
            let tipo_str: String = row.get("tipo");
            let precio_str: String = row.get("precio_base");
            Ok(Insumo {
                id: Uuid::parse_str(&id_str).map_err(|e| e.to_string())?,
                clave: row.get("clave"),
                tipo: tipo_from_str(&tipo_str),
                descripcion: row.get("descripcion"),
                unidad: row.get("unidad"),
                precio_base: Decimal::from_str(&precio_str).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn create_insumo(
    state: tauri::State<'_, AppState>,
    insumo: NuevoInsumo,
) -> Result<Insumo, String> {
    let id = Uuid::new_v4();
    let now = chrono::Utc::now().to_rfc3339();
    let precio = Decimal::from_str(&insumo.precio_base).map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO insumo (id, proyecto_id, clave, tipo, descripcion, unidad, precio_base, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id.to_string())
    .bind(&state.proyecto_id)
    .bind(&insumo.clave)
    .bind(tipo_to_str(insumo.tipo))
    .bind(&insumo.descripcion)
    .bind(&insumo.unidad)
    .bind(precio.to_string())
    .bind(&now)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Insumo {
        id,
        clave: insumo.clave,
        tipo: insumo.tipo,
        descripcion: insumo.descripcion,
        unidad: insumo.unidad,
        precio_base: precio,
    })
}
