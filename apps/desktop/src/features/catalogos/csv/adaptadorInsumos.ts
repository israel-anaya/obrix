import {
  CsvCancelado,
  type CsvAdaptador,
  type CsvPrevisualizacion,
  type CsvProblema,
} from "@/components/csv/tipos";
import { elegirDestinoCsv } from "@/components/csv/archivos";
import { celda, claveTexto, generarCsv, indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";
import {
  createCategoriaFasar,
  createEquipoCostoHorario,
  createHerramienta,
  updateCategoriaFasar,
  updateEquipoCostoHorario,
  updateHerramienta,
  escribirArchivoTexto,
} from "@/lib/tauri";
import type {
  CategoriaFasar,
  CategoriaFasarData,
  EquipoCostoHorario,
  EquipoCostoHorarioData,
  FamiliaInsumo,
  Herramienta,
  HerramientaData,
  Region,
  UnidadMedida,
} from "@/lib/types";
import { mapasFamilia, mapasUnidad, resolverFamilia, resolverUnidad } from "@/features/catalogos/csv/insumoCsv";

function columnasInsumo(colNombre: string) {
  return ["Clave", colNombre, "Unidad", "Familia", "Subfamilia"];
}

function previewInsumo(
  contenido: string,
  colNombre: string,
  extrasObligatorios: string[] = [],
): CsvPrevisualizacion & { tabla?: ReturnType<typeof parsearCsv> } {
  const tabla = parsearCsv(contenido);
  if (tabla.filas.length === 0) {
    return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: "El archivo no tiene filas de datos." };
  }
  const faltantes = [colNombre, "Unidad", ...extrasObligatorios].filter(
    (c) => indiceColumna(tabla, c) < 0,
  );
  if (faltantes.length > 0) {
    return {
      listos: 0,
      omitidos: 0,
      problemas: [],
      avisos: [],
      fatal: `El CSV debe tener las columnas ${faltantes.map((c) => `"${c}"`).join(", ")}.`,
    };
  }
  return { listos: tabla.filas.length, omitidos: 0, problemas: [], avisos: [], tabla };
}

interface FilaInsumoBase {
  nro: number;
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  sub_familia_id: string | null;
  existenteId: string | null;
}

