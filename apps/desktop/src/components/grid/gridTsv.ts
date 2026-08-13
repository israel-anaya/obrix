import { displayValue, parseNumber } from "./gridValues";
import type { DataGridColumn, Row } from "./types";

function escapeTsv(value: string): string {
  if (/[\t\n\r"]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function rowToTsv(row: Row, columns: DataGridColumn[]): string {
  return columns.map((c) => escapeTsv(displayValue(row, c))).join("\t");
}

export function parseTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines
    .map((line) => line.split("\t"))
    .filter((line) => line.some((c) => c.trim() !== ""));
}

export function applyLineToRow(
  row: Row,
  line: string[],
  startIdx: number,
  columns: DataGridColumn[],
): { row: Row; changed: boolean } {
  let next = { ...row };
  let changed = false;
  for (let i = 0; i < line.length; i++) {
    const col = columns[startIdx + i];
    if (!col) break;
    const parsed = parsePastedValue(line[i] ?? "", col, next);
    if (parsed === null || next[col.field] === parsed) continue;
    next = { ...next, [col.field]: parsed };
    changed = true;
  }
  return { row: next, changed };
}

function parsePastedValue(
  text: string,
  column: DataGridColumn,
  row: Row,
): string | number | boolean | null {
  if (column.readOnly) return null;
  const raw = text.trim();
  if (column.boolean) {
    const t = raw.toLowerCase();
    if (["sí", "si", "true", "1", "yes"].includes(t)) return true;
    if (["no", "false", "0"].includes(t)) return false;
    return null;
  }
  if (column.numeric || column.stars) {
    const n = parseNumber(raw);
    if (n === null) return null;
    if (column.stars) return Math.min(5, Math.max(0, n));
    return n;
  }
  const options = typeof column.options === "function" ? column.options(row) : column.options;
  if (options) {
    return options.find((o) => o.toLowerCase() === raw.toLowerCase()) ?? null;
  }
  if (column.suffix && raw.endsWith(column.suffix)) {
    return raw.slice(0, -column.suffix.length);
  }
  return text;
}

export async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
