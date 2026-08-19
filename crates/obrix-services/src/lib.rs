//! Capa de negocio: un `Service` por entidad, entre los comandos de Tauri y
//! `PortafolioRepository`. No conoce Tauri ni el protocolo de IPC — recibe
//! `&dyn PortafolioRepository` (y, para las entidades que lo necesitan, el
//! `organizacion_id` activo) y devuelve `ServiceError`, no `String`; los
//! comandos son quienes traducen ese error a texto para el frontend.

pub mod categoria_fasar;
pub mod cliente;
pub mod csv_secciones;
pub mod cuadrilla;
pub mod cuadrilla_costo;
pub mod cuadrilla_costo_detalle;
pub mod cuadrilla_detalle;
pub mod equipo_costo_horario;
pub mod equipo_costo_horario_costo;
pub mod equipo_costo_horario_costo_detalle;
pub mod equipo_costo_horario_detalle;
pub mod factor_salario_real;
pub mod familia_insumo;
pub mod herramienta;
pub mod material;
pub mod moneda;
pub mod organizacion;
pub mod organizacion_usuario;
pub mod perfil_inactividad_equipo;
pub mod precio_material;
pub mod proveedor;
pub mod region;
pub mod salario_categoria_fasar;
pub mod unidad_medida;
pub mod usuario;

pub mod seed;

#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error("no encontrado: {0}")]
    NoEncontrado(String),
    #[error(transparent)]
    Db(#[from] sea_orm::DbErr),
    #[error("{0}")]
    Validacion(String),
}

/// Datos default de una entidad. Cada `Service` que quiera precargar algo
/// implementa esto en su propio archivo — así el sembrado no vive en un
/// solo archivo gigante, cada entidad es dueña de sus propios datos
/// iniciales. `sembrar` debe ser idempotente (no duplicar si ya hay datos).
pub trait DatosIniciales {
    fn sembrar(
        repo: &dyn obrix_db::PortafolioRepository,
    ) -> impl std::future::Future<Output = Result<(), ServiceError>> + Send;
}

/// Id único para un nuevo registro.
pub fn nuevo_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Timestamp actual en el formato usado por `created_at`/`updated_at`.
pub fn ahora() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Fecha actual (sin hora), para columnas de solo fecha como `fecha_vigencia_desde`.
pub fn hoy() -> String {
    chrono::Utc::now().date_naive().to_string()
}

/// Clave de cruce para `insumo.clave` / `insumo.descripcion` al importar:
/// recorta y no distingue mayúsculas.
pub fn clave_cruce(texto: &str) -> String {
    texto.trim().to_lowercase()
}

/// Localiza un insumo ya registrado: primero por clave (si viene), si no por
/// descripción. Ambas sin distinguir mayúsculas.
pub fn id_insumo_existente(
    clave: Option<&str>,
    descripcion: &str,
    por_clave: &std::collections::HashMap<String, String>,
    por_descripcion: &std::collections::HashMap<String, String>,
) -> Option<String> {
    clave
        .map(str::trim)
        .filter(|c| !c.is_empty())
        .and_then(|c| por_clave.get(&clave_cruce(c)).cloned())
        .or_else(|| por_descripcion.get(&clave_cruce(descripcion)).cloned())
}

/// Actualiza los índices de cruce tras crear o actualizar un insumo, para
/// que filas posteriores del mismo CSV vean el registro ya escrito.
pub fn recordar_insumo(
    por_clave: &mut std::collections::HashMap<String, String>,
    por_descripcion: &mut std::collections::HashMap<String, String>,
    id: &str,
    clave: &str,
    descripcion: &str,
) {
    por_clave.retain(|_, v| v != id);
    por_descripcion.retain(|_, v| v != id);
    por_clave.insert(clave_cruce(clave), id.to_string());
    por_descripcion.insert(clave_cruce(descripcion), id.to_string());
}

/// Familia raíz por nombre y subfamilia por (padre, nombre), en minúsculas.
/// Lo arma el import de insumos en memoria; no hay WHERE sobre el nombre.
pub fn mapas_familia(
    familias: &[obrix_db::entities::familia_insumo::Model],
) -> (
    std::collections::HashMap<String, String>,
    std::collections::HashMap<(String, String), String>,
) {
    let raiz_id_por_nombre = familias
        .iter()
        .filter(|f| f.parent_id.is_none())
        .map(|f| (f.nombre.to_lowercase(), f.id.clone()))
        .collect();
    let hija_id_por_padre_y_nombre = familias
        .iter()
        .filter_map(|f| {
            f.parent_id
                .as_ref()
                .map(|padre| ((padre.clone(), f.nombre.to_lowercase()), f.id.clone()))
        })
        .collect();
    (raiz_id_por_nombre, hija_id_por_padre_y_nombre)
}

