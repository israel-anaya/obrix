use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;
use std::collections::HashMap;

use crate::entities::plan::Plan;
use crate::entities::suscripcion::EstadoSuscripcion;
use crate::entities::{plan_capacidad, suscripcion};
use crate::routes::AppState;

#[derive(Serialize)]
pub struct CapacidadResponse {
    pub limite: Option<i32>,
    pub habilitado: bool,
}

#[derive(Serialize)]
pub struct EntitlementsResponse {
    pub correo: String,
    pub plan: Plan,
    pub estado: EstadoSuscripcion,
    pub capacidades: HashMap<String, CapacidadResponse>,
}

/// Qué le está permitido hacer a una cuenta ahora mismo. El desktop llama
/// esto tras login y cachea la respuesta para poder seguir operando offline
/// un tiempo de gracia.
pub async fn obtener_entitlements(
    State(state): State<AppState>,
    Path(correo): Path<String>,
) -> Result<Json<EntitlementsResponse>, StatusCode> {
    let existente = suscripcion::Entity::find()
        .filter(suscripcion::Column::Correo.eq(correo.clone()))
        .one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Toda cuenta sin fila explícita en `suscripcion` empieza en `free` —
    // no hace falta sembrar una suscripción por cada alta nueva, así que un
    // registro nuevo en GoTrue ya queda en Free sin ninguna acción extra.
    let (plan, estado) = match existente {
        Some(s) => (s.plan, s.estado),
        None => (Plan::Free, EstadoSuscripcion::Activa),
    };

    let capacidades_rows = plan_capacidad::Entity::find()
        .filter(plan_capacidad::Column::Plan.eq(plan))
        .all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let capacidades = capacidades_rows
        .into_iter()
        .map(|row| {
            (
                capacidad_a_string(row.capacidad),
                CapacidadResponse {
                    limite: row.limite,
                    habilitado: row.habilitado,
                },
            )
        })
        .collect();

    Ok(Json(EntitlementsResponse {
        correo,
        plan,
        estado,
        capacidades,
    }))
}

fn capacidad_a_string(capacidad: plan_capacidad::Capacidad) -> String {
    match capacidad {
        plan_capacidad::Capacidad::Organizaciones => "organizaciones".to_string(),
        plan_capacidad::Capacidad::Proyectos => "proyectos".to_string(),
        plan_capacidad::Capacidad::MultiUsuario => "multi_usuario".to_string(),
    }
}
