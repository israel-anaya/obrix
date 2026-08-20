import {
  CsvCancelled,
  type CsvAdapter,
  type CsvPreview,
} from "@/components/csv/types";
import { importBackendAdapter } from "@/components/csv/backendAdapter";
import { pickCsvDestination } from "@/components/csv/files";
import { celda, generarCsvConSecciones, indiceColumna, parsearCsvConSecciones } from "@/lib/csv";
import {
  importarEquiposCostoHorarioCsv,
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
  Material,
  UnidadMedida,
} from "@/lib/types";
import { mapasFamilia, mapasUnidad } from "@/features/catalogos/compartido/csv/insumoCsv";

const EQUIPMENT_MASTER_HEADERS = [
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

const EQUIPMENT_DETAIL_HEADERS = [
  "Clave Máquina",
  "Sección",
  "Clave Insumo",
  "Descripción Insumo",
  "Unidad",
  "Cantidad",
  "Naturaleza",
] as const;

const EQUIPMENT_COLUMNS = [
  { name: "MAESTRO · Clave", required: true },
  { name: "MAESTRO · Descripción", required: true },
  { name: "MAESTRO · Unidad", required: true },
  { name: "MAESTRO · Familia", required: false },
  { name: "MAESTRO · Subfamilia", required: false },
  { name: "MAESTRO · Costo máquina", required: false },
  { name: "DETALLE · Clave Máquina", required: true },
  { name: "DETALLE · Sección", required: true },
  { name: "DETALLE · Clave Insumo", required: false },
  { name: "DETALLE · Descripción Insumo", required: true },
  { name: "DETALLE · Cantidad", required: true },
  { name: "DETALLE · Naturaleza", required: false },
];

function equipmentTemplate(): string {
  return generarCsvConSecciones([
    { nombre: "MAESTRO", encabezados: [...EQUIPMENT_MASTER_HEADERS], filas: [] },
    { nombre: "DETALLE", encabezados: [...EQUIPMENT_DETAIL_HEADERS], filas: [] },
  ]);
}

function previewEquipmentCsv(content: string): CsvPreview {
  const { maestro, detalle } = parsearCsvConSecciones(content);
  if (!maestro) {
    return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: 'El archivo debe tener la sección "MAESTRO".' };
  }
  if (!detalle) {
    return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: 'El archivo debe tener la sección "DETALLE".' };
  }
  const missingMaster = (["Clave", "Descripción", "Unidad"] as const).filter(
    (name) => indiceColumna(maestro, name) < 0,
  );
  const missingDetail = (
    [
      ["Clave Máquina", ["clave"]],
      ["Sección", ["seccion"]],
      ["Descripción Insumo", ["descripcion insumo", "descripcion"]],
      ["Cantidad", []],
    ] as const
  ).filter(([name, aliases]) => indiceColumna(detalle, name, ...aliases) < 0);
  if (missingMaster.length > 0 || missingDetail.length > 0) {
    const names = [
      ...missingMaster.map((n) => `"${n}" (MAESTRO)`),
      ...missingDetail.map(([n]) => `"${n}" (DETALLE)`),
    ];
    return {
      ready: 0,
      skipped: 0,
      issues: [],
      warnings: [],
      fatal: `El CSV debe tener las columnas ${names.join(", ")}.`,
    };
  }
  const keyCol = indiceColumna(maestro, "Clave");
  const issues: { message: string }[] = [];
  let ready = 0;
  let skipped = 0;
  for (const row of maestro.filas) {
    if (!celda(row, keyCol)) {
      skipped += 1;
      issues.push({ message: "Fila de MAESTRO sin clave; se omitirá." });
    } else {
      ready += 1;
    }
  }
  if (ready === 0 && skipped === 0) {
    return { ready: 0, skipped: 0, issues: [], warnings: [], fatal: "El MAESTRO no tiene filas de datos." };
  }
  return { ready, skipped, issues, warnings: [] };
}

export function adaptadorImportEquipoCostoHorario(): CsvAdapter {
  const base = importBackendAdapter({
    title: "Importar equipo de costo horario",
    columns: EQUIPMENT_COLUMNS,
    required: [
      { name: "Clave" },
      { name: "Descripción", aliases: ["descripcion"] },
      { name: "Unidad" },
    ],
    defaultFile: "equipo-costo-horario.csv",
    runningMessage: "Importando equipos…",
    importFn: importarEquiposCostoHorarioCsv,
  });
  return {
    ...base,
    template: equipmentTemplate,
    preview: previewEquipmentCsv,
  };
}

export function adaptadorExportEquipoCostoHorario(
  items: EquipoCostoHorario[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdapter {
  const u = mapasUnidad(unidades);
  const f = mapasFamilia(familias);
  return {
    title: "Exportar equipo de costo horario",
    mode: "export",
    columns: EQUIPMENT_COLUMNS,
    policy: "partial",
    template: equipmentTemplate,
    defaultFile: "equipo-costo-horario.csv",
    runningMessage: "Exportando…",
    previewExport: () => ({
      ready: items.length,
      skipped: 0,
      issues: [],
      warnings: [],
    }),
    run: async (_ctx, onProgress) => {
      const path = await pickCsvDestination("equipo-costo-horario.csv");
      if (!path) throw new CsvCancelled();
      onProgress({ current: 0, total: items.length, message: "Exportando…" });
      const [materiales, categorias, cuadrillas, detailPairs] = await Promise.all([
        listMateriales(),
        listCategoriasFasar(),
        listCuadrillas(),
        Promise.all(items.map(async (e) => [e.id, await listEquipoCostoHorarioDetalles(e.id)] as const)),
      ]);
      const itemById = new Map<string, Material | CategoriaFasar | Cuadrilla>();
      for (const item of [...materiales, ...categorias, ...cuadrillas]) {
        itemById.set(item.id, item);
      }
      const detailByEquipment = Object.fromEntries(detailPairs) as Record<string, EquipoCostoHorarioDetalle[]>;
      const masterRows = items.map((e) => [
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
      const detailRows: string[][] = [];
      for (const e of items) {
        for (const d of detailByEquipment[e.id] ?? []) {
          const item = itemById.get(d.detalle_insumo_id);
          detailRows.push([
            e.clave,
            d.tipo === "consumo" ? "CONSUMO" : "OPERACION",
            item?.clave ?? "",
            item?.descripcion ?? "",
            item ? (u.simboloPorId[item.unidad_id] ?? "") : "",
            d.cantidad,
            d.naturaleza ?? "",
          ]);
        }
      }
      await escribirArchivoTexto(
        path,
        generarCsvConSecciones([
          { nombre: "MAESTRO", encabezados: [...EQUIPMENT_MASTER_HEADERS], filas: masterRows },
          { nombre: "DETALLE", encabezados: [...EQUIPMENT_DETAIL_HEADERS], filas: detailRows },
        ]),
      );
      onProgress({ current: items.length, total: items.length, message: "Exportando…" });
      return {
        created: items.length,
        updated: 0,
        skipped: 0,
        issues: [],
        warnings: [],
        path,
      };
    },
  };
}
