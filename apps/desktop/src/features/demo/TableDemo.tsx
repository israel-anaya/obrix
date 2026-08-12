import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const obrixGridTheme = themeQuartz.withParams({
  backgroundColor: "hsl(var(--card))",
  foregroundColor: "hsl(var(--foreground))",
  borderColor: "hsl(var(--border))",
  chromeBackgroundColor: "hsl(var(--muted))",
  headerBackgroundColor: "hsl(var(--muted))",
  headerTextColor: "hsl(var(--muted-foreground))",
  oddRowBackgroundColor: "hsl(var(--muted) / 0.4)",
  rowHoverColor: "hsl(var(--accent))",
  selectedRowBackgroundColor: "hsl(var(--primary) / 0.15)",
  accentColor: "hsl(var(--primary))",
  fontFamily: "inherit",
  fontSize: 13,
  rowHeight: 30,
  headerHeight: 32,
  borderRadius: 6,
  wrapperBorderRadius: 6,
  spacing: 6,
});

interface InsumoDemo {
  clave: string;
  descripcion: string;
  tipo: string;
  unidad: string;
  precio: number;
}

const DATA: InsumoDemo[] = [
  { clave: "MAT-001", descripcion: "Cemento gris CPC 30R (50kg)", tipo: "Material", unidad: "PZA", precio: 185.5 },
  { clave: "MAT-002", descripcion: 'Varilla corrugada 3/8" grado 42', tipo: "Material", unidad: "PZA", precio: 142.3 },
  { clave: "MAT-003", descripcion: "Arena de río", tipo: "Material", unidad: "M3", precio: 380 },
  { clave: "MAT-004", descripcion: 'Grava 3/4"', tipo: "Material", unidad: "M3", precio: 420 },
  { clave: "MO-001", descripcion: "Albañil", tipo: "Mano de obra", unidad: "JOR", precio: 450 },
  { clave: "MO-002", descripcion: "Ayudante general", tipo: "Mano de obra", unidad: "JOR", precio: 320 },
  { clave: "MO-003", descripcion: "Cabo de obra", tipo: "Mano de obra", unidad: "JOR", precio: 520 },
  { clave: "EQ-001", descripcion: "Revolvedora 1 saco", tipo: "Equipo", unidad: "HR", precio: 65 },
  { clave: "EQ-002", descripcion: "Vibrador de concreto", tipo: "Equipo", unidad: "HR", precio: 45 },
  { clave: "EQ-003", descripcion: "Andamio tubular", tipo: "Equipo", unidad: "DIA", precio: 90 },
];

export function TableDemo() {
  const columnDefs = useMemo<ColDef<InsumoDemo>[]>(
    () => [
      { field: "clave", headerName: "Clave", width: 110, pinned: "left" },
      { field: "descripcion", headerName: "Descripción", flex: 1, minWidth: 220, editable: true },
      { field: "tipo", headerName: "Tipo", width: 130 },
      { field: "unidad", headerName: "Unidad", width: 90 },
      {
        field: "precio",
        headerName: "Precio unitario",
        width: 150,
        type: "rightAligned",
        editable: true,
        valueFormatter: (p) => (p.value != null ? `$${Number(p.value).toFixed(2)}` : ""),
        cellClass: "num",
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2">
        <p className="text-xs text-muted-foreground">
          Datos de ejemplo, sin conexión — solo para evaluar el look &amp; feel.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <AgGridReact
          theme={obrixGridTheme}
          rowData={DATA}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
          animateRows
        />
      </div>
    </div>
  );
}
