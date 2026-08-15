/**
 * Banco de pruebas del `VerticalGrid`, fuera de Tauri: monta el grid acostado
 * con datos falsos y expone los callbacks de persistencia como texto en el
 * DOM, para que Playwright pueda afirmar sobre ellos (ver
 * `tests/verticalgrid.spec.ts`). Gemelo de `gridTestHarness.tsx`.
 *
 * Se sirve solo en `vite dev` (`/vertical-grid-test.html`): `vite build`
 * únicamente empaqueta `index.html`, así que nada de esto llega a la app.
 */
import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  VerticalGrid,
  type VerticalGridGroup,
} from "@/components/grid/VerticalGrid";
import type { DataGridConfig, DataGridHandle, Row } from "@/components/grid/DataGrid";
import "./index.css";

const TURNOS = ["Matutino", "Vespertino", "Mixto"] as const;

const config: DataGridConfig = {
  title: "Perfiles",
  columns: [
    { field: "nombre", header: "Nombre", width: 160 },
    { field: "turno", header: "Turno", width: 120, options: TURNOS },
    { field: "espera_depreciacion", header: "Espera · Depreciación", width: 120, numeric: true, suffix: "%" },
    { field: "espera_inversion", header: "Espera · Inversión", width: 120, numeric: true, suffix: "%" },
    { field: "reserva_depreciacion", header: "Reserva · Depreciación", width: 120, numeric: true, suffix: "%" },
    { field: "reserva_inversion", header: "Reserva · Inversión", width: 120, numeric: true, suffix: "%" },
    { field: "activo", header: "Activo", width: 90, boolean: true },
    { field: "created_at", header: "Creado", width: 150, date: true, readOnly: true },
  ],
};

const groups: VerticalGridGroup[] = [
  { id: "identificacion", title: "Identificación", fields: ["nombre", "turno"] },
  {
    id: "porcentajes",
    title: "Porcentajes",
    groups: [
      { id: "espera", title: "En espera", fields: ["espera_depreciacion", "espera_inversion"] },
      { id: "reserva", title: "En reserva", fields: ["reserva_depreciacion", "reserva_inversion"] },
    ],
  },
  // Sin título: agrupa sus campos pero no pinta renglón de sección.
  { id: "control", title: "", fields: ["activo", "created_at"] },
];

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    _id: `p${i}`,
    nombre: `Perfil ${i}`,
    turno: TURNOS[i % TURNOS.length],
    espera_depreciacion: i * 2,
    espera_inversion: i * 3,
    reserva_depreciacion: i * 4,
    reserva_inversion: i * 5,
    activo: i % 2 === 0,
    created_at: `2026-0${(i % 9) + 1}-1${i % 9}T09:00:00`,
  }));
}

function Harness() {
  const [rows, setRows] = useState<Row[]>(() => makeRows(4));
  const [single, setSingle] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [vacio, setVacio] = useState(false);
  const [agrupado, setAgrupado] = useState(true);
  const [altoFijo, setAltoFijo] = useState(false);
  const [log, setLog] = useState("");
  const ref = useRef<DataGridHandle>(null);

  const record = (event: string, payload: unknown) => setLog(`${event} ${JSON.stringify(payload)}`);

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
          <input data-t="grouped" type="checkbox" checked={agrupado} onChange={(e) => setAgrupado(e.target.checked)} />
          agrupado
        </label>
        <label className="flex items-center gap-1">
          <input data-t="alto" type="checkbox" checked={altoFijo} onChange={(e) => setAltoFijo(e.target.checked)} />
          alto fijo
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
          sin registros
        </label>
        <span data-t="count">registros:{rows.length}</span>
        <span data-t="log" className="truncate font-mono">
          {log}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <VerticalGrid
          key={single ? "single" : "multiple"}
          ref={ref}
          config={config}
          groups={agrupado ? groups : undefined}
          recordHeaderHeight={altoFijo ? 48 : undefined}
          selectionMode={single ? "single" : "multiple"}
          initialRows={vacio ? [] : rows}
          loading={cargando}
          onAddRow={async (row) => {
            if (failNext) throw new Error("El campo nombre no puede estar vacío");
            record("add", row.nombre);
            setRows((prev) => (prev.some((r) => r._id === row._id) ? prev : [...prev, row]));
          }}
          onEditRow={async (row) => {
            if (failNext) throw new Error("El campo nombre no puede estar vacío");
            record("edit", { id: row._id, nombre: row.nombre, espera_depreciacion: row.espera_depreciacion });
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