/// Resuelve Familia/Subfamilia del CSV. Si el nombre no existe se importa
/// sin ese dato y se reporta en `errores` (igual que materiales).
pub fn resolver_familia_csv(
    familia_texto: &str,
    subfamilia_texto: &str,
    raiz_id_por_nombre: &std::collections::HashMap<String, String>,
    hija_id_por_padre_y_nombre: &std::collections::HashMap<(String, String), String>,
    fila: usize,
    errores: &mut Vec<String>,
) -> (Option<String>, Option<String>) {
    let familia_texto = familia_texto.trim();
    let familia_id = if familia_texto.is_empty() {
        None
    } else {
        match raiz_id_por_nombre.get(&familia_texto.to_lowercase()) {
            Some(id) => Some(id.clone()),
            None => {
                errores.push(format!(
                    "fila {fila}: familia \"{familia_texto}\" no encontrada, se importó sin familia"
                ));
                None
            }
        }
    };
    let subfamilia_texto = subfamilia_texto.trim();
    let sub_familia_id = if subfamilia_texto.is_empty() {
        None
    } else if let Some(familia_id) = &familia_id {
        match hija_id_por_padre_y_nombre.get(&(familia_id.clone(), subfamilia_texto.to_lowercase()))
        {
            Some(id) => Some(id.clone()),
            None => {
                errores.push(format!(
                    "fila {fila}: subfamilia \"{subfamilia_texto}\" no encontrada dentro de \"{familia_texto}\", se importó sin subfamilia"
                ));
                None
            }
        }
    } else {
        errores.push(format!(
            "fila {fila}: subfamilia \"{subfamilia_texto}\" indicada sin familia válida, se ignoró"
        ));
        None
    };
    (familia_id, sub_familia_id)
}

/// Siguiente número de clave `PREFIJO-N` (p. ej. `HER-001` → 2).
pub fn siguiente_consecutivo<'a>(claves: impl Iterator<Item = &'a str>, prefijo: &str) -> u32 {
    claves
        .filter_map(|c| c.strip_prefix(prefijo)?.parse::<u32>().ok())
        .max()
        .unwrap_or(0)
        + 1
}

/// Verbo para mensajes de `ServiceError::Validacion` en los `validar` de
/// cada `Service` — distingue alta de edición por si una regla solo aplica a
/// uno de los dos casos (ver p. ej. `organizacion::OrganizacionService::validar`).
pub fn accion(actualizando: bool) -> &'static str {
    if actualizando { "actualizar" } else { "crear" }
}

/// Verifica que una entidad referenciada por id exista (y, si aplica, no
/// esté borrada) antes de guardarla en otro registro — pásale la consulta ya
/// armada (p. ej. `Entity::find_by_id(id).filter(Column::Deleted.eq(false)).one(repo.conexion())`)
/// y una etiqueta para el mensaje de `NoEncontrado`. Usado por los
/// `validar_*_existe` de cada `Service` — para un id opcional, antepón un
/// `let Some(id) = id else { return Ok(()) };` antes de llamarlo (ver p. ej.
/// `material::MaterialService::validar_familia_existe`).
pub async fn validar_existe<M>(
    resultado: impl std::future::Future<Output = Result<Option<M>, sea_orm::DbErr>>,
    etiqueta: impl std::fmt::Display,
) -> Result<(), ServiceError> {
    resultado
        .await?
        .ok_or_else(|| ServiceError::NoEncontrado(etiqueta.to_string()))?;
    Ok(())
}

/// Rechaza los ids opcionales (`familia_id`, `sub_familia_id`,
/// `proveedor_id`, …) que vengan como cadena vacía en vez de `None` — usado
/// dentro del `validar` de cada `Service` para los campos "opcionales pero
/// deben existir si se especifican" (la existencia en sí se valida aparte,
/// contra la base, en un `validar_*_existe` async — ver p. ej.
/// `cuadrilla::CuadrillaService::validar_familia_existe`).
pub fn validar_opcionales_no_vacios(
    campos: &[(&Option<String>, &str)],
) -> Result<(), ServiceError> {
    for (id, etiqueta) in campos {
        if let Some(id) = id {
            if id.trim().is_empty() {
                return Err(ServiceError::Validacion(format!(
                    "{etiqueta} no puede ser una cadena vacía; usa null si no aplica."
                )));
            }
        }
    }
    Ok(())
}

