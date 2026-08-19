import { adaptadorImportBackend } from "@/components/csv/adaptadorBackend";
import { CsvCancelado } from "@/components/csv/tipos";
import type { CsvAdaptador, CsvPrevisualizacion } from "@/components/csv/tipos";
import { elegirDestinoCsv } from "@/components/csv/archivos";
import { celda, generarCsvConSecciones, indiceColumna, parsearCsvConSecciones } from "@/lib/csv";
import {
  importarCuadrillasCsv,
  listCategoriasFasar,
  listCuadrillaDetalles,
  listHerramientas,
  escribirArchivoTexto,
} from "@/lib/tauri";
import type { CategoriaFasar, Cuadrilla, FamiliaInsumo, Herramienta, UnidadMedida } from "@/lib/types";

const ENCABEZADOS_MAESTRO = ["Clave", "Descripción", "Unidad", "Familia", "Subfamilia"] as const;
const ENCABEZADOS_DETALLE = [
  "Clave Cuadrilla",
  "Sección",
  "Clave Insumo",
  "Descripción Insumo",
  "Unidad",
  "Cantidad",
] as const;

const COLUMNAS_CUADRILLA = [
  { nombre: "MAESTRO · Clave", obligatorio: true },
  { nombre: "MAESTRO · Descripción", obligatorio: true },
  { nombre: "MAESTRO · Unidad", obligatorio: false },
  { nombre: "MAESTRO · Familia", obligatorio: false },
  { nombre: "MAESTRO · Subfamilia", obligatorio: false },
  { nombre: "DETALLE · Clave Cuadrilla", obligatorio: true },
  { nombre: "DETALLE · Sección", obligatorio: true },
  { nombre: "DETALLE · Clave Insumo", obligatorio: false },
  { nombre: "DETALLE · Descripción Insumo", obligatorio: true },
  { nombre: "DETALLE · Unidad", obligatorio: false },
  { nombre: "DETALLE · Cantidad", obligatorio: true },
];

function plantillaCuadrillas(): string {
  return generarCsvConSecciones([
    { nombre: "MAESTRO", encabezados: [...ENCABEZADOS_MAESTRO], filas: [] },
    { nombre: "DETALLE", encabezados: [...ENCABEZADOS_DETALLE], filas: [] },
  ]);
}

function previsualizarCuadrillasCsv(contenido: string): CsvPrevisualizacion {
  const { maestro, detalle } = parsearCsvConSecciones(contenido);
  if (!maestro) {
    return {
      listos: 0,
      omitidos: 0,
      problemas: [],
      avisos: [],
      fatal: 'El archivo debe tener la sección "MAESTRO".',
    };
  }
  if (!detalle) {
    return {
      listos: 0,
      omitidos: 0,
      problemas: [],
      avisos: [],
      fatal: 'El archivo debe tener la sección "DETALLE".',
    };
  }
  const faltantesMaestro = (["Clave", "Descripción"] as const).filter(
    (nombre) => indiceColumna(maestro, nombre) < 0,
  );
  const faltantesDetalle = (
    [
      ["Clave Cuadrilla", ["clave"]],
      ["Sección", ["seccion"]],
      ["Descripción Insumo", ["descripcion insumo", "descripcion"]],
      ["Cantidad", []],
    ] as const
  ).filter(([nombre, aliases]) => indiceColumna(detalle, nombre, ...aliases) < 0);
  if (faltantesMaestro.length > 0 || faltantesDetalle.length > 0) {
    const nombres = [
      ...faltantesMaestro.map((n) => `"${n}" (MAESTRO)`),
      ...faltantesDetalle.map(([n]) => `"${n}" (DETALLE)`),
    ];
    return {
      listos: 0,
      omitidos: 0,
      problemas: [],
      avisos: [],
      fatal: `El CSV debe tener las columnas ${nombres.join(", ")}.`,
    };
  }
  const colClave = indiceColumna(maestro, "Clave");
  const problemas: { mensaje: string }[] = [];
  let listos = 0;
  let omitidos = 0;
  for (const fila of maestro.filas) {
    if (!celda(fila, colClave)) {
      omitidos += 1;
      problemas.push({ mensaje: "Fila de MAESTRO sin clave; se omitirá." });
    } else {
      listos += 1;
    }
  }
  if (listos === 0 && omitidos === 0) {
    return {
      listos: 0,
      omitidos: 0,
      problemas: [],
      avisos: [],
      fatal: "El MAESTRO no tiene filas de datos.",
    };
  }
  return { listos, omitidos, problemas, avisos: [] };
}

