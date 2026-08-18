import type { CatalogoGeneralApi } from "@/features/configuracion/useCatalogoGeneral";
import type { Row } from "@/components/grid/DataGrid";
import {
  CsvCancelado,
  type CsvAdaptador,
  type CsvColumna,
  type CsvPrevisualizacion,
  type CsvProblema,
} from "@/components/csv/tipos";
import { elegirDestinoCsv } from "@/components/csv/archivos";
import { escribirArchivoTexto } from "@/lib/tauri";
import { celda, generarCsv, indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";

export interface CsvCampoCatalogo {
  field: string;
  encabezado: string;
  obligatorio?: boolean;
}

export interface CatalogoCsvConfig<T extends { id: string }, Nuevo> {
  titulo: string;
  archivoDefault: string;
  campos: CsvCampoCatalogo[];
  claveNaturalModelo: (item: T) => string;
  claveNaturalFila: (valores: Record<string, string>) => string;
  filaANuevo: (fila: Row) => Nuevo;
  aFila: (item: T) => Row;
}

function columnasDe(campos: CsvCampoCatalogo[]): CsvColumna[] {
  return campos.map((c) => ({ nombre: c.encabezado, obligatorio: !!c.obligatorio }));
}

export function adaptadorImportCatalogo<T extends { id: string }, Nuevo>(
  config: CatalogoCsvConfig<T, Nuevo>,
  items: T[],
  api: CatalogoGeneralApi<T, Nuevo>,
): CsvAdaptador {
  return {
    titulo: `Importar ${config.titulo}`,
    modo: "importar",
    columnas: columnasDe(config.campos),
    politica: "parcial",
    plantilla: () => plantillaCsv(config.campos.map((c) => c.encabezado)),
    archivoDefault: config.archivoDefault,
    mensajeEjecutando: `Importando ${config.titulo.toLowerCase()}…`,
    etiquetaConfirmar: "Importar",
    previsualizar: (contenido) => previsualizarCatalogo(config, contenido, items),
    ejecutar: async (ctx, onProgreso) => {
      const preview = ctx.preview.payload as PreviewCatalogo<Nuevo> | undefined;
      const filas = preview?.filas ?? [];
      const total = filas.length;
      let creados = 0;
      let actualizados = 0;
      const problemas: CsvProblema[] = [...ctx.preview.problemas];
      for (let i = 0; i < filas.length; i++) {
        onProgreso({
          actual: i + 1,
          total,
          mensaje: `Importando ${config.titulo.toLowerCase()}…`,
        });
        const fila = filas[i];
        try {
          if (fila.id) {
            await api.actualizar(fila.id, fila.nuevo);
            actualizados++;
          } else {
            await api.crear(fila.nuevo);
            creados++;
          }
        } catch (e) {
          problemas.push({ mensaje: `No se pudo guardar "${fila.clave}": ${String(e)}` });
        }
      }
      return {
        creados,
        actualizados,
        omitidos: ctx.preview.omitidos,
        problemas,
        avisos: ctx.preview.avisos,
      };
    },
  };
}

export function adaptadorExportCatalogo<T extends { id: string }, Nuevo>(
  config: CatalogoCsvConfig<T, Nuevo>,
  items: T[],
): CsvAdaptador {
  return {
    titulo: `Exportar ${config.titulo}`,
    modo: "exportar",
    columnas: columnasDe(config.campos),
    politica: "parcial",
    plantilla: () => plantillaCsv(config.campos.map((c) => c.encabezado)),
    archivoDefault: config.archivoDefault,
    mensajeEjecutando: `Exportando ${config.titulo.toLowerCase()}…`,
    previsualizarExport: () => ({
      listos: items.length,
      omitidos: 0,
      problemas: [],
      avisos: [],
    }),
    ejecutar: async (_ctx, onProgreso) => {
      const path = await elegirDestinoCsv(config.archivoDefault);
      if (!path) throw new CsvCancelado();
      onProgreso({ actual: 0, total: items.length, mensaje: `Exportando ${config.titulo.toLowerCase()}…` });
      const filas = items.map((item) => {
        const row = config.aFila(item);
        return config.campos.map((c) => String(row[c.field] ?? ""));
      });
      const contenido = generarCsv(
        config.campos.map((c) => c.encabezado),
        filas,
      );
      await escribirArchivoTexto(path, contenido);
      onProgreso({ actual: items.length, total: items.length, mensaje: `Exportando ${config.titulo.toLowerCase()}…` });
      return {
        creados: items.length,
        actualizados: 0,
        omitidos: 0,
        problemas: [],
        avisos: [],
        ruta: path,
      };
    },
  };
}

interface FilaCatalogo<Nuevo> {
  clave: string;
  id: string | null;
  nuevo: Nuevo;
}

interface PreviewCatalogo<Nuevo> {
  filas: FilaCatalogo<Nuevo>[];
}

function previsualizarCatalogo<T extends { id: string }, Nuevo>(
  config: CatalogoCsvConfig<T, Nuevo>,
  contenido: string,
  items: T[],
): CsvPrevisualizacion {
  const tabla = parsearCsv(contenido);
  if (tabla.filas.length === 0) {
    return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: "El archivo no tiene filas de datos." };
  }
  const faltantes = config.campos.filter((c) => c.obligatorio && indiceColumna(tabla, c.encabezado, c.field) < 0);
  if (faltantes.length > 0) {
    return {
      listos: 0,
      omitidos: 0,
      problemas: [],
      avisos: [],
      fatal: `El CSV debe tener las columnas ${faltantes.map((c) => `"${c.encabezado}"`).join(", ")}.`,
    };
  }

  const porClave = new Map<string, T>();
  for (const item of items) {
    const k = config.claveNaturalModelo(item).trim().toLowerCase();
    if (k && !porClave.has(k)) porClave.set(k, item);
  }

  const vistas = new Map<string, number>();
  const filas: FilaCatalogo<Nuevo>[] = [];
  const problemas: CsvProblema[] = [];
  let omitidos = 0;

  for (let i = 0; i < tabla.filas.length; i++) {
    const nro = i + 2;
    const valores: Record<string, string> = {};
    const row: Row = { _id: `tmp-${i}` };
    for (const c of config.campos) {
      const idx = indiceColumna(tabla, c.encabezado, c.field);
      const v = celda(tabla.filas[i], idx);
      valores[c.field] = v;
      row[c.field] = v;
    }
    const clave = config.claveNaturalFila(valores).trim();
    if (!clave) {
      problemas.push({ mensaje: `Fila ${nro}: clave vacía.` });
      omitidos++;
      continue;
    }
    const k = clave.toLowerCase();
    const anterior = vistas.get(k);
    if (anterior !== undefined) {
      problemas.push({ mensaje: `Fila ${nro}: "${clave}" está duplicado (también en la fila ${anterior}).` });
      omitidos++;
      continue;
    }
    vistas.set(k, nro);
    const existente = porClave.get(k);
    try {
      const nuevo = config.filaANuevo(row);
      filas.push({ clave, id: existente?.id ?? null, nuevo });
    } catch (e) {
      problemas.push({ mensaje: `Fila ${nro}: ${String(e)}` });
      omitidos++;
    }
  }

  return {
    listos: filas.length,
    omitidos,
    problemas,
    avisos: [],
    payload: { filas } satisfies PreviewCatalogo<Nuevo>,
  };
}
