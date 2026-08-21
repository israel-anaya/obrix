import { importBackendAdapter } from "@/components/csv/backendAdapter";
import { CsvCancelled } from "@/components/csv/types";
import type { CsvAdapter, CsvPreview } from "@/components/csv/types";
import { pickCsvDestination } from "@/components/csv/files";
import { celda, generarCsvConSecciones, indiceColumna, parsearCsvConSecciones } from "@/lib/csv";
import {
  importarBasicosAuxiliaresCsv,
  listBasicoAuxiliarComponentes,
  listBasicoAuxiliarCostoDetalles,
  listBasicoAuxiliarCostos,
  listCategoriasFasar,
  listCuadrillas,
  listEquiposCostoHorario,
  listMateriales,
  escribirArchivoTexto,
} from "@/lib/tauri";
import type {
  BasicoAuxiliar,
  CategoriaFasar,
  Cuadrilla,
  EquipoCostoHorario,
  FamiliaInsumo,
  Material,
  TipoBasicoAuxiliarComponente,
  UnidadMedida,
} from "@/lib/types";

const MASTER_HEADERS = ["Clave", "Descripción", "Unidad", "Familia", "Subfamilia"] as const;
const DETAIL_HEADERS = [
  "Clave Básico Auxiliar",
  "Sección",
  "Clave Insumo",
  "Descripción Insumo",
  "Unidad",
  "Cantidad",
] as const;

const AUXILIAR_COLUMNS = [
  { name: "MAESTRO · Clave", required: true },
  { name: "MAESTRO · Descripción", required: true },
  { name: "MAESTRO · Unidad", required: true },
  { name: "MAESTRO · Familia", required: false },
  { name: "MAESTRO · Subfamilia", required: false },
  { name: "DETALLE · Clave Básico Auxiliar", required: true },
  { name: "DETALLE · Sección", required: true },
  { name: "DETALLE · Clave Insumo", required: false },
  { name: "DETALLE · Descripción Insumo", required: true },
  { name: "DETALLE · Unidad", required: false },
  { name: "DETALLE · Cantidad", required: true },
];

const SECCION_POR_TIPO: Record<TipoBasicoAuxiliarComponente, string> = {
  material: "MATERIAL",
  mano_obra: "MANO DE OBRA",
  equipo_herramienta: "EQUIPO Y HERRAMIENTA",
  basico_auxiliar: "BASICO AUXILIAR",
};

function auxiliarTemplate(): string {
  return generarCsvConSecciones([
    { nombre: "MAESTRO", encabezados: [...MASTER_HEADERS], filas: [] },
    { nombre: "DETALLE", encabezados: [...DETAIL_HEADERS], filas: [] },
  ]);
}

/**
 * Válida la forma del CSV (secciones y columnas) antes de mandarlo al
 * backend — la resolución de dependencias (incluida la recursiva de
 * BASICO AUXILIAR) y la detección de ciclos ocurre allá, contra el estado
 * real de la base, igual que en `adaptadorCuadrillas`.
 */
