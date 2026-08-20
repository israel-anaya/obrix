import { type CsvAdapter } from "@/components/csv/types";
import { importBackendAdapter } from "@/components/csv/backendAdapter";
import { importarCategoriasFasarCsv } from "@/lib/tauri";
import type { CategoriaFasar, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { mapasFamilia, mapasUnidad } from "@/features/catalogos/compartido/csv/insumoCsv";
import { columnasInsumo, exportInsumo } from "@/features/catalogos/compartido/csv/csvInsumo";

export function adaptadorImportCategoriasFasar(): CsvAdapter {
  const headers = columnasInsumo("Categoría");
  return importBackendAdapter({
    title: "Importar tabulador de salario",
    columns: headers.map((name, i) => ({ name, required: i === 1 || i === 2 })),
    required: [
      { name: "Categoría", aliases: ["categoria"] },
      { name: "Unidad" },
    ],
    defaultFile: "tabulador-salario.csv",
    runningMessage: "Importando categorías…",
    keyColumn: "Clave",
    noKeyWarning: 'El archivo no tiene columna "Clave"; se generarán claves automáticas con el prefijo MO-.',
    importFn: importarCategoriasFasarCsv,
  });
}

export function adaptadorExportCategoriasFasar(
  items: CategoriaFasar[],
  unidades: UnidadMedida[],
  familias: FamiliaInsumo[],
): CsvAdapter {
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
