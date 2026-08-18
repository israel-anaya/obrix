import { CsvCancelado, type CsvAdaptador, type CsvProblema } from "@/components/csv/tipos";
import { elegirDestinoCsv } from "@/components/csv/archivos";
import { celda, generarCsv, indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";
import { createFamiliaInsumo, updateFamiliaInsumo, escribirArchivoTexto } from "@/lib/tauri";
import type { FamiliaInsumo } from "@/lib/types";

export function adaptadorImportFamilias(items: FamiliaInsumo[]): CsvAdaptador {
  return {
    titulo: "Importar familias de insumo",
    modo: "importar",
    columnas: [
      { nombre: "Familia", obligatorio: true },
      { nombre: "Subfamilia", obligatorio: false },
      { nombre: "Icono", obligatorio: false },
      { nombre: "Insumos asociados", obligatorio: false },
    ],
    politica: "parcial",
    plantilla: () => plantillaCsv(["Familia", "Subfamilia", "Icono", "Insumos asociados"]),
    archivoDefault: "familias-insumo.csv",
    mensajeEjecutando: "Importando familias…",
    previsualizar: (contenido) => {
      const tabla = parsearCsv(contenido);
      if (tabla.filas.length === 0) {
        return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: "El archivo no tiene filas de datos." };
      }
      if (indiceColumna(tabla, "Familia") < 0) {
        return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: 'El CSV debe tener la columna "Familia".' };
      }
      return { listos: tabla.filas.length, omitidos: 0, problemas: [], avisos: [], payload: tabla };
    },
    ejecutar: async (ctx, onProgreso) => {
      const tabla = ctx.preview.payload as ReturnType<typeof parsearCsv>;
      const idxFam = indiceColumna(tabla, "Familia");
      const idxSub = indiceColumna(tabla, "Subfamilia");
      const idxIcono = indiceColumna(tabla, "Icono");
      const idxInsumos = indiceColumna(tabla, "Insumos asociados", "Insumos_asociados");
      const actuales = [...items];
      const raizPorNombre = () =>
        new Map(actuales.filter((f) => !f.parent_id).map((f) => [f.nombre.toLowerCase(), f]));
      const hijaPorPadreYNombre = () => {
        const m = new Map<string, FamiliaInsumo>();
        for (const f of actuales) {
          if (f.parent_id) m.set(`${f.parent_id}::${f.nombre.toLowerCase()}`, f);
        }
        return m;
      };
      let creados = 0;
      let actualizados = 0;
      const problemas: CsvProblema[] = [];
      for (let i = 0; i < tabla.filas.length; i++) {
        onProgreso({ actual: i + 1, total: tabla.filas.length, mensaje: "Importando familias…" });
        const familia = celda(tabla.filas[i], idxFam);
        if (!familia) {
          problemas.push({ mensaje: `Fila ${i + 2}: familia vacía.` });
          continue;
        }
        const sub = celda(tabla.filas[i], idxSub);
        const icono = celda(tabla.filas[i], idxIcono) || null;
        const insumos = celda(tabla.filas[i], idxInsumos) || null;
        try {
          let raiz = raizPorNombre().get(familia.toLowerCase());
          if (!raiz) {
            raiz = await createFamiliaInsumo({ nombre: familia, icono: sub ? null : icono, insumos_asociados: sub ? null : insumos });
            actuales.push(raiz);
            creados++;
          } else if (!sub) {
            await updateFamiliaInsumo(raiz.id, { nombre: familia, icono, insumos_asociados: insumos, parent_id: null });
            actualizados++;
          }
          if (sub) {
            const key = `${raiz.id}::${sub.toLowerCase()}`;
            const hija = hijaPorPadreYNombre().get(key);
            if (hija) {
              await updateFamiliaInsumo(hija.id, { nombre: sub, icono, insumos_asociados: insumos, parent_id: raiz.id });
              actualizados++;
            } else {
              const nueva = await createFamiliaInsumo({
                nombre: sub,
                parent_id: raiz.id,
                icono,
                insumos_asociados: insumos,
              });
              actuales.push(nueva);
              creados++;
            }
          }
        } catch (e) {
          problemas.push({ mensaje: `Fila ${i + 2}: ${String(e)}` });
        }
      }
      return { creados, actualizados, omitidos: 0, problemas, avisos: [] };
    },
  };
}

export function adaptadorExportFamilias(items: FamiliaInsumo[]): CsvAdaptador {
  const raices = items.filter((f) => !f.parent_id);
  const nombrePorId = Object.fromEntries(items.map((f) => [f.id, f.nombre]));
  const hijas = items.filter((f) => f.parent_id);
  const filas: string[][] = [];
  for (const r of raices) {
    const kids = hijas.filter((h) => h.parent_id === r.id);
    if (kids.length === 0) {
      filas.push([r.nombre, "", r.icono ?? "", r.insumos_asociados ?? ""]);
    } else {
      for (const h of kids) {
        filas.push([nombrePorId[h.parent_id!] ?? r.nombre, h.nombre, h.icono ?? r.icono ?? "", h.insumos_asociados ?? ""]);
      }
    }
  }
  return {
    titulo: "Exportar familias de insumo",
    modo: "exportar",
    columnas: [
      { nombre: "Familia", obligatorio: true },
      { nombre: "Subfamilia", obligatorio: false },
      { nombre: "Icono", obligatorio: false },
      { nombre: "Insumos asociados", obligatorio: false },
    ],
    politica: "parcial",
    archivoDefault: "familias-insumo.csv",
    mensajeEjecutando: "Exportando…",
    previsualizarExport: () => ({ listos: filas.length, omitidos: 0, problemas: [], avisos: [] }),
    ejecutar: async (_ctx, onProgreso) => {
      const path = await elegirDestinoCsv("familias-insumo.csv");
      if (!path) throw new CsvCancelado();
      onProgreso({ actual: 0, total: filas.length, mensaje: "Exportando…" });
      await escribirArchivoTexto(path, generarCsv(["Familia", "Subfamilia", "Icono", "Insumos asociados"], filas));
      return { creados: filas.length, actualizados: 0, omitidos: 0, problemas: [], avisos: [], ruta: path };
    },
  };
}
