import { CsvCancelled, type CsvAdapter, type CsvIssue } from "@/components/csv/types";
import { pickCsvDestination } from "@/components/csv/files";
import { celda, generarCsv, indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";
import {
  createPerfilInactividadEquipo,
  updatePerfilInactividadEquipo,
  escribirArchivoTexto,
} from "@/lib/tauri";
import type { PerfilInactividadEquipo, PerfilInactividadEquipoData } from "@/lib/types";

const CAMPOS: { field: keyof PerfilInactividadEquipoData; encabezado: string; obligatorio?: boolean }[] = [
  { field: "nombre", encabezado: "Nombre", obligatorio: true },
  { field: "espera_depreciacion_porcentaje", encabezado: "EsperaDepreciacion" },
  { field: "espera_inversion_porcentaje", encabezado: "EsperaInversion" },
  { field: "espera_seguro_porcentaje", encabezado: "EsperaSeguro" },
  { field: "espera_mantenimiento_porcentaje", encabezado: "EsperaMantenimiento" },
  { field: "espera_combustible_porcentaje", encabezado: "EsperaCombustible" },
  { field: "espera_lubricante_porcentaje", encabezado: "EsperaLubricante" },
  { field: "espera_llantas_porcentaje", encabezado: "EsperaLlantas" },
  { field: "espera_piezas_especiales_porcentaje", encabezado: "EsperaPiezasEspeciales" },
  { field: "espera_otras_fuentes_porcentaje", encabezado: "EsperaOtrasFuentes" },
  { field: "espera_operacion_porcentaje", encabezado: "EsperaOperacion" },
  { field: "reserva_depreciacion_porcentaje", encabezado: "ReservaDepreciacion" },
  { field: "reserva_inversion_porcentaje", encabezado: "ReservaInversion" },
  { field: "reserva_seguro_porcentaje", encabezado: "ReservaSeguro" },
  { field: "reserva_mantenimiento_porcentaje", encabezado: "ReservaMantenimiento" },
  { field: "reserva_combustible_porcentaje", encabezado: "ReservaCombustible" },
  { field: "reserva_lubricante_porcentaje", encabezado: "ReservaLubricante" },
  { field: "reserva_llantas_porcentaje", encabezado: "ReservaLlantas" },
  { field: "reserva_piezas_especiales_porcentaje", encabezado: "ReservaPiezasEspeciales" },
  { field: "reserva_otras_fuentes_porcentaje", encabezado: "ReservaOtrasFuentes" },
  { field: "reserva_operacion_porcentaje", encabezado: "ReservaOperacion" },
];

function vacioPerfil(nombre: string): PerfilInactividadEquipoData {
  const z = "0";
  return {
    nombre,
    espera_depreciacion_porcentaje: z,
    espera_inversion_porcentaje: z,
    espera_seguro_porcentaje: z,
    espera_mantenimiento_porcentaje: z,
    espera_combustible_porcentaje: z,
    espera_lubricante_porcentaje: z,
    espera_llantas_porcentaje: z,
    espera_piezas_especiales_porcentaje: z,
    espera_otras_fuentes_porcentaje: z,
    espera_operacion_porcentaje: z,
    reserva_depreciacion_porcentaje: z,
    reserva_inversion_porcentaje: z,
    reserva_seguro_porcentaje: z,
    reserva_mantenimiento_porcentaje: z,
    reserva_combustible_porcentaje: z,
    reserva_lubricante_porcentaje: z,
    reserva_llantas_porcentaje: z,
    reserva_piezas_especiales_porcentaje: z,
    reserva_otras_fuentes_porcentaje: z,
    reserva_operacion_porcentaje: z,
  };
}

export function adaptadorImportPerfiles(items: PerfilInactividadEquipo[]): CsvAdapter {
  return {
    title: "Importar perfiles de inactividad",
    mode: "import",
    columns: CAMPOS.map((c) => ({ name: c.encabezado, required: !!c.obligatorio })),
    policy: "partial",
    template: () => plantillaCsv(CAMPOS.map((c) => c.encabezado)),
    defaultFile: "perfiles-inactividad.csv",
    runningMessage: "Importando perfiles…",
    preview: (content) => {
      const tabla = parsearCsv(content);
      if (tabla.filas.length === 0) {
        return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: "El archivo no tiene filas de datos." };
      }
      if (indiceColumna(tabla, "Nombre") < 0) {
        return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: 'El CSV debe tener la columna "Nombre".' };
      }
      return { ready: tabla.filas.length, skipped: 0, issues: [], warnings: [], payload: tabla };
    },
    run: async (ctx, onProgress) => {
      const tabla = ctx.preview.payload as ReturnType<typeof parsearCsv>;
      const byName = new Map(items.map((p) => [p.nombre.toLowerCase(), p]));
      let created = 0;
      let updated = 0;
      const issues: CsvIssue[] = [];
      for (let i = 0; i < tabla.filas.length; i++) {
        onProgress({ current: i + 1, total: tabla.filas.length, message: "Importando perfiles…" });
        const nombre = celda(tabla.filas[i], indiceColumna(tabla, "Nombre"));
        if (!nombre) {
          issues.push({ message: `Fila ${i + 2}: nombre vacío.` });
          continue;
        }
        const data = vacioPerfil(nombre);
        for (const c of CAMPOS) {
          if (c.field === "nombre") continue;
          const idx = indiceColumna(tabla, c.encabezado);
          const v = celda(tabla.filas[i], idx);
          if (v) data[c.field] = v.replace(/[^\d.-]/g, "") || "0";
        }
        try {
          const existing = byName.get(nombre.toLowerCase());
          if (existing) {
            await updatePerfilInactividadEquipo(existing.id, data);
            updated++;
          } else {
            await createPerfilInactividadEquipo(data);
            created++;
          }
        } catch (e) {
          issues.push({ message: `Fila ${i + 2}: ${String(e)}` });
        }
      }
      return { created, updated, skipped: 0, issues, warnings: [] };
    },
  };
}

export function adaptadorExportPerfiles(items: PerfilInactividadEquipo[]): CsvAdapter {
  return {
    title: "Exportar perfiles de inactividad",
    mode: "export",
    columns: CAMPOS.map((c) => ({ name: c.encabezado, required: false })),
    policy: "partial",
    defaultFile: "perfiles-inactividad.csv",
    runningMessage: "Exportando…",
    previewExport: () => ({ ready: items.length, skipped: 0, issues: [], warnings: [] }),
    run: async (_ctx, onProgress) => {
      const path = await pickCsvDestination("perfiles-inactividad.csv");
      if (!path) throw new CsvCancelled();
      onProgress({ current: 0, total: items.length, message: "Exportando…" });
      const rows = items.map((p) => CAMPOS.map((c) => String(p[c.field] ?? "")));
      await escribirArchivoTexto(path, generarCsv(CAMPOS.map((c) => c.encabezado), rows));
      return { created: items.length, updated: 0, skipped: 0, issues: [], warnings: [], path };
    },
  };
}
