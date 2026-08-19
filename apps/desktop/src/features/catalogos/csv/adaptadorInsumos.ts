import {
  CsvCancelado,
  type CsvAdaptador,
} from "@/components/csv/tipos";
import { adaptadorImportBackend } from "@/components/csv/adaptadorBackend";
import { elegirDestinoCsv } from "@/components/csv/archivos";
import { generarCsv, plantillaCsv } from "@/lib/csv";
import {
  importarCategoriasFasarCsv,
  importarEquiposCostoHorarioCsv,
  importarHerramientasCsv,
  escribirArchivoTexto,
} from "@/lib/tauri";
import type {
  CategoriaFasar,
  EquipoCostoHorario,
  FamiliaInsumo,
  Herramienta,
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

const COLS_EQUIPO = [
  ...columnasInsumo("Descripción"),
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

export function adaptadorImportEquipoCostoHorario(): CsvAdaptador {
  return adaptadorImportBackend({
    titulo: "Importar equipo de costo horario",
    columnas: COLS_EQUIPO.map((nombre, i) => ({ nombre, obligatorio: i === 1 || i === 2 })),
    obligatorias: [
      { nombre: "Descripción", aliases: ["descripcion"] },
      { nombre: "Unidad" },
    ],
    archivoDefault: "equipo-costo-horario.csv",
    mensajeEjecutando: "Importando equipos…",
    colClave: "Clave",
    avisoSinClave: 'El archivo no tiene columna "Clave"; se generarán claves automáticas con el prefijo EQ-.',
    importar: importarEquiposCostoHorarioCsv,
  });
}

export function adaptadorExportEquipoCostoHorario(
  items: EquipoCostoHorario[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdaptador {
  const u = mapasUnidad(unidades);
  const f = mapasFamilia(familias);
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
