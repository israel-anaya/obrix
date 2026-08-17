const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", { dateStyle: "short" });
const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });

/**
 * Formato de fecha único para la región México (dd/mm/aaaa, con hora si el
 * valor la trae) — todos los catálogos lo usan vía `DataGridColumn.date`
 * en `DataGrid`, así que cambiar el formato solo requiere tocar este
 * archivo. `PreciosMaterialPanel` es la única excepción: tiene su propio
 * formato corto (dd/mm/aa) para las columnas de vigencia de precios.
 */
export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return "";
  const tieneHora = fecha.includes("T");
  const valor = tieneHora ? new Date(fecha) : parseFechaLocal(fecha);
  if (!valor || Number.isNaN(valor.getTime())) return fecha;
  return (tieneHora ? FORMATO_FECHA_HORA : FORMATO_FECHA).format(valor);
}

/** Interpreta `YYYY-MM-DD` como fecha local (evita el desfase UTC de `new Date("2026-01-01")`). */
export function parseFechaLocal(fecha: string): Date | null {
  if (fecha.includes("T")) {
    const valor = new Date(fecha);
    return Number.isNaN(valor.getTime()) ? null : valor;
  }
  const soloDia = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!soloDia) {
    const valor = new Date(fecha);
    return Number.isNaN(valor.getTime()) ? null : valor;
  }
  const valor = new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]));
  return Number.isNaN(valor.getTime()) ? null : valor;
}

/** Días civiles entre esa fecha y hoy (local). `null` si no se puede parsear. */
export function diasTranscurridos(fecha: string, hoy = new Date()): number | null {
  const valor = parseFechaLocal(fecha);
  if (!valor) return null;
  const a = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const b = new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}
