import { type CsvAdapter } from "@/components/csv/types";
import { importBackendAdapter } from "@/components/csv/backendAdapter";
import { importarHerramientasCsv } from "@/lib/tauri";
import type { FamiliaInsumo, Herramienta, UnidadMedida } from "@/lib/types";
import { mapasFamilia, mapasUnidad } from "@/features/catalogos/compartido/csv/insumoCsv";
import { columnasInsumo, exportInsumo } from "@/features/catalogos/compartido/csv/csvInsumo";

export function adaptadorImportHerramienta(): CsvAdapter {
  const headers = [...columnasInsumo("Herramienta"), "PorcentajeManoObra"];
  return importBackendAdapter({
    title: "Importar herramienta",
    columns: headers.map((name, i) => ({ name, required: i === 1 || i === 2 })),
    required: [
      { name: "Herramienta" },
      { name: "Unidad" },
    ],
    defaultFile: "herramienta.csv",
    runningMessage: "Importando herramienta…",
    keyColumn: "Clave",
    noKeyWarning: 'El archivo no tiene columna "Clave"; se generarán claves automáticas con el prefijo HER-.',
    importFn: importarHerramientasCsv,
  });
}

export function adaptadorExportHerramienta(
  items: Herramienta[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdapter {
  const u = mapasUnidad(unidades);
  const f = mapasFamilia(familias);
  return exportInsumo(
    "Exportar herramienta",
    "herramienta.csv",
    [...columnasInsumo("Herramienta"), "PorcentajeManoObra"],
    items.map((h) => [
      h.clave,
      h.descripcion,
      u.simboloPorId[h.unidad_id] ?? "",
      (h.familia_id && f.nombrePorId[h.familia_id]) || "",
      (h.sub_familia_id && f.nombrePorId[h.sub_familia_id]) || "",
      h.porcentaje_mano_obra != null ? String(h.porcentaje_mano_obra) : "",
    ]),
  );
}
