//! Parser de CSV de dos secciones (`MAESTRO` / `DETALLE`) compartido por
//! importaciones de receta (cuadrillas, equipo de costo horario).

use rust_decimal::Decimal;

use crate::ServiceError;

pub struct TablaCsv {
    pub encabezados: csv::StringRecord,
    pub filas: Vec<(usize, csv::StringRecord)>,
}

pub fn buscar_columna(headers: &csv::StringRecord, candidatos: &[&str]) -> Option<usize> {
    headers.iter().position(|h| {
        let n = h.trim().trim_start_matches('\u{feff}').to_lowercase();
        candidatos.iter().any(|c| n == *c)
    })
}

pub fn celda(registro: &csv::StringRecord, indice: usize) -> String {
    registro.get(indice).unwrap_or("").trim().to_string()
}

pub fn parsear_decimal(texto: &str) -> Option<Decimal> {
    let limpio: String = texto
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();
    if limpio.is_empty() {
        return None;
    }
    limpio.parse().ok()
}

pub fn parsear_secciones_maestro_detalle(
    contenido: &str,
) -> Result<(TablaCsv, TablaCsv), ServiceError> {
    let mut seccion: Option<&'static str> = None;
    let mut maestro_lineas: Vec<(usize, String)> = Vec::new();
    let mut detalle_lineas: Vec<(usize, String)> = Vec::new();
    for (i, linea) in contenido.lines().enumerate() {
        let n = i + 1;
        let recortada = linea.trim().trim_start_matches('\u{feff}');
        if recortada.is_empty() {
            continue;
        }
        let etiqueta = recortada.to_lowercase();
        if etiqueta == "maestro" {
            seccion = Some("maestro");
            continue;
        }
        if etiqueta == "detalle" {
            seccion = Some("detalle");
            continue;
        }
        match seccion {
            Some("maestro") => maestro_lineas.push((n, linea.to_string())),
            Some("detalle") => detalle_lineas.push((n, linea.to_string())),
            _ => {
                return Err(ServiceError::Validacion(
                    "el archivo debe empezar con la sección MAESTRO".into(),
                ));
            }
        }
    }
    if maestro_lineas.is_empty() {
        return Err(ServiceError::Validacion(
            "el archivo debe tener la sección MAESTRO".into(),
        ));
    }
    if detalle_lineas.is_empty() {
        return Err(ServiceError::Validacion(
            "el archivo debe tener la sección DETALLE".into(),
        ));
    }
    Ok((
        leer_tabla_csv(&maestro_lineas)?,
        leer_tabla_csv(&detalle_lineas)?,
    ))
}

fn leer_tabla_csv(lineas: &[(usize, String)]) -> Result<TablaCsv, ServiceError> {
    let texto = lineas
        .iter()
        .map(|(_, l)| l.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let mut lector = csv::ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::Headers)
        .from_reader(texto.as_bytes());
    let encabezados = lector
        .headers()
        .map_err(|e| {
            ServiceError::Validacion(format!("no se pudieron leer los encabezados del CSV: {e}"))
        })?
        .clone();
    let mut filas = Vec::new();
    for (i, registro) in lector.records().enumerate() {
        let linea = lineas.get(i + 1).map(|(n, _)| *n).unwrap_or(lineas[0].0);
        match registro {
            Ok(r) => filas.push((linea, r)),
            Err(e) => {
                return Err(ServiceError::Validacion(format!("fila {linea}: {e}")));
            }
        }
    }
    Ok(TablaCsv { encabezados, filas })
}
