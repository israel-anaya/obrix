import { formatearFecha } from "@/lib/fecha";
import type { DataGridColumn, EditState, Row } from "./types";

export function emptyRow(columns: DataGridColumn[]): Row {
  return {
    _id: crypto.randomUUID(),
    ...Object.fromEntries(columns.map((c) => [c.field, c.boolean ? false : c.numeric ? 0 : ""])),
  };
}

export function firstEditableField(columns: DataGridColumn[]): string | undefined {
  return columns.find((c) => !c.readOnly)?.field ?? columns[0]?.field;
}

/** Accepts a decimal comma or dot (`1,5` / `1.5`) and Mexico-style thousands (`1.234,56`). */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (t === "") return 0;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  let normalized = t;
  if (hasComma && hasDot) {
    normalized =
      t.lastIndexOf(",") > t.lastIndexOf(".")
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "");
  } else if (hasComma) {
    normalized = t.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function emptyValue(column: DataGridColumn): string | number | boolean {
  if (column.boolean) return false;
  if (column.numeric) return 0;
  return "";
}

/** Tries to map the backend's error message to columns by `field` or header. */
export function fieldsFromMessage(message: string, columns: DataGridColumn[], row: Row): string[] {
  const lower = message.toLowerCase();
  const byName = columns
    .filter((c) => !c.readOnly && (lower.includes(c.field.toLowerCase()) || lower.includes(c.header.toLowerCase())))
    .map((c) => c.field);
  if (byName.length > 0) return byName;
  const looksRequired = /vacío|vacio|required|not null|obligatori|empty/i.test(message);
  if (!looksRequired) return [];
  return columns
    .filter((c) => {
      if (c.readOnly || c.boolean || c.numeric) return false;
      const v = row[c.field];
      return v === "" || v == null;
    })
    .map((c) => c.field);
}

/**
 * While a draft is in flight the parent can send new `initialRows` (e.g. once
 * user names resolve) without clobbering what the user is editing. During a
 * save the parent's list is taken as-is — a persisted insert usually comes back
 * with an `_id` other than the local UUID.
 */
export function mergeRows(prev: Row[], nextRows: Row[], editing: EditState | null, saving: boolean): Row[] {
  if (!editing || saving) return nextRows;
  const draft = prev.find((f) => f._id === editing.id);
  if (!draft) return nextRows;
  if (editing.isNew || !nextRows.some((f) => f._id === editing.id)) {
    return [...nextRows, draft];
  }
  return nextRows.map((f) => (f._id === editing.id ? draft : f));
}

/**
 * A cell's formatted text — the same text the user sees (date through
 * `formatearFecha`, boolean as "Sí"/"No", suffix applied). Shared by the view
 * renderer and the global search so the two never drift apart (searching for
 * something visible on screen must always find it).
 */
export function displayValue(row: Row, column: DataGridColumn): string {
  const value = row[column.field];
  if (column.boolean) return value ? "Sí" : "No";
  if (column.date) return formatearFecha(value as string);
  const formatted =
    column.numeric && column.decimals != null && typeof value === "number"
      ? value.toFixed(column.decimals)
      : value;
  if (column.suffix) return formatted === "" || formatted == null ? "" : `${formatted}${column.suffix}`;
  return formatted == null ? "" : String(formatted);
}
