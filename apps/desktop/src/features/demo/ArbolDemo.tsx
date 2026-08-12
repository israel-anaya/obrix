import { useEffect, useMemo, useState } from "react";
import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  createExpandedRowModel,
  rowExpandingFeature,
  tableFeatures,
  useTable,
  type ColumnSizingState,
  type ExpandedState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { listFamiliasInsumo } from "@/lib/tauri";
import type { FamiliaInsumo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NodoFamilia extends FamiliaInsumo {
  children?: NodoFamilia[];
}

function construirArbol(items: FamiliaInsumo[]): NodoFamilia[] {
  const nodosPorId = new Map<string, NodoFamilia>(items.map((f) => [f.id, { ...f }]));
  const raices: NodoFamilia[] = [];
  for (const nodo of nodosPorId.values()) {
    if (nodo.parent_id && nodosPorId.has(nodo.parent_id)) {
      const padre = nodosPorId.get(nodo.parent_id)!;
      padre.children = [...(padre.children ?? []), nodo];
    } else {
      raices.push(nodo);
    }
  }
  const ordenar = (nodos: NodoFamilia[]) => {
    nodos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const nodo of nodos) if (nodo.children) ordenar(nodo.children);
  };
  ordenar(raices);
  return raices;
}

const features = tableFeatures({
  rowExpandingFeature,
  columnSizingFeature,
  columnResizingFeature,
  expandedRowModel: createExpandedRowModel(),
});

const columnHelper = createColumnHelper<typeof features, NodoFamilia>();

export function ArbolDemo() {
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  useEffect(() => {
    listFamiliasInsumo()
      .then(setFamilias)
      .catch((e) => setError(String(e)));
  }, []);

  const data = useMemo(() => construirArbol(familias), [familias]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("nombre", {
          header: "Nombre",
          size: 280,
          minSize: 120,
          cell: ({ row, getValue }) => (
            <div style={{ paddingLeft: row.depth * 20 }} className="flex items-center gap-1">
              {row.getCanExpand() ? (
                <button
                  type="button"
                  onClick={row.getToggleExpandedHandler()}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {row.getIsExpanded() ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-[18px]" />
              )}
              <span>{getValue()}</span>
            </div>
          ),
        }),
        columnHelper.accessor("created_at", {
          header: "Creado",
          size: 180,
          minSize: 100,
          cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
        }),
        columnHelper.accessor("created_by", {
          header: "Creado por",
          size: 220,
          minSize: 100,
          cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
        }),
        columnHelper.accessor("updated_at", {
          header: "Actualizado",
          size: 180,
          minSize: 100,
          cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ?? ""}</span>,
        }),
        columnHelper.accessor("updated_by", {
          header: "Actualizado por",
          size: 220,
          minSize: 100,
          cell: ({ getValue }) => <span className="text-muted-foreground">{getValue() ?? ""}</span>,
        }),
      ]),
    [],
  );

  const table = useTable({
    features,
    data,
    columns,
    state: { expanded, columnSizing },
    onExpandedChange: setExpanded,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    getSubRows: (row: NodoFamilia) => row.children,
  });

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2">
        <p className="text-xs text-muted-foreground">
          Demo — Familias de insumo en árbol real con TanStack Table (expand/collapse), sin ag-Grid Enterprise.
        </p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <table
          className="border-collapse text-sm"
          style={{ width: table.getTotalSize(), tableLayout: "fixed" }}
        >
          <thead className="sticky top-0 bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="relative border-b border-border px-2 py-1.5 text-left text-xs font-medium text-muted-foreground"
                  >
                    <table.FlexRender header={header} />
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={cn(
                        "absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary/50",
                        header.column.getIsResizing() && "bg-primary",
                      )}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={cn("hover:bg-accent", i % 2 === 1 && "bg-muted/40")}
              >
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-border px-2 py-1"
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-2 py-4 text-center text-xs text-muted-foreground">
                  Sin familias registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
