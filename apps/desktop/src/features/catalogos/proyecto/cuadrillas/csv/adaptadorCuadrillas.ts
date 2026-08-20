import { importBackendAdapter } from "@/components/csv/backendAdapter";
import { CsvCancelled } from "@/components/csv/types";
import type { CsvAdapter, CsvPreview } from "@/components/csv/types";
import { pickCsvDestination } from "@/components/csv/files";
import { celda, generarCsvConSecciones, indiceColumna, parsearCsvConSecciones } from "@/lib/csv";
import {
  importarCuadrillasCsv,
  listCategoriasFasar,
  listCuadrillaDetalles,
  listHerramientas,
  escribirArchivoTexto,
} from "@/lib/tauri";
import type { CategoriaFasar, Cuadrilla, FamiliaInsumo, Herramienta, UnidadMedida } from "@/lib/types";

const MASTER_HEADERS = ["Clave", "Descripción", "Unidad", "Familia", "Subfamilia"] as const;
const DETAIL_HEADERS = [
  "Clave Cuadrilla",
  "Sección",
  "Clave Insumo",
  "Descripción Insumo",
  "Unidad",
  "Cantidad",
] as const;

const CREW_COLUMNS = [
  { name: "MAESTRO · Clave", required: true },
  { name: "MAESTRO · Descripción", required: true },
  { name: "MAESTRO · Unidad", required: false },
  { name: "MAESTRO · Familia", required: false },
  { name: "MAESTRO · Subfamilia", required: false },
  { name: "DETALLE · Clave Cuadrilla", required: true },
  { name: "DETALLE · Sección", required: true },
  { name: "DETALLE · Clave Insumo", required: false },
  { name: "DETALLE · Descripción Insumo", required: true },
  { name: "DETALLE · Unidad", required: false },
  { name: "DETALLE · Cantidad", required: true },
];

function crewTemplate(): string {
  return generarCsvConSecciones([
    { nombre: "MAESTRO", encabezados: [...MASTER_HEADERS], filas: [] },
    { nombre: "DETALLE", encabezados: [...DETAIL_HEADERS], filas: [] },
  ]);
}

function previewCrewCsv(content: string): CsvPreview {
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
  const missingMaster = (["Clave", "Descripción"] as const).filter(
    (name) => indiceColumna(maestro, name) < 0,
  );
  const missingDetail = (
    [
      ["Clave Cuadrilla", ["clave"]],
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

export function adaptadorImportCuadrillas(): CsvAdapter {
  const base = importBackendAdapter({
    title: "Importar cuadrillas",
    columns: CREW_COLUMNS,
    required: [{ name: "Clave" }, { name: "Descripción" }],
    defaultFile: "cuadrillas.csv",
    runningMessage: "Importando cuadrillas…",
    importFn: importarCuadrillasCsv,
  });
  return {
    ...base,
    template: crewTemplate,
    preview: previewCrewCsv,
  };
}

export function adaptadorExportCuadrillas(
  cuadrillas: Cuadrilla[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdapter {
  const simboloPorId = Object.fromEntries(unidades.map((u) => [u.id, u.simbolo]));
  const nombrePorId = Object.fromEntries(familias.map((f) => [f.id, f.nombre]));
  return {
    title: "Exportar cuadrillas",
    mode: "export",
    columns: CREW_COLUMNS,
    policy: "partial",
    template: crewTemplate,
    defaultFile: "cuadrillas.csv",
    runningMessage: "Exportando…",
    previewExport: () => ({
      ready: cuadrillas.length,
      skipped: 0,
      issues: [],
      warnings: [],
    }),
    run: async (_ctx, onProgress) => {
      const path = await pickCsvDestination("cuadrillas.csv");
      if (!path) throw new CsvCancelled();
      onProgress({ current: 0, total: cuadrillas.length, message: "Exportando…" });
      const [categorias, herramientas, detailPairs] = await Promise.all([
        listCategoriasFasar(),
        listHerramientas(),
        Promise.all(
          cuadrillas.map(async (c) => [c.id, await listCuadrillaDetalles(c.id)] as const),
        ),
      ]);
      const itemById = new Map<string, CategoriaFasar | Herramienta>();
      for (const item of [...categorias, ...herramientas]) {
        itemById.set(item.id, item);
      }
      const detailByCrew = Object.fromEntries(detailPairs);
      const masterRows = cuadrillas.map((c) => [
        c.clave,
        c.descripcion,
        simboloPorId[c.unidad_id] ?? "",
        (c.familia_id && nombrePorId[c.familia_id]) || "",
        (c.sub_familia_id && nombrePorId[c.sub_familia_id]) || "",
      ]);
      const detailRows: string[][] = [];
      for (const c of cuadrillas) {
        for (const d of detailByCrew[c.id] ?? []) {
          const item = itemById.get(d.detalle_insumo_id);
          detailRows.push([
            c.clave,
            d.tipo === "categoria_fasar" ? "MANO DE OBRA" : "EQUIPO Y HERRAMIENTA",
            item?.clave ?? "",
            item?.descripcion ?? "",
            item ? (simboloPorId[item.unidad_id] ?? "") : "",
            d.cantidad,
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
      onProgress({ current: cuadrillas.length, total: cuadrillas.length, message: "Exportando…" });
      return {
        created: cuadrillas.length,
        updated: 0,
        skipped: 0,
        issues: [],
        warnings: [],
        path,
      };
    },
  };
}
