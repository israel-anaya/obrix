import {
  CsvCancelado,
  type CsvAdaptador,
  type CsvColumna,
  type CsvPrevisualizacion,
  type CsvResultado,
} from "@/components/csv/tipos";
import { elegirDestinoCsv } from "@/components/csv/archivos";
import { escucharProgresoCsv } from "@/components/csv/progreso";
import { indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";
import { escribirArchivoTexto } from "@/lib/tauri";
import type { ResultadoImportacion } from "@/lib/types";

export function resultadoDesdeImportacion(r: ResultadoImportacion): CsvResultado {
  return {
    creados: r.creados,
    actualizados: r.actualizados,
    omitidos: 0,
    problemas: r.errores.map((mensaje) => ({ mensaje })),
    avisos: r.aviso ? [r.aviso] : [],
  };
}

export function previsualizarAltaCsv(
  contenido: string,
  obligatorias: { nombre: string; aliases?: string[] }[],
  opciones?: { colClave?: string; avisoSinClave?: string },
): CsvPrevisualizacion {
  const tabla = parsearCsv(contenido);
  if (tabla.filas.length === 0) {
    return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: "El archivo no tiene filas de datos." };
  }
  const faltantes = obligatorias.filter((c) => indiceColumna(tabla, c.nombre, ...(c.aliases ?? [])) < 0);
  if (faltantes.length > 0) {
    return {
      listos: 0,
      omitidos: 0,
      problemas: [],
      avisos: [],
      fatal: `El CSV debe tener las columnas ${faltantes.map((c) => `"${c.nombre}"`).join(", ")}.`,
    };
  }
  const avisos: string[] = [];
  if (opciones?.colClave && opciones.avisoSinClave && indiceColumna(tabla, opciones.colClave) < 0) {
    avisos.push(opciones.avisoSinClave);
  }
  return { listos: tabla.filas.length, omitidos: 0, problemas: [], avisos };
}

export function adaptadorImportBackend(opts: {
  titulo: string;
  columnas: CsvColumna[];
  obligatorias: { nombre: string; aliases?: string[] }[];
  archivoDefault: string;
  mensajeEjecutando: string;
  colClave?: string;
  avisoSinClave?: string;
  importar: (path: string) => Promise<ResultadoImportacion>;
}): CsvAdaptador {
  return {
    titulo: opts.titulo,
    modo: "importar",
    columnas: opts.columnas,
    politica: "parcial",
    plantilla: () => plantillaCsv(opts.columnas.map((c) => c.nombre)),
    archivoDefault: opts.archivoDefault,
    mensajeEjecutando: opts.mensajeEjecutando,
    etiquetaConfirmar: "Importar",
    previsualizar: (contenido) =>
      previsualizarAltaCsv(contenido, opts.obligatorias, {
        colClave: opts.colClave,
        avisoSinClave: opts.avisoSinClave,
      }),
    ejecutar: async (ctx, onProgreso) => {
      if (!ctx.path) {
        throw new Error("No hay archivo seleccionado.");
      }
      onProgreso({ actual: 0, total: ctx.preview.listos || null, mensaje: opts.mensajeEjecutando });
      const stop = await escucharProgresoCsv((p) => {
        onProgreso({
          actual: p.actual,
          total: p.total,
          mensaje: opts.mensajeEjecutando,
        });
      });
      try {
        const r = await opts.importar(ctx.path);
        return resultadoDesdeImportacion(r);
      } finally {
        stop();
      }
    },
  };
}

export function adaptadorExportFilas(opts: {
  titulo: string;
  archivoDefault: string;
  encabezados: string[];
  filas: string[][];
}): CsvAdaptador {
  return {
    titulo: opts.titulo,
    modo: "exportar",
    columnas: opts.encabezados.map((nombre) => ({ nombre, obligatorio: true })),
    politica: "parcial",
    plantilla: () => plantillaCsv(opts.encabezados),
    archivoDefault: opts.archivoDefault,
    mensajeEjecutando: "Exportando…",
    previsualizarExport: () => ({
      listos: opts.filas.length,
      omitidos: 0,
      problemas: [],
      avisos: [],
    }),
    ejecutar: async (_ctx, onProgreso) => {
      const path = await elegirDestinoCsv(opts.archivoDefault);
      if (!path) throw new CsvCancelado();
      onProgreso({ actual: 0, total: opts.filas.length, mensaje: "Exportando…" });
      const { generarCsv } = await import("@/lib/csv");
      await escribirArchivoTexto(path, generarCsv(opts.encabezados, opts.filas));
      onProgreso({ actual: opts.filas.length, total: opts.filas.length, mensaje: "Exportando…" });
      return {
        creados: opts.filas.length,
        actualizados: 0,
        omitidos: 0,
        problemas: [],
        avisos: [],
        ruta: path,
      };
    },
  };
}
