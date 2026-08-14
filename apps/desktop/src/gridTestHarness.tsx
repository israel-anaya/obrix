/**
 * Banco de pruebas del `DataGrid`, fuera de Tauri: monta el grid con datos
 * falsos y expone los callbacks de persistencia como texto en el DOM, para que
 * Playwright pueda afirmar sobre ellos (ver `tests/datagrid.spec.ts`).
 *
 * Se sirve solo en `vite dev` (`/grid-test.html`): `vite build` únicamente
 * empaqueta `index.html`, así que nada de esto llega a la app.
 */
import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import "./index.css";

const FAMILIAS = ["Cemento", "Acero", "Madera", "Pintura"] as const;
const UNIDADES: Record<string, readonly string[]> = {
  Cemento: ["Bulto", "Ton", "m³"],
  Acero: ["kg", "Ton", "Varilla"],
  Madera: ["Pieza", "m²", "m³"],
  Pintura: ["Litro", "Cubeta", "Galón"],
};

const config: DataGridConfig = {
  title: "Insumos",
  columns: [
    { field: "codigo", header: "Código", width: 90 },
    { field: "descripcion", header: "Descripción", width: 260, indentBy: "nivel" },
    { field: "familia", header: "Familia", width: 130, options: FAMILIAS },
    {
      field: "unidad",
      header: "Unidad",
      width: 110,
      options: (row) => UNIDADES[String(row.familia)] ?? [],
    },
    { field: "cantidad", header: "Cantidad", width: 100, numeric: true },
    { field: "precio", header: "Precio", width: 110, numeric: true },
    { field: "merma", header: "Merma", width: 90, numeric: true, suffix: "%" },
    { field: "activo", header: "Activo", width: 70, boolean: true },
    { field: "calidad", header: "Calidad", width: 110, stars: true },
    { field: "notas", header: "Notas", width: 200 },
    { field: "created_at", header: "Creado", width: 150, date: true, readOnly: true },
    { field: "created_by", header: "Por", width: 110, readOnly: true },
  ],
};

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const familia = FAMILIAS[i % FAMILIAS.length];
    return {
      _id: `r${i}`,
      nivel: i % 7 === 0 ? 0 : i % 3,
      codigo: `INS-${String(i).padStart(4, "0")}`,
      descripcion: `Insumo de prueba número ${i}`,
      familia,
      unidad: UNIDADES[familia][i % 3],
      cantidad: (i % 50) + 1,
      precio: Math.round((i * 37.5 + 100) * 100) / 100,
      merma: i % 15,
      activo: i % 4 !== 0,
      calidad: (i % 6) * 0.5 + 2,
      notas: i % 5 === 0 ? `Nota ${i}` : "",
      created_at: `2026-0${(i % 9) + 1}-1${i % 9}T09:${String(i % 60).padStart(2, "0")}:00`,
      created_by: `user${i % 4}`,
    } as Row;
  });
}

function Harness() {
  const [rows, setRows] = useState<Row[]>(() => makeRows(500));
  const [single, setSingle] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [vacio, setVacio] = useState(false);
  const [log, setLog] = useState("");
  const ref = useRef<DataGridHandle>(null);

  const record = (event: string, payload: unknown) =>
    setLog(`${event} ${JSON.stringify(payload)}`);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-2 text-xs">
        <button data-t="add" onClick={() => ref.current?.addRow()} className="rounded border px-2 py-1">
          Agregar
        </button>
        <button data-t="del" onClick={() => ref.current?.deleteSelectedRows()} className="rounded border px-2 py-1">
          Eliminar
        </button>
        <button
          data-t="theme"
          onClick={() => document.documentElement.classList.toggle("dark")}
          className="rounded border px-2 py-1"
        >
          Tema
        </button>
        <label className="flex items-center gap-1">
          <input data-t="single" type="checkbox" checked={single} onChange={(e) => setSingle(e.target.checked)} />
          single
        </label>
        <label className="flex items-center gap-1">
          <input data-t="fail" type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} />
          fallar guardado
        </label>
        <label className="flex items-center gap-1">
          <input data-t="loading" type="checkbox" checked={cargando} onChange={(e) => setCargando(e.target.checked)} />
          cargando
        </label>
        <label className="flex items-center gap-1">
          <input data-t="empty" type="checkbox" checked={vacio} onChange={(e) => setVacio(e.target.checked)} />
          sin filas
        </label>
        <span data-t="count">filas:{rows.length}</span>
        <span data-t="log" className="truncate font-mono">
          {log}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <DataGrid
          key={single ? "single" : "multiple"}
          ref={ref}
          config={config}
          selectionMode={single ? "single" : "multiple"}
          initialRows={vacio ? [] : rows}
          loading={cargando}
          onAddRow={async (row) => {
            if (failNext) throw new Error("El campo descripción no puede estar vacío");
            record("add", row.codigo);
            setRows((prev) => (prev.some((r) => r._id === row._id) ? prev : [...prev, row]));
          }}
          onEditRow={async (row) => {
            if (failNext) throw new Error("El campo descripción no puede estar vacío");
            record("edit", { id: row._id, codigo: row.codigo, precio: row.precio });
            setRows((prev) => prev.map((r) => (r._id === row._id ? row : r)));
          }}
          onDeleteRows={async (ids) => {
            record("delete", ids);
            const gone = new Set(ids);
            setRows((prev) => prev.filter((r) => !gone.has(r._id)));
          }}
          onSaveError={(m) => record("error", m)}
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
