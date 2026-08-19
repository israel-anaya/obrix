import {
  CsvCancelado,
  type CsvAdaptador,
  type CsvPrevisualizacion,
} from "@/components/csv/tipos";
import { adaptadorImportBackend } from "@/components/csv/adaptadorBackend";
import { elegirDestinoCsv } from "@/components/csv/archivos";
import { celda, generarCsv, generarCsvConSecciones, indiceColumna, parsearCsvConSecciones, plantillaCsv } from "@/lib/csv";
import {
  importarCategoriasFasarCsv,
  importarEquiposCostoHorarioCsv,
  importarHerramientasCsv,
  listCategoriasFasar,
  listCuadrillas,
  listEquipoCostoHorarioDetalles,
  listMateriales,
  escribirArchivoTexto,
} from "@/lib/tauri";
import type {
  CategoriaFasar,
  Cuadrilla,
  EquipoCostoHorario,
  EquipoCostoHorarioDetalle,
  FamiliaInsumo,
  Herramienta,
  Material,
  UnidadMedida,
} from "@/lib/types";
import { mapasFamilia, mapasUnidad } from "@/features/catalogos/csv/insumoCsv";

function columnasInsumo(colNombre: string) {
  return ["Clave", colNombre, "Unidad", "Familia", "Subfamilia"];
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

export function adaptadorImportHerramienta(): CsvAdaptador {
  const encabezados = [...columnasInsumo("Herramienta"), "PorcentajeManoObra"];
  return adaptadorImportBackend({
    titulo: "Importar herramienta",
    columnas: encabezados.map((nombre, i) => ({ nombre, obligatorio: i === 1 || i === 2 })),
    obligatorias: [
      { nombre: "Herramienta" },
      { nombre: "Unidad" },
    ],
    archivoDefault: "herramienta.csv",
    mensajeEjecutando: "Importando herramienta…",
    colClave: "Clave",
    avisoSinClave: 'El archivo no tiene columna "Clave"; se generarán claves automáticas con el prefijo HER-.',
    importar: importarHerramientasCsv,
  });
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

export function adaptadorImportCategoriasFasar(): CsvAdaptador {
  const encabezados = columnasInsumo("Categoría");
  return adaptadorImportBackend({
    titulo: "Importar tabulador de salario",
    columnas: encabezados.map((nombre, i) => ({ nombre, obligatorio: i === 1 || i === 2 })),
    obligatorias: [
      { nombre: "Categoría", aliases: ["categoria"] },
      { nombre: "Unidad" },
    ],
    archivoDefault: "tabulador-salario.csv",
    mensajeEjecutando: "Importando categorías…",
    colClave: "Clave",
    avisoSinClave: 'El archivo no tiene columna "Clave"; se generarán claves automáticas con el prefijo MO-.',
    importar: importarCategoriasFasarCsv,
  });
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

const ENCABEZADOS_MAESTRO_EQUIPO = [
  "Clave",
  "Descripción",
  "Unidad",
  "Familia",
  "Subfamilia",
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

const ENCABEZADOS_DETALLE_EQUIPO = [
  "Clave Máquina",
  "Sección",
  "Clave Insumo",
  "Descripción Insumo",
  "Unidad",
  "Cantidad",
  "Naturaleza",
] as const;

const COLUMNAS_EQUIPO = [
  { nombre: "MAESTRO · Clave", obligatorio: true },
  { nombre: "MAESTRO · Descripción", obligatorio: true },
  { nombre: "MAESTRO · Unidad", obligatorio: true },
  { nombre: "MAESTRO · Familia", obligatorio: false },
  { nombre: "MAESTRO · Subfamilia", obligatorio: false },
  { nombre: "MAESTRO · Costo máquina", obligatorio: false },
  { nombre: "DETALLE · Clave Máquina", obligatorio: true },
  { nombre: "DETALLE · Sección", obligatorio: true },
  { nombre: "DETALLE · Clave Insumo", obligatorio: false },
  { nombre: "DETALLE · Descripción Insumo", obligatorio: true },
  { nombre: "DETALLE · Cantidad", obligatorio: true },
  { nombre: "DETALLE · Naturaleza", obligatorio: false },
];

function plantillaEquipoCostoHorario(): string {
  return generarCsvConSecciones([
    { nombre: "MAESTRO", encabezados: [...ENCABEZADOS_MAESTRO_EQUIPO], filas: [] },
    { nombre: "DETALLE", encabezados: [...ENCABEZADOS_DETALLE_EQUIPO], filas: [] },
  ]);
}

function previsualizarEquipoCostoHorarioCsv(contenido: string): CsvPrevisualizacion {
  const { maestro, detalle } = parsearCsvConSecciones(contenido);
  if (!maestro) {
    return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: 'El archivo debe tener la sección "MAESTRO".' };
  }
  if (!detalle) {
    return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: 'El archivo debe tener la sección "DETALLE".' };
  }
  const faltantesMaestro = (["Clave", "Descripción", "Unidad"] as const).filter(
    (nombre) => indiceColumna(maestro, nombre) < 0,
  );
  const faltantesDetalle = (
    [
      ["Clave Máquina", ["clave"]],
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
    return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: "El MAESTRO no tiene filas de datos." };
  }
  return { listos, omitidos, problemas, avisos: [] };
}

export function adaptadorImportEquipoCostoHorario(): CsvAdaptador {
  const base = adaptadorImportBackend({
    titulo: "Importar equipo de costo horario",
    columnas: COLUMNAS_EQUIPO,
    obligatorias: [
      { nombre: "Clave" },
      { nombre: "Descripción", aliases: ["descripcion"] },
      { nombre: "Unidad" },
    ],
    archivoDefault: "equipo-costo-horario.csv",
    mensajeEjecutando: "Importando equipos…",
    importar: importarEquiposCostoHorarioCsv,
  });
  return {
    ...base,
    plantilla: plantillaEquipoCostoHorario,
    previsualizar: previsualizarEquipoCostoHorarioCsv,
  };
}

export function adaptadorExportEquipoCostoHorario(
  items: EquipoCostoHorario[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
  const u = mapasUnidad(unidades);
  const f = mapasFamilia(familias);
  return {
    titulo: "Exportar equipo de costo horario",
    modo: "exportar",
    columnas: COLUMNAS_EQUIPO,
    politica: "parcial",
    plantilla: plantillaEquipoCostoHorario,
    archivoDefault: "equipo-costo-horario.csv",
    mensajeEjecutando: "Exportando…",
    previsualizarExport: () => ({
      listos: items.length,
      omitidos: 0,
      problemas: [],
      avisos: [],
    }),
    ejecutar: async (_ctx, onProgreso) => {
      const path = await elegirDestinoCsv("equipo-costo-horario.csv");
      if (!path) throw new CsvCancelado();
      onProgreso({ actual: 0, total: items.length, mensaje: "Exportando…" });
      const [materiales, categorias, cuadrillas, paresDetalle] = await Promise.all([
        listMateriales(),
        listCategoriasFasar(),
        listCuadrillas(),
        Promise.all(items.map(async (e) => [e.id, await listEquipoCostoHorarioDetalles(e.id)] as const)),
      ]);
      const insumoPorId = new Map<string, Material | CategoriaFasar | Cuadrilla>();
      for (const item of [...materiales, ...categorias, ...cuadrillas]) {
        insumoPorId.set(item.id, item);
      }
      const detallePorEquipo = Object.fromEntries(paresDetalle) as Record<string, EquipoCostoHorarioDetalle[]>;
      const filasMaestro = items.map((e) => [
        e.clave,
        e.descripcion,
        u.simboloPorId[e.unidad_id] ?? "",
        (e.familia_id && f.nombrePorId[e.familia_id]) || "",
        (e.sub_familia_id && f.nombrePorId[e.sub_familia_id]) || "",
        "",
        e.cf_costo_maquina,
        e.cf_valor_llantas,
        e.cf_valor_piezas_especiales,
        e.cf_valor_rescate_porcentaje,
        e.cf_vida_economica_anios,
        e.cf_horas_uso_anual,
        e.cf_tasa_interes_anual_porcentaje,
        e.cf_tasa_seguros_anual_porcentaje,
        e.cf_mantenimiento_porcentaje,
      ]);
      const filasDetalle: string[][] = [];
      for (const e of items) {
        for (const d of detallePorEquipo[e.id] ?? []) {
          const insumo = insumoPorId.get(d.detalle_insumo_id);
          filasDetalle.push([
            e.clave,
            d.tipo === "consumo" ? "CONSUMO" : "OPERACION",
            insumo?.clave ?? "",
            insumo?.descripcion ?? "",
            insumo ? (u.simboloPorId[insumo.unidad_id] ?? "") : "",
            d.cantidad,
            d.naturaleza ?? "",
          ]);
        }
      }
      await escribirArchivoTexto(
        path,
        generarCsvConSecciones([
          { nombre: "MAESTRO", encabezados: [...ENCABEZADOS_MAESTRO_EQUIPO], filas: filasMaestro },
          { nombre: "DETALLE", encabezados: [...ENCABEZADOS_DETALLE_EQUIPO], filas: filasDetalle },
        ]),
      );
      onProgreso({ actual: items.length, total: items.length, mensaje: "Exportando…" });
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
