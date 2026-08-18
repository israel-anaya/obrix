import { importarCuadrillasCsv } from "@/lib/tauri";
import { adaptadorExportFilas, adaptadorImportBackend } from "@/components/csv/adaptadorBackend";
import type { CsvAdaptador } from "@/components/csv/tipos";
import type { Cuadrilla, FamiliaInsumo, UnidadMedida } from "@/lib/types";

const COLUMNAS_CUADRILLA = [
  { nombre: "Clave Cuadrilla", obligatorio: false },
  { nombre: "Descripción Cuadrilla", obligatorio: true },
  { nombre: "Sección", obligatorio: true },
  { nombre: "Descripción", obligatorio: true },
  { nombre: "Cantidad", obligatorio: true },
];

export function adaptadorImportCuadrillas(): CsvAdaptador {
  return adaptadorImportBackend({
    titulo: "Importar cuadrillas",
    columnas: COLUMNAS_CUADRILLA,
    obligatorias: [
      { nombre: "Descripción Cuadrilla", aliases: ["descripcion cuadrilla", "nombre cuadrilla"] },
      { nombre: "Sección", aliases: ["seccion"] },
      { nombre: "Descripción", aliases: ["descripcion"] },
      { nombre: "Cantidad" },
    ],
    archivoDefault: "cuadrillas.csv",
    mensajeEjecutando: "Importando cuadrillas…",
    colClave: "Clave Cuadrilla",
    avisoSinClave:
      'El archivo no tiene columna "Clave Cuadrilla"; se generarán claves automáticas con el prefijo CUA-.',
    importar: importarCuadrillasCsv,
  });
}

export function adaptadorExportCuadrillas(
  cuadrillas: Cuadrilla[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
  const simboloPorId = Object.fromEntries(unidades.map((u) => [u.id, u.simbolo]));
  const nombrePorId = Object.fromEntries(familias.map((f) => [f.id, f.nombre]));
  return adaptadorExportFilas({
    titulo: "Exportar cuadrillas",
    archivoDefault: "cuadrillas.csv",
    encabezados: ["Clave", "Descripción", "Unidad", "Familia", "Subfamilia"],
    filas: cuadrillas.map((c) => [
      c.clave,
      c.descripcion,
      simboloPorId[c.unidad_id] ?? "",
      (c.familia_id && nombrePorId[c.familia_id]) || "",
      (c.sub_familia_id && nombrePorId[c.sub_familia_id]) || "",
    ]),
  });
}