/// `unidad_id` es requerido en varias entidades (`categoria_fasar`,
/// `cuadrilla`, `material`) y en las tres debe referenciar una unidad de
/// medida existente — centralizado aquí porque la lógica era idéntica en los
/// tres `Service`. Separado de cada `validar` porque necesita consultar la base.
pub async fn validar_unidad_existe(
    repo: &dyn obrix_db::PortafolioRepository,
    unidad_id: &str,
) -> Result<(), ServiceError> {
    use obrix_db::entities::unidad_medida;
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
    validar_existe(
        unidad_medida::Entity::find_by_id(unidad_id)
            .filter(unidad_medida::Column::Deleted.eq(false))
            .one(repo.conexion()),
        format!("unidad de medida {unidad_id}"),
    )
    .await
}

/// `familia_id`/`sub_familia_id` son opcionales por diseño en varias
/// entidades (`categoria_fasar`, `cuadrilla`, `material`), pero si se
/// especifican deben referenciar una familia de insumo existente —
/// centralizado aquí porque la lógica era idéntica en los tres `Service`.
pub async fn validar_familia_existe(
    repo: &dyn obrix_db::PortafolioRepository,
    familia_id: &Option<String>,
) -> Result<(), ServiceError> {
    let Some(familia_id) = familia_id else {
        return Ok(());
    };
    use obrix_db::entities::familia_insumo;
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
    validar_existe(
        familia_insumo::Entity::find_by_id(familia_id)
            .filter(familia_insumo::Column::Deleted.eq(false))
            .one(repo.conexion()),
        format!("familia de insumo {familia_id}"),
    )
    .await
}

/// `proveedor_id` es opcional por diseño (hoy solo en `material`), pero si
/// se especifica debe referenciar un proveedor existente — sigue el mismo
/// patrón que `validar_familia_existe`/`validar_unidad_existe`.
pub async fn validar_proveedor_existe(
    repo: &dyn obrix_db::PortafolioRepository,
    proveedor_id: &Option<String>,
) -> Result<(), ServiceError> {
    let Some(proveedor_id) = proveedor_id else {
        return Ok(());
    };
    use obrix_db::entities::proveedor;
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
    validar_existe(
        proveedor::Entity::find_by_id(proveedor_id)
            .filter(proveedor::Column::Deleted.eq(false))
            .one(repo.conexion()),
        format!("proveedor {proveedor_id}"),
    )
    .await
}

/// `region_id` es opcional por diseño (`None` = ámbito nacional, usado hoy
/// en `factor_salario_real`), pero si se especifica debe referenciar una
/// región existente — sigue el mismo patrón que
/// `validar_familia_existe`/`validar_unidad_existe`.
pub async fn validar_region_existe(
    repo: &dyn obrix_db::PortafolioRepository,
    region_id: &Option<String>,
) -> Result<(), ServiceError> {
    let Some(region_id) = region_id else {
        return Ok(());
    };
    use obrix_db::entities::region;
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
    validar_existe(
        region::Entity::find_by_id(region_id)
            .filter(region::Column::Deleted.eq(false))
            .one(repo.conexion()),
        format!("región {region_id}"),
    )
    .await
}

/// Borrado lógico del pivote `insumo` — las tablas de extensión (material,
/// herramienta, cuadrilla, …) se quedan; `listar` las oculta con `deleted`.
pub async fn marcar_insumo_eliminado(
    repo: &dyn obrix_db::PortafolioRepository,
    id: &str,
    etiqueta: &str,
    eliminado_por: String,
) -> Result<(), ServiceError> {
    use obrix_db::entities::insumo::{ActiveModel, Column, Entity};
    use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
    let mut modelo: ActiveModel = Entity::find_by_id(id)
        .filter(Column::Deleted.eq(false))
        .one(repo.conexion())
        .await?
        .ok_or_else(|| ServiceError::NoEncontrado(format!("{etiqueta} {id}")))?
        .into();
    modelo.deleted = Set(true);
    modelo.deleted_at = Set(Some(ahora()));
    modelo.deleted_by = Set(Some(eliminado_por));
    modelo.update(repo.conexion()).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn id_insumo_existente_no_distingue_mayusculas_en_clave_ni_descripcion() {
        let mut por_clave = HashMap::new();
        let mut por_descripcion = HashMap::new();
        recordar_insumo(
            &mut por_clave,
            &mut por_descripcion,
            "id-1",
            "MAT-1",
            "Cemento Portland",
        );
        assert_eq!(
            id_insumo_existente(Some("mat-1"), "otra", &por_clave, &por_descripcion).as_deref(),
            Some("id-1")
        );
        assert_eq!(
            id_insumo_existente(None, "CEMENTO PORTLAND", &por_clave, &por_descripcion).as_deref(),
            Some("id-1")
        );
        assert_eq!(
            id_insumo_existente(Some("MAT-9"), "arena", &por_clave, &por_descripcion),
            None
        );
    }
}
