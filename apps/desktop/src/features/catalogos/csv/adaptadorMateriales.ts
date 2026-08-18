import { importarMaterialesCsv } from "@/lib/tauri";
import { adaptadorExportFilas, adaptadorImportBackend } from "@/components/csv/adaptadorBackend";
import type { CsvAdaptador } from "@/components/csv/tipos";
import type { FamiliaInsumo, Material, UnidadMedida } from "@/lib/types";

const COLUMNAS_MATERIAL = [
  { nombre: "Clave", obligatorio: false },
  { nombre: "Descripción", obligatorio: true },
  { nombre: "Unidad", obligatorio: true },
  { nombre: "Costo", obligatorio: true },
  { nombre: "Familia", obligatorio: false },
  { nombre: "Subfamilia", obligatorio: false },
];

export function adaptadorImportMateriales(): CsvAdaptador {
  return adaptadorImportBackend({
    titulo: "Importar materiales",
    columnas: COLUMNAS_MATERIAL,
    obligatorias: [
      { nombre: "Descripción", aliases: ["descripcion"] },
      { nombre: "Unidad" },
      { nombre: "Costo" },
    ],
    archivoDefault: "materiales.csv",
    mensajeEjecutando: "Importando materiales…",
    colClave: "Clave",
    avisoSinClave: 'El archivo no tiene columna "Clave"; se generarán claves automáticas con el prefijo MAT-.',
    importar: importarMaterialesCsv,
  });
}

export function adaptadorExportMateriales(
  materiales: Material[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
  const simboloPorId = Object.fromEntries(unidades.map((u) => [u.id, u.simbolo]));
  const nombrePorId = Object.fromEntries(familias.map((f) => [f.id, f.nombre]));
  return adaptadorExportFilas({
    titulo: "Exportar materiales",
    archivoDefault: "materiales.csv",
    encabezados: ["Clave", "Descripción", "Unidad", "Costo", "Familia", "Subfamilia"],
    filas: materiales.map((m) => [
      m.clave,
      m.descripcion,
      simboloPorId[m.unidad_id] ?? "",
      m.precio_vigente ?? "",
      (m.familia_id && nombrePorId[m.familia_id]) || "",
      (m.sub_familia_id && nombrePorId[m.sub_familia_id]) || "",
    ]),
  });
}