function previewAuxiliarCsv(content: string): CsvPreview {
  const { maestro, detalle } = parsearCsvConSecciones(content);
  if (!maestro) {
    return {
      ready: 0,
      skipped: 0,
      issues: [],
      warnings: [],
      fatal: 'El archivo debe tener la sección "MAESTRO".',
    };
  }
  if (!detalle) {
    return {
      ready: 0,
      skipped: 0,
      issues: [],
      warnings: [],
      fatal: 'El archivo debe tener la sección "DETALLE".',
    };
  }
  const missingMaster = (["Clave", "Descripción", "Unidad"] as const).filter(
    (name) => indiceColumna(maestro, name) < 0,
  );
  const missingDetail = (
    [
      ["Clave Básico Auxiliar", ["clave basico auxiliar", "clave"]],
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
    return {
      ready: 0,
      skipped: 0,
      issues: [],
      warnings: [],
      fatal: "El MAESTRO no tiene filas de datos.",
    };
  }
  return { ready, skipped, issues, warnings: [] };
}

export function adaptadorImportBasicosAuxiliares(): CsvAdapter {
  const base = importBackendAdapter({
    title: "Importar básicos auxiliares",
    columns: AUXILIAR_COLUMNS,
    required: [{ name: "Clave" }, { name: "Descripción" }],
    defaultFile: "basicos_auxiliares.csv",
    runningMessage: "Importando básicos auxiliares…",
    importFn: importarBasicosAuxiliaresCsv,
  });
  return {
    ...base,
    template: auxiliarTemplate,
    preview: previewAuxiliarCsv,
  };
}

export function adaptadorExportBasicosAuxiliares(
  auxiliares: BasicoAuxiliar[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdapter {
  const simboloPorId = Object.fromEntries(unidades.map((u) => [u.id, u.simbolo]));
  const nombrePorId = Object.fromEntries(familias.map((f) => [f.id, f.nombre]));
  return {
    title: "Exportar básicos auxiliares",
    mode: "export",
    columns: AUXILIAR_COLUMNS,
    policy: "partial",
    template: auxiliarTemplate,
    defaultFile: "basicos_auxiliares.csv",
    runningMessage: "Exportando…",
    previewExport: () => ({
      ready: auxiliares.length,
      skipped: 0,
      issues: [],
      warnings: [],
    }),
    run: async (_ctx, onProgress) => {
      const path = await pickCsvDestination("basicos_auxiliares.csv");
      if (!path) throw new CsvCancelled();
      onProgress({ current: 0, total: auxiliares.length, message: "Exportando…" });
      const [materiales, categorias, cuadrillas, equipos] = await Promise.all([
        listMateriales(),
        listCategoriasFasar(),
        listCuadrillas(),
        listEquiposCostoHorario(),
      ]);
      const itemById = new Map<string, Material | CategoriaFasar | Cuadrilla | EquipoCostoHorario | BasicoAuxiliar>();
      for (const item of [...materiales, ...categorias, ...cuadrillas, ...equipos, ...auxiliares]) {
        itemById.set(item.id, item);
      }
      const detallePorAuxiliar = await Promise.all(
        auxiliares.map(async (a) => {
          const [componentes, costos] = await Promise.all([
            listBasicoAuxiliarComponentes(a.id),
            listBasicoAuxiliarCostos(a.id),
          ]);
          const costoNacional = costos.find((c) => c.region_id === null) ?? null;
          const costoDetalles = costoNacional ? await listBasicoAuxiliarCostoDetalles(costoNacional.id) : [];
          const cantidadPorComponenteId = Object.fromEntries(
            costoDetalles.map((cd) => [cd.basico_auxiliar_componente_id, cd.cantidad]),
          );
          return [a.id, componentes.map((c) => ({ ...c, cantidad: cantidadPorComponenteId[c.id] ?? "0" }))] as const;
        }),
      );
      const detalleByAuxiliar = Object.fromEntries(detallePorAuxiliar);
      const masterRows = auxiliares.map((a) => [
        a.clave,
        a.descripcion,
        simboloPorId[a.unidad_id] ?? "",
        (a.familia_id && nombrePorId[a.familia_id]) || "",
        (a.sub_familia_id && nombrePorId[a.sub_familia_id]) || "",
      ]);
      const detailRows: string[][] = [];
      for (const a of auxiliares) {
        for (const c of detalleByAuxiliar[a.id] ?? []) {
          const item = itemById.get(c.componente_insumo_id);
          detailRows.push([
            a.clave,
            SECCION_POR_TIPO[c.tipo],
            item?.clave ?? "",
            item?.descripcion ?? "",
            item ? (simboloPorId[item.unidad_id] ?? "") : "",
            c.cantidad,
          ]);
        }
      }
      await escribirArchivoTexto(
        path,
        generarCsvConSecciones([
          { nombre: "MAESTRO", encabezados: [...MASTER_HEADERS], filas: masterRows },
          { nombre: "DETALLE", encabezados: [...DETAIL_HEADERS], filas: detailRows },
        ]),
      );
      onProgress({ current: auxiliares.length, total: auxiliares.length, message: "Exportando…" });
      return {
        created: auxiliares.length,
        updated: 0,
        skipped: 0,
        issues: [],
        warnings: [],
        path,
      };
    },
  };
}
