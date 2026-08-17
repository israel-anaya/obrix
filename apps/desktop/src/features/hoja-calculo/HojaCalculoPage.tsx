import { useEffect, useRef, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { Upload } from "lucide-react";
import { LocaleType, Univer, mergeLocales } from "@univerjs/core";
import { FUniver } from "@univerjs/core/lib/facade";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEsES from "@univerjs/preset-sheets-core/locales/es-ES";
import { Button } from "@/components/ui/button";

import "@univerjs/design/lib/index.css";
import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";
import "@univerjs/sheets-ui/lib/index.css";
import "@univerjs/sheets-formula-ui/lib/index.css";
import "@univerjs/sheets-numfmt-ui/lib/index.css";

type ImportedCellValue = string | number | boolean;

// The "Funciones" toolbar group (sheets-formula-ui) registers one menu item
// per function category; hiding just the parent doesn't hide the rest, so
// every id has to be listed explicitly.
const INSERT_FUNCTION_MENU_IDS = [
  "common",
  "financial",
  "logical",
  "text",
  "date",
  "lookup",
  "math",
  "statistical",
  "engineering",
  "information",
  "database",
].map((category) => `formula-ui.operation.insert-function.${category}`);

const HIDDEN_TOOLBAR_MENU_CONFIG = Object.fromEntries(
  INSERT_FUNCTION_MENU_IDS.map((id) => [id, { hidden: true }]),
);

export function HojaCalculoPage({ theme }: { theme: "light" | "dark" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const univerApiRef = useRef<FUniver | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const initialThemeRef = useRef(theme);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    let univer: Univer | undefined;

    // Univer measures the container synchronously on creation. Right after a
    // tab switch the flex layout hasn't been painted yet, so the container
    // can still report 0 width/height at this point, which breaks Univer's
    // internal layout permanently. Deferring to the next frame guarantees a
    // real, laid-out size to measure.
    const raf = requestAnimationFrame(() => {
      if (disposed || !containerRef.current) return;

      univer = new Univer({
        locale: LocaleType.ES_ES,
        locales: {
          [LocaleType.ES_ES]: mergeLocales(sheetsCoreEsES),
        },
        darkMode: initialThemeRef.current === "dark",
      });

      const preset = UniverSheetsCorePreset({
        container: containerRef.current,
        ribbonType: "simple",
        menu: HIDDEN_TOOLBAR_MENU_CONFIG,
      });
      for (const plugin of preset.plugins) {
        if (Array.isArray(plugin)) {
          univer.registerPlugin(plugin[0], plugin[1]);
        } else {
          univer.registerPlugin(plugin);
        }
      }

      const univerAPI = FUniver.newAPI(univer);
      univerApiRef.current = univerAPI;
      univerAPI.createWorkbook({});
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      univer?.dispose();
      univerApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    univerApiRef.current?.toggleDarkMode(theme === "dark");
  }, [theme]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !univerApiRef.current) return;

    setImportando(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<ImportedCellValue[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
      });
      if (data.length === 0) {
        alert(`"${sheetName}" no tiene celdas con datos.`);
        return;
      }

      const numCols = data.reduce((max, row) => Math.max(max, row.length), 0);
      const normalized = data.map((row) => {
        const filled = [...row];
        while (filled.length < numCols) filled.push("");
        return filled;
      });

      const fWorksheet = univerApiRef.current.getActiveWorkbook()?.getActiveSheet();
      if (!fWorksheet) {
        console.error("Univer: no hay una hoja activa para importar los datos.");
        alert("No se pudo importar: la hoja de cálculo no está lista todavía.");
        return;
      }

      fWorksheet.getRange(0, 0, normalized.length, numCols).setValues(normalized);
    } catch (err) {
      console.error("Error importando Excel:", err);
      alert(`No se pudo importar el archivo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button size="sm" variant="outline" onClick={handleImportClick} disabled={importando}>
            <Upload className="mr-1.5 size-4" />
            {importando ? "Importando…" : "Importar Excel"}
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