function parsearFilasBase(
  tabla: ReturnType<typeof parsearCsv>,
  items: { id: string; clave: string; descripcion: string }[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
  colNombre: string,
): { filas: FilaInsumoBase[]; problemas: CsvProblema[] } {
  const { idPorSimbolo } = mapasUnidad(unidades);
  const fam = mapasFamilia(familias);
  const porClave = new Map(items.filter((i) => i.clave).map((i) => [claveTexto(i.clave), i.id]));
  const porDesc = new Map(items.map((i) => [claveTexto(i.descripcion), i.id]));
  const idxClave = indiceColumna(tabla, "Clave");
  const idxNombre = indiceColumna(tabla, colNombre);
  const idxUnidad = indiceColumna(tabla, "Unidad");
  const idxFam = indiceColumna(tabla, "Familia");
  const idxSub = indiceColumna(tabla, "Subfamilia");
  const filas: FilaInsumoBase[] = [];
  const problemas: CsvProblema[] = [];
  const vistas = new Set<string>();

  for (let i = 0; i < tabla.filas.length; i++) {
    const nro = i + 2;
    const descripcion = celda(tabla.filas[i], idxNombre);
    if (!descripcion) {
      problemas.push({ mensaje: `Fila ${nro}: ${colNombre.toLowerCase()} vacía.` });
      continue;
    }
    const clave = celda(tabla.filas[i], idxClave);
    const k = claveTexto(clave || descripcion);
    if (vistas.has(k)) {
      problemas.push({ mensaje: `Fila ${nro}: "${clave || descripcion}" duplicado.` });
      continue;
    }
    vistas.add(k);
    const unidad = resolverUnidad(celda(tabla.filas[i], idxUnidad), idPorSimbolo);
    if ("error" in unidad) {
      problemas.push({ mensaje: `Fila ${nro}: ${unidad.error}.` });
      continue;
    }
    const famRes = resolverFamilia(celda(tabla.filas[i], idxFam), celda(tabla.filas[i], idxSub), fam);
    for (const a of famRes.avisos) problemas.push({ mensaje: `Fila ${nro}: ${a}.`, grupo: "Avisos" });
    const existenteId = (clave && porClave.get(claveTexto(clave))) || porDesc.get(claveTexto(descripcion)) || null;
    filas.push({
      nro,
      clave: clave || descripcion.slice(0, 20),
      descripcion,
      unidad_id: unidad.id,
      familia_id: famRes.familia_id,
      sub_familia_id: famRes.sub_familia_id,
      existenteId,
    });
  }
  return { filas, problemas };
}

function exportInsumo(
  titulo: string,
  archivo: string,
  encabezados: string[],
  filas: string[][],
): CsvAdaptador {
  return {
    titulo,
    modo: "exportar",
    columnas: encabezados.map((nombre) => ({ nombre, obligatorio: false })),
    politica: "parcial",
    plantilla: () => plantillaCsv(encabezados),
    archivoDefault: archivo,
    mensajeEjecutando: "Exportando…",
    previsualizarExport: () => ({ listos: filas.length, omitidos: 0, problemas: [], avisos: [] }),
    ejecutar: async (_ctx, onProgreso) => {
      const path = await elegirDestinoCsv(archivo);
      if (!path) throw new CsvCancelado();
      onProgreso({ actual: 0, total: filas.length, mensaje: "Exportando…" });
      await escribirArchivoTexto(path, generarCsv(encabezados, filas));
      return { creados: filas.length, actualizados: 0, omitidos: 0, problemas: [], avisos: [], ruta: path };
    },
  };
}

export function adaptadorImportHerramienta(
  items: Herramienta[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
  const encabezados = [...columnasInsumo("Herramienta"), "PorcentajeManoObra"];
  return {
    titulo: "Importar herramienta",
    modo: "importar",
    columnas: encabezados.map((nombre, i) => ({ nombre, obligatorio: i === 1 || i === 2 })),
    politica: "parcial",
    plantilla: () => plantillaCsv([...encabezados]),
    archivoDefault: "herramienta.csv",
    mensajeEjecutando: "Importando herramienta…",
    previsualizar: (contenido) => {
      const r = previewInsumo(contenido, "Herramienta");
      if (r.fatal || !r.tabla) return r;
      const { filas, problemas } = parsearFilasBase(r.tabla, items, unidades, familias, "Herramienta");
      return { listos: filas.length, omitidos: problemas.length, problemas, avisos: [], payload: { tabla: r.tabla, filas } };
    },
    ejecutar: async (ctx, onProgreso) => {
      const { tabla, filas } = ctx.preview.payload as {
        tabla: ReturnType<typeof parsearCsv>;
        filas: FilaInsumoBase[];
      };
      const idxPct = indiceColumna(tabla, "PorcentajeManoObra");
      let creados = 0;
      let actualizados = 0;
      const problemas = [...ctx.preview.problemas];
      for (let i = 0; i < filas.length; i++) {
        onProgreso({ actual: i + 1, total: filas.length, mensaje: "Importando herramienta…" });
        const f = filas[i];
        const pctTexto = celda(tabla.filas[f.nro - 2], idxPct);
        const pct = pctTexto ? Math.min(100, Math.max(0, Math.round(Number(pctTexto.replace(/[^\d.-]/g, "")) || 0))) : null;
        const data: HerramientaData = {
          clave: f.clave,
          descripcion: f.descripcion,
          unidad_id: f.unidad_id,
          familia_id: f.familia_id,
          sub_familia_id: f.sub_familia_id,
          porcentaje_mano_obra: pct,
        };
        try {
          if (f.existenteId) {
            await updateHerramienta(f.existenteId, data);
            actualizados++;
          } else {
            await createHerramienta(data);
            creados++;
          }
        } catch (e) {
          problemas.push({ mensaje: `Fila ${f.nro}: ${String(e)}` });
        }
      }
      return { creados, actualizados, omitidos: 0, problemas, avisos: [] };
    },
  };
}

export function adaptadorExportHerramienta(
  items: Herramienta[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
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

export function adaptadorImportCategoriasFasar(
  items: CategoriaFasar[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
  const encabezados = columnasInsumo("Categoría");
  return {
    titulo: "Importar tabulador de salario",
    modo: "importar",
    columnas: encabezados.map((nombre, i) => ({ nombre, obligatorio: i === 1 || i === 2 })),
    politica: "parcial",
    plantilla: () => plantillaCsv(encabezados),
    archivoDefault: "tabulador-salario.csv",
    mensajeEjecutando: "Importando categorías…",
    previsualizar: (contenido) => {
      const r = previewInsumo(contenido, "Categoría");
      if (r.fatal || !r.tabla) return r;
      const { filas, problemas } = parsearFilasBase(r.tabla, items, unidades, familias, "Categoría");
      return { listos: filas.length, omitidos: problemas.length, problemas, avisos: [], payload: { filas } };
    },
    ejecutar: async (ctx, onProgreso) => {
      const { filas } = ctx.preview.payload as { filas: FilaInsumoBase[] };
      let creados = 0;
      let actualizados = 0;
      const problemas = [...ctx.preview.problemas];
      for (let i = 0; i < filas.length; i++) {
        onProgreso({ actual: i + 1, total: filas.length, mensaje: "Importando categorías…" });
        const f = filas[i];
        const data: CategoriaFasarData = {
          clave: f.clave,
          descripcion: f.descripcion,
          unidad_id: f.unidad_id,
          familia_id: f.familia_id,
          sub_familia_id: f.sub_familia_id,
        };
        try {
          if (f.existenteId) {
            await updateCategoriaFasar(f.existenteId, data);
            actualizados++;
          } else {
            await createCategoriaFasar(data);
            creados++;
          }
        } catch (e) {
          problemas.push({ mensaje: `Fila ${f.nro}: ${String(e)}` });
        }
      }
      return { creados, actualizados, omitidos: 0, problemas, avisos: [] };
    },
  };
}

export function adaptadorExportCategoriasFasar(
  items: CategoriaFasar[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
  const u = mapasUnidad(unidades);
  const f = mapasFamilia(familias);
  return exportInsumo(
    "Exportar tabulador de salario",
    "tabulador-salario.csv",
    columnasInsumo("Categoría"),
    items.map((c) => [
      c.clave,
      c.descripcion,
      u.simboloPorId[c.unidad_id] ?? "",
      (c.familia_id && f.nombrePorId[c.familia_id]) || "",
      (c.sub_familia_id && f.nombrePorId[c.sub_familia_id]) || "",
    ]),
  );
}

const COLS_EQUIPO = [
  ...columnasInsumo("Descripción"),
  "Región",
  "Costo máquina",
  "Valor llantas",
  "Valor piezas especiales",
  "Rescate %",
  "Vida económica (años)",
  "Horas de uso anual",
  "Interés anual %",
  "Seguros anual %",
  "Mantenimiento %",
] as const;

function decimalOCero(texto: string): string {
  const n = texto.replace(/[^\d.-]/g, "");
  if (!n || n === "-" || n === ".") return "0";
  return n;
}

export function adaptadorImportEquipoCostoHorario(
  items: EquipoCostoHorario[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
  regiones: Region[],
): CsvAdaptador {
  const regionIdPorNombre = Object.fromEntries(regiones.map((r) => [r.nombre.toLowerCase(), r.id]));
  return {
    titulo: "Importar equipo de costo horario",
    modo: "importar",
    columnas: COLS_EQUIPO.map((nombre, i) => ({ nombre, obligatorio: i === 1 || i === 2 })),
    politica: "parcial",
    plantilla: () => plantillaCsv([...COLS_EQUIPO]),
    archivoDefault: "equipo-costo-horario.csv",
    mensajeEjecutando: "Importando equipos…",
    previsualizar: (contenido) => {
      const r = previewInsumo(contenido, "Descripción");
      if (r.fatal || !r.tabla) return r;
      const { filas, problemas } = parsearFilasBase(r.tabla, items, unidades, familias, "Descripción");
      return { listos: filas.length, omitidos: problemas.length, problemas, avisos: [], payload: { tabla: r.tabla, filas } };
    },
    ejecutar: async (ctx, onProgreso) => {
      const { tabla, filas } = ctx.preview.payload as {
        tabla: ReturnType<typeof parsearCsv>;
        filas: FilaInsumoBase[];
      };
      const idx = (nombre: string) => indiceColumna(tabla, nombre);
      let creados = 0;
      let actualizados = 0;
      const problemas = [...ctx.preview.problemas];
      for (let i = 0; i < filas.length; i++) {
        onProgreso({ actual: i + 1, total: filas.length, mensaje: "Importando equipos…" });
        const f = filas[i];
        const row = tabla.filas[f.nro - 2];
        const regionTxt = celda(row, idx("Región"));
        const region_id = regionTxt ? (regionIdPorNombre[regionTxt.toLowerCase()] ?? null) : null;
        const horasUso = decimalOCero(celda(row, idx("Horas de uso anual")));
        const data: EquipoCostoHorarioData = {
          clave: f.clave,
          descripcion: f.descripcion,
          unidad_id: f.unidad_id,
          familia_id: f.familia_id,
          sub_familia_id: f.sub_familia_id,
          region_id,
          cf_costo_maquina: decimalOCero(celda(row, idx("Costo máquina"))),
          cf_valor_llantas: decimalOCero(celda(row, idx("Valor llantas"))),
          cf_valor_piezas_especiales: decimalOCero(celda(row, idx("Valor piezas especiales"))),
          cf_valor_rescate_porcentaje: decimalOCero(celda(row, idx("Rescate %"))),
          cf_vida_economica_anios: decimalOCero(celda(row, idx("Vida económica (años)"))),
          cf_horas_uso_anual: Number(horasUso) > 0 ? horasUso : "1",
          cf_tasa_interes_anual_porcentaje: decimalOCero(celda(row, idx("Interés anual %"))),
          cf_tasa_seguros_anual_porcentaje: decimalOCero(celda(row, idx("Seguros anual %"))),
          cf_mantenimiento_porcentaje: decimalOCero(celda(row, idx("Mantenimiento %"))),
        };
        try {
          if (f.existenteId) {
            await updateEquipoCostoHorario(f.existenteId, data);
            actualizados++;
          } else {
            await createEquipoCostoHorario(data);
            creados++;
          }
        } catch (e) {
          problemas.push({ mensaje: `Fila ${f.nro}: ${String(e)}` });
        }
      }
      return { creados, actualizados, omitidos: 0, problemas, avisos: [] };
    },
  };
}

export function adaptadorExportEquipoCostoHorario(
  items: EquipoCostoHorario[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
  regiones: Region[],
): CsvAdaptador {
  const u = mapasUnidad(unidades);
  const f = mapasFamilia(familias);
  const nombreRegion = Object.fromEntries(regiones.map((r) => [r.id, r.nombre]));
  return exportInsumo(
    "Exportar equipo de costo horario",
    "equipo-costo-horario.csv",
    [...COLS_EQUIPO],
    items.map((e) => [
      e.clave,
      e.descripcion,
      u.simboloPorId[e.unidad_id] ?? "",
      (e.familia_id && f.nombrePorId[e.familia_id]) || "",
      (e.sub_familia_id && f.nombrePorId[e.sub_familia_id]) || "",
      (e.region_id && nombreRegion[e.region_id]) || "",
      e.cf_costo_maquina,
      e.cf_valor_llantas,
      e.cf_valor_piezas_especiales,
      e.cf_valor_rescate_porcentaje,
      e.cf_vida_economica_anios,
      e.cf_horas_uso_anual,
      e.cf_tasa_interes_anual_porcentaje,
      e.cf_tasa_seguros_anual_porcentaje,
      e.cf_mantenimiento_porcentaje,
    ]),
  );
}
