import { CsvCancelled, type CsvAdapter, type CsvIssue } from "@/components/csv/types";
import { pickCsvDestination } from "@/components/csv/files";
import { celda, generarCsv, indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";
import { createFamiliaInsumo, updateFamiliaInsumo, escribirArchivoTexto } from "@/lib/tauri";
import type { FamiliaInsumo } from "@/lib/types";

export function adaptadorImportFamilias(items: FamiliaInsumo[]): CsvAdapter {
  return {
    title: "Importar familias de insumo",
    mode: "import",
    columns: [
      { name: "Familia", required: true },
      { name: "Subfamilia", required: false },
      { name: "Icono", required: false },
      { name: "Insumos asociados", required: false },
    ],
    policy: "partial",
    template: () => plantillaCsv(["Familia", "Subfamilia", "Icono", "Insumos asociados"]),
    defaultFile: "familias-insumo.csv",
    runningMessage: "Importando familias…",
    preview: (content) => {
      const tabla = parsearCsv(content);
      if (tabla.filas.length === 0) {
        return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: "El archivo no tiene filas de datos." };
      }
      if (indiceColumna(tabla, "Familia") < 0) {
        return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: 'El CSV debe tener la columna "Familia".' };
      }
      return { ready: tabla.filas.length, skipped: 0, issues: [], warnings: [], payload: tabla };
    },
    run: async (ctx, onProgress) => {
      const tabla = ctx.preview.payload as ReturnType<typeof parsearCsv>;
      const idxFam = indiceColumna(tabla, "Familia");
      const idxSub = indiceColumna(tabla, "Subfamilia");
      const idxIcono = indiceColumna(tabla, "Icono");
      const idxInsumos = indiceColumna(tabla, "Insumos asociados", "Insumos_asociados");
      const current = [...items];
      const rootByName = () =>
        new Map(current.filter((f) => !f.parent_id).map((f) => [f.nombre.toLowerCase(), f]));
      const childByParentAndName = () => {
        const m = new Map<string, FamiliaInsumo>();
        for (const f of current) {
          if (f.parent_id) m.set(`${f.parent_id}::${f.nombre.toLowerCase()}`, f);
        }
        return m;
      };
      let created = 0;
      let updated = 0;
      const issues: CsvIssue[] = [];
      for (let i = 0; i < tabla.filas.length; i++) {
        onProgress({ current: i + 1, total: tabla.filas.length, message: "Importando familias…" });
        const familia = celda(tabla.filas[i], idxFam);
        if (!familia) {
          issues.push({ message: `Fila ${i + 2}: familia vacía.` });
          continue;
        }
        const sub = celda(tabla.filas[i], idxSub);
        const icono = celda(tabla.filas[i], idxIcono) || null;
        const insumos = celda(tabla.filas[i], idxInsumos) || null;
        try {
          let root = rootByName().get(familia.toLowerCase());
          if (!root) {
            root = await createFamiliaInsumo({ nombre: familia, icono: sub ? null : icono, insumos_asociados: sub ? null : insumos });
            current.push(root);
            created++;
          } else if (!sub) {
            await updateFamiliaInsumo(root.id, { nombre: familia, icono, insumos_asociados: insumos, parent_id: null });
            updated++;
          }
          if (sub) {
            const key = `${root.id}::${sub.toLowerCase()}`;
            const child = childByParentAndName().get(key);
            if (child) {
              await updateFamiliaInsumo(child.id, { nombre: sub, icono, insumos_asociados: insumos, parent_id: root.id });
              updated++;
            } else {
              const nueva = await createFamiliaInsumo({
                nombre: sub,
                parent_id: root.id,
                icono,
                insumos_asociados: insumos,
              });
              current.push(nueva);
              created++;
            }
          }
        } catch (e) {
          issues.push({ message: `Fila ${i + 2}: ${String(e)}` });
        }
      }
      return { created, updated, skipped: 0, issues, warnings: [] };
    },
  };
}

export function adaptadorExportFamilias(items: FamiliaInsumo[]): CsvAdapter {
  const raices = items.filter((f) => !f.parent_id);
  const nombrePorId = Object.fromEntries(items.map((f) => [f.id, f.nombre]));
  const hijas = items.filter((f) => f.parent_id);
  const rows: string[][] = [];
  for (const r of raices) {
    const kids = hijas.filter((h) => h.parent_id === r.id);
    if (kids.length === 0) {
      rows.push([r.nombre, "", r.icono ?? "", r.insumos_asociados ?? ""]);
    } else {
      for (const h of kids) {
        rows.push([nombrePorId[h.parent_id!] ?? r.nombre, h.nombre, h.icono ?? r.icono ?? "", h.insumos_asociados ?? ""]);
      }
    }
  }
  return {
    title: "Exportar familias de insumo",
    mode: "export",
    columns: [
      { name: "Familia", required: true },
      { name: "Subfamilia", required: false },
      { name: "Icono", required: false },
      { name: "Insumos asociados", required: false },
    ],
    policy: "partial",
    defaultFile: "familias-insumo.csv",
    runningMessage: "Exportando…",
    previewExport: () => ({ ready: rows.length, skipped: 0, issues: [], warnings: [] }),
    run: async (_ctx, onProgress) => {
      const path = await pickCsvDestination("familias-insumo.csv");
      if (!path) throw new CsvCancelled();
      onProgress({ current: 0, total: rows.length, message: "Exportando…" });
      await escribirArchivoTexto(path, generarCsv(["Familia", "Subfamilia", "Icono", "Insumos asociados"], rows));
      return { created: rows.length, updated: 0, skipped: 0, issues: [], warnings: [], path };
    },
  };
}
