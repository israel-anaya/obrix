import { CsvCancelled, type CsvAdapter } from "@/components/csv/types";
import { pickCsvDestination } from "@/components/csv/files";
import { escribirArchivoTexto } from "@/lib/tauri";
import { generarCsv, plantillaCsv } from "@/lib/csv";

export function columnasInsumo(colNombre: string) {
  return ["Clave", colNombre, "Unidad", "Familia", "Subfamilia"];
}

export function exportInsumo(
  title: string,
  file: string,
  headers: string[],
  rows: string[][],
): CsvAdapter {
  return {
    title,
    mode: "export",
    columns: headers.map((name) => ({ name, required: false })),
    policy: "partial",
    template: () => plantillaCsv(headers),
    defaultFile: file,
    runningMessage: "Exportando…",
    previewExport: () => ({ ready: rows.length, skipped: 0, issues: [], warnings: [] }),
    run: async (_ctx, onProgress) => {
      const path = await pickCsvDestination(file);
      if (!path) throw new CsvCancelled();
      onProgress({ current: 0, total: rows.length, message: "Exportando…" });
      await escribirArchivoTexto(path, generarCsv(headers, rows));
      return { created: rows.length, updated: 0, skipped: 0, issues: [], warnings: [], path };
    },
  };
}
