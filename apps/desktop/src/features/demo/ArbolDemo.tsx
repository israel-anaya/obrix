import { useEffect, useMemo, useRef, useState } from "react";
import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  createExpandedRowModel,
  rowExpandingFeature,
  tableFeatures,
  useTable,
  type ExpandedState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
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

const ALTO_FILA = 28;

export function ArbolDemo() {
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Selector deliberadamente angosto: expanded cambia qué filas existen (afecta
  // la lista que se vira), pero columnSizing NO debería re-renderizar este
  // componente en cada pixel de un drag de resize — eso se aisla más abajo con
  // table.Subscribe, para que un resize con 10k filas no re-renderice de más.
  const table = useTable(
    {
      features,
      data,
      columns,
      initialState: { expanded: true as ExpandedState },
      columnResizeMode: "onChange",
      enableColumnResizing: true,
      getSubRows: (row: NodoFamilia) => row.children,
    },
    (state) => ({ expanded: state.expanded }),
  );

  const rows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ALTO_FILA,
    getItemKey: (index) => rows[index].id,
    overscan: 10,
  });

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2">
        <p className="text-xs text-muted-foreground">
          Demo — Familias de insumo en árbol real con TanStack Table (expand/collapse), virtualizado
          para soportar miles de filas, sin ag-Grid Enterprise.
        </p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <table.Subscribe selector={(state) => state.columnSizing}>
          {() => (
            <table className="border-collapse text-sm" style={{ width: table.getTotalSize() }}>
              <thead className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="flex">
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
              <tbody
                style={{ height: rowVirtualizer.getTotalSize(), position: "relative", display: "block" }}
              >
                {rowVirtualizer.getVirtualItems().map((item) => {
                  const row = rows[item.index];
                  return (
                    <tr
                      key={row.id}
                      data-index={item.index}
                      ref={rowVirtualizer.measureElement}
                      style={{ position: "absolute", top: 0, transform: `translateY(${item.start}px)`, width: "100%" }}
                      className={cn("flex hover:bg-accent", item.index % 2 === 1 && "bg-muted/40")}
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
                  );
                })}
                {rows.length === 0 && (
                  <tr className="flex" style={{ width: "100%" }}>
                    <td colSpan={columns.length} className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Sin familias registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </table.Subscribe>
      </div>
    </div>
  );
}
