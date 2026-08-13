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
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return fecha;
  const tieneHora = fecha.includes("T");
  return (tieneHora ? FORMATO_FECHA_HORA : FORMATO_FECHA).format(valor);
}
