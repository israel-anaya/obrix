import { importarMaterialesCsv } from "@/lib/tauri";
import { exportRowsAdapter, importBackendAdapter } from "@/components/csv/backendAdapter";
import type { CsvAdapter } from "@/components/csv/types";
import type { FamiliaInsumo, Material, UnidadMedida } from "@/lib/types";

const MATERIAL_COLUMNS = [
  { name: "Clave", required: false },
  { name: "Descripción", required: true },
  { name: "Unidad", required: true },
  { name: "Costo", required: true },
  { name: "Familia", required: false },
  { name: "Subfamilia", required: false },
];

export function adaptadorImportMateriales(): CsvAdapter {
  return importBackendAdapter({
    title: "Importar materiales",
    columns: MATERIAL_COLUMNS,
    required: [
      { name: "Descripción", aliases: ["descripcion"] },
      { name: "Unidad" },
      { name: "Costo" },
    ],
    defaultFile: "materiales.csv",
    runningMessage: "Importando materiales…",
    keyColumn: "Clave",
    noKeyWarning: 'El archivo no tiene columna "Clave"; se generarán claves automáticas con el prefijo MAT-.',
    importFn: importarMaterialesCsv,
  });
}

export function adaptadorExportMateriales(
  materiales: Material[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdapter {
  const simboloPorId = Object.fromEntries(unidades.map((u) => [u.id, u.simbolo]));
  const nombrePorId = Object.fromEntries(familias.map((f) => [f.id, f.nombre]));
  return exportRowsAdapter({
    title: "Exportar materiales",
    defaultFile: "materiales.csv",
    headers: ["Clave", "Descripción", "Unidad", "Costo", "Familia", "Subfamilia"],
    rows: materiales.map((m) => [
      m.clave,
      m.descripcion,
      simboloPorId[m.unidad_id] ?? "",
      m.precio_vigente ?? "",
      (m.familia_id && nombrePorId[m.familia_id]) || "",
      (m.sub_familia_id && nombrePorId[m.sub_familia_id]) || "",
    ]),
  });
}
