import type { CatalogGeneralApi } from "@/hooks/useCatalogGeneral";
import type { Row } from "@/components/grid/DataGrid";
import {
  CsvCancelled,
  type CsvAdapter,
  type CsvColumn,
  type CsvPreview,
  type CsvIssue,
} from "@/components/csv/types";
import { pickCsvDestination } from "@/components/csv/files";
import { escribirArchivoTexto } from "@/lib/tauri";
import { celda, generarCsv, indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";

export interface CsvCatalogField {
  field: string;
  encabezado: string;
  obligatorio?: boolean;
}

export interface CatalogCsvConfig<T extends { id: string }, New> {
  title: string;
  defaultFile: string;
  fields: CsvCatalogField[];
  naturalKeyFromModel: (item: T) => string;
  naturalKeyFromRow: (values: Record<string, string>) => string;
  rowToNew: (row: Row) => New;
  toRow: (item: T) => Row;
}

function columnsFrom(fields: CsvCatalogField[]): CsvColumn[] {
  return fields.map((f) => ({ name: f.encabezado, required: !!f.obligatorio }));
}

export function importCatalogAdapter<T extends { id: string }, New>(
  config: CatalogCsvConfig<T, New>,
  items: T[],
  api: CatalogGeneralApi<T, New>,
): CsvAdapter {
  return {
    title: `Importar ${config.title}`,
    mode: "import",
    columns: columnsFrom(config.fields),
    policy: "partial",
    template: () => plantillaCsv(config.fields.map((f) => f.encabezado)),
    defaultFile: config.defaultFile,
    runningMessage: `Importando ${config.title.toLowerCase()}…`,
    confirmLabel: "Importar",
    preview: (content) => previewCatalog(config, content, items),
    run: async (ctx, onProgress) => {
      const preview = ctx.preview.payload as CatalogPreview<New> | undefined;
      const rows = preview?.rows ?? [];
      const total = rows.length;
      let created = 0;
      let updated = 0;
      const issues: CsvIssue[] = [...ctx.preview.issues];
      for (let i = 0; i < rows.length; i++) {
        onProgress({
          current: i + 1,
          total,
          message: `Importando ${config.title.toLowerCase()}…`,
        });
        const row = rows[i];
        try {
          if (row.id) {
            await api.update(row.id, row.data);
            updated++;
          } else {
            await api.create(row.data);
            created++;
          }
        } catch (e) {
          issues.push({ message: `No se pudo guardar "${row.key}": ${String(e)}` });
        }
      }
      return {
        created,
        updated,
        skipped: ctx.preview.skipped,
        issues,
        warnings: ctx.preview.warnings,
      };
    },
  };
}

export function exportCatalogAdapter<T extends { id: string }, New>(
  config: CatalogCsvConfig<T, New>,
  items: T[],
): CsvAdapter {
  return {
    title: `Exportar ${config.title}`,
    mode: "export",
    columns: columnsFrom(config.fields),
    policy: "partial",
    template: () => plantillaCsv(config.fields.map((f) => f.encabezado)),
    defaultFile: config.defaultFile,
    runningMessage: `Exportando ${config.title.toLowerCase()}…`,
    previewExport: () => ({
      ready: items.length,
      skipped: 0,
      issues: [],
      warnings: [],
    }),
    run: async (_ctx, onProgress) => {
      const path = await pickCsvDestination(config.defaultFile);
      if (!path) throw new CsvCancelled();
      onProgress({ current: 0, total: items.length, message: `Exportando ${config.title.toLowerCase()}…` });
      const rows = items.map((item) => {
        const row = config.toRow(item);
        return config.fields.map((f) => String(row[f.field] ?? ""));
      });
      const content = generarCsv(
        config.fields.map((f) => f.encabezado),
        rows,
      );
      await escribirArchivoTexto(path, content);
      onProgress({ current: items.length, total: items.length, message: `Exportando ${config.title.toLowerCase()}…` });
      return {
        created: items.length,
        updated: 0,
        skipped: 0,
        issues: [],
        warnings: [],
        path,
      };
    },
  };
}

interface CatalogCsvRow<New> {
  key: string;
  id: string | null;
  data: New;
}

interface CatalogPreview<New> {
  rows: CatalogCsvRow<New>[];
}

function previewCatalog<T extends { id: string }, New>(
  config: CatalogCsvConfig<T, New>,
  content: string,
  items: T[],
): CsvPreview {
  const tabla = parsearCsv(content);
  if (tabla.filas.length === 0) {
    return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: "El archivo no tiene filas de datos." };
  }
  const missing = config.fields.filter((f) => f.obligatorio && indiceColumna(tabla, f.encabezado, f.field) < 0);
  if (missing.length > 0) {
    return {
      ready: 0,
      skipped: 0,
      issues: [],
      warnings: [],
      fatal: `El CSV debe tener las columnas ${missing.map((f) => `"${f.encabezado}"`).join(", ")}.`,
    };
  }

  const byKey = new Map<string, T>();
  for (const item of items) {
    const k = config.naturalKeyFromModel(item).trim().toLowerCase();
    if (k && !byKey.has(k)) byKey.set(k, item);
  }

  const seen = new Map<string, number>();
  const rows: CatalogCsvRow<New>[] = [];
  const issues: CsvIssue[] = [];
  let skipped = 0;

  for (let i = 0; i < tabla.filas.length; i++) {
    const nro = i + 2;
    const values: Record<string, string> = {};
    const row: Row = { _id: `tmp-${i}` };
    for (const f of config.fields) {
      const idx = indiceColumna(tabla, f.encabezado, f.field);
      const v = celda(tabla.filas[i], idx);
      values[f.field] = v;
      row[f.field] = v;
    }
    const key = config.naturalKeyFromRow(values).trim();
    if (!key) {
      issues.push({ message: `Fila ${nro}: clave vacía.` });
      skipped++;
      continue;
    }
    const k = key.toLowerCase();
    const previous = seen.get(k);
    if (previous !== undefined) {
      issues.push({ message: `Fila ${nro}: "${key}" está duplicado (también en la fila ${previous}).` });
      skipped++;
      continue;
    }
    seen.set(k, nro);
    const existing = byKey.get(k);
    try {
      const data = config.rowToNew(row);
      rows.push({ key, id: existing?.id ?? null, data });
    } catch (e) {
      issues.push({ message: `Fila ${nro}: ${String(e)}` });
      skipped++;
    }
  }

  return {
    ready: rows.length,
    skipped,
    issues,
    warnings: [],
    payload: { rows } satisfies CatalogPreview<New>,
  };
}
