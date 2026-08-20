import {
  CsvCancelled,
  type CsvAdapter,
  type CsvColumn,
  type CsvPreview,
  type CsvResult,
} from "@/components/csv/types";
import { pickCsvDestination } from "@/components/csv/files";
import { listenCsvProgress } from "@/components/csv/progress";
import { indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";
import { escribirArchivoTexto } from "@/lib/tauri";
import type { ResultadoImportacion } from "@/lib/types";

export function resultFromImport(r: ResultadoImportacion): CsvResult {
  return {
    created: r.creados,
    updated: r.actualizados,
    skipped: 0,
    issues: r.errores.map((message) => ({ message })),
    warnings: r.aviso ? [r.aviso] : [],
  };
}

export function previewCsvUpsert(
  content: string,
  required: { name: string; aliases?: string[] }[],
  options?: { keyColumn?: string; noKeyWarning?: string },
): CsvPreview {
  const tabla = parsearCsv(content);
  if (tabla.filas.length === 0) {
    return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: "El archivo no tiene filas de datos." };
  }
  const missing = required.filter((c) => indiceColumna(tabla, c.name, ...(c.aliases ?? [])) < 0);
  if (missing.length > 0) {
    return {
      ready: 0,
      skipped: 0,
      issues: [],
      warnings: [],
      fatal: `El CSV debe tener las columnas ${missing.map((c) => `"${c.name}"`).join(", ")}.`,
    };
  }
  const warnings: string[] = [];
  if (options?.keyColumn && options.noKeyWarning && indiceColumna(tabla, options.keyColumn) < 0) {
    warnings.push(options.noKeyWarning);
  }
  return { ready: tabla.filas.length, skipped: 0, issues: [], warnings };
}

export function importBackendAdapter(opts: {
  title: string;
  columns: CsvColumn[];
  required: { name: string; aliases?: string[] }[];
  defaultFile: string;
  runningMessage: string;
  keyColumn?: string;
  noKeyWarning?: string;
  importFn: (path: string) => Promise<ResultadoImportacion>;
}): CsvAdapter {
  return {
    title: opts.title,
    mode: "import",
    columns: opts.columns,
    policy: "partial",
    template: () => plantillaCsv(opts.columns.map((c) => c.name)),
    defaultFile: opts.defaultFile,
    runningMessage: opts.runningMessage,
    confirmLabel: "Importar",
    preview: (content) =>
      previewCsvUpsert(content, opts.required, {
        keyColumn: opts.keyColumn,
        noKeyWarning: opts.noKeyWarning,
      }),
    run: async (ctx, onProgress) => {
      if (!ctx.path) {
        throw new Error("No hay archivo seleccionado.");
      }
      onProgress({ current: 0, total: ctx.preview.ready || null, message: opts.runningMessage });
      const stop = await listenCsvProgress((p) => {
        onProgress({
          current: p.actual,
          total: p.total,
          message: opts.runningMessage,
        });
      });
      try {
        const r = await opts.importFn(ctx.path);
        return resultFromImport(r);
      } finally {
        stop();
      }
    },
  };
}

export function exportRowsAdapter(opts: {
  title: string;
  defaultFile: string;
  headers: string[];
  rows: string[][];
}): CsvAdapter {
  return {
    title: opts.title,
    mode: "export",
    columns: opts.headers.map((name) => ({ name, required: true })),
    policy: "partial",
    template: () => plantillaCsv(opts.headers),
    defaultFile: opts.defaultFile,
    runningMessage: "Exportando…",
    previewExport: () => ({
      ready: opts.rows.length,
      skipped: 0,
      issues: [],
      warnings: [],
    }),
    run: async (_ctx, onProgress) => {
      const path = await pickCsvDestination(opts.defaultFile);
      if (!path) throw new CsvCancelled();
      onProgress({ current: 0, total: opts.rows.length, message: "Exportando…" });
      const { generarCsv } = await import("@/lib/csv");
      await escribirArchivoTexto(path, generarCsv(opts.headers, opts.rows));
      onProgress({ current: opts.rows.length, total: opts.rows.length, message: "Exportando…" });
      return {
        created: opts.rows.length,
        updated: 0,
        skipped: 0,
        issues: [],
        warnings: [],
        path,
      };
    },
  };
}