export function adaptadorImportCuadrillas(): CsvAdaptador {
  const base = adaptadorImportBackend({
    titulo: "Importar cuadrillas",
    columnas: COLUMNAS_CUADRILLA,
    obligatorias: [{ nombre: "Clave" }, { nombre: "Descripción" }],
    archivoDefault: "cuadrillas.csv",
    mensajeEjecutando: "Importando cuadrillas…",
    importar: importarCuadrillasCsv,
  });
  return {
    ...base,
    plantilla: plantillaCuadrillas,
    previsualizar: previsualizarCuadrillasCsv,
  };
}

export function adaptadorExportCuadrillas(
  cuadrillas: Cuadrilla[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
  const simboloPorId = Object.fromEntries(unidades.map((u) => [u.id, u.simbolo]));
  const nombrePorId = Object.fromEntries(familias.map((f) => [f.id, f.nombre]));
  return {
    titulo: "Exportar cuadrillas",
    modo: "exportar",
    columnas: COLUMNAS_CUADRILLA,
    politica: "parcial",
    plantilla: plantillaCuadrillas,
    archivoDefault: "cuadrillas.csv",
    mensajeEjecutando: "Exportando…",
    previsualizarExport: () => ({
      listos: cuadrillas.length,
      omitidos: 0,
      problemas: [],
      avisos: [],
    }),
    ejecutar: async (_ctx, onProgreso) => {
      const path = await elegirDestinoCsv("cuadrillas.csv");
      if (!path) throw new CsvCancelado();
      onProgreso({ actual: 0, total: cuadrillas.length, mensaje: "Exportando…" });
      const [categorias, herramientas, paresDetalle] = await Promise.all([
        listCategoriasFasar(),
        listHerramientas(),
        Promise.all(
          cuadrillas.map(async (c) => [c.id, await listCuadrillaDetalles(c.id)] as const),
        ),
      ]);
      const insumoPorId = new Map<string, CategoriaFasar | Herramienta>();
      for (const item of [...categorias, ...herramientas]) {
        insumoPorId.set(item.id, item);
      }
      const detallePorCuadrilla = Object.fromEntries(paresDetalle);
      const filasMaestro = cuadrillas.map((c) => [
        c.clave,
        c.descripcion,
        simboloPorId[c.unidad_id] ?? "",
        (c.familia_id && nombrePorId[c.familia_id]) || "",
        (c.sub_familia_id && nombrePorId[c.sub_familia_id]) || "",
      ]);
      const filasDetalle: string[][] = [];
      for (const c of cuadrillas) {
        for (const d of detallePorCuadrilla[c.id] ?? []) {
          const insumo = insumoPorId.get(d.detalle_insumo_id);
          filasDetalle.push([
            c.clave,
            d.tipo === "categoria_fasar" ? "MANO DE OBRA" : "EQUIPO Y HERRAMIENTA",
            insumo?.clave ?? "",
            insumo?.descripcion ?? "",
            insumo ? (simboloPorId[insumo.unidad_id] ?? "") : "",
            d.cantidad,
          ]);
        }
      }
      await escribirArchivoTexto(
        path,
        generarCsvConSecciones([
          { nombre: "MAESTRO", encabezados: [...ENCABEZADOS_MAESTRO], filas: filasMaestro },
          { nombre: "DETALLE", encabezados: [...ENCABEZADOS_DETALLE], filas: filasDetalle },
        ]),
      );
      onProgreso({ actual: cuadrillas.length, total: cuadrillas.length, mensaje: "Exportando…" });
      return {
        creados: cuadrillas.length,
        actualizados: 0,
        omitidos: 0,
        problemas: [],
        avisos: [],
        ruta: path,
      };
    },
  };
}
