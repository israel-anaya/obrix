import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { GridUiContext, type GridUi } from "./gridContext";
import { createSelectionStore, createStore, EMPTY_CHROME } from "./gridStore";
import { emptyValue, firstEditableField } from "./gridValues";
import { GridCellMemo } from "./rows/GridCell";
import { RowActions } from "./rows/RowActions";
import { useRowEditing } from "./useRowEditing";
import type { DataGridColumn, DataGridMeta, DataGridPersistProps, GridChrome, OpenCell, Row } from "./types";

export type { DataGridColumn, Row } from "./types";

export interface VerticalGridGroup {
  id: string;
  title?: ReactNode;
  /** Overrides the title's size/weight (outer groups default to `text-sm font-semibold`, nested ones to a lighter bar). */
  titleClassName?: string;
  /** A group is either a leaf (`fields`, in the order they paint) or a branch (`groups`, nested) — exactly one of the two. */
  fields?: string[];
  groups?: VerticalGridGroup[];
}

type FlatItem =
  | { type: "title"; id: string; title: ReactNode; className?: string; depth: number }
  | { type: "field"; field: string };

function flatten(groups: VerticalGridGroup[], depth = 0): FlatItem[] {
  const out: FlatItem[] = [];
  for (const g of groups) {
    if (g.title !== undefined) out.push({ type: "title", id: g.id, title: g.title, className: g.titleClassName, depth });
    if (g.groups) out.push(...flatten(g.groups, depth + 1));
    else if (g.fields) for (const field of g.fields) out.push({ type: "field", field });
  }
  return out;
}

/**
 * Grid "acostado": comparte el motor de edición de `DataGrid` —mismos
 * `DataGridColumn`/`Row`, mismo `useRowEditing` (draft por registro, ✓/✗,
 * guardado/errores), mismo `GridCell`/`CellEditor` por celda (F2/doble clic
 * entra en edición, Escape cancela la celda, Tab/Enter avanza de campo,
 * Ctrl+Enter confirma el registro)— solo que lo pinta al revés: cada
 * `DataGridColumn` (un campo capturable) es un renglón, cada `Row` (un
 * registro) es una columna. A diferencia de `DataGrid`, los renglones pueden
 * agruparse bajo un título que abarca todo el ancho (`groups`).
 *
 * Las flechas quedan invertidas para calzar con el dibujo: ↑/↓ camina los
 * campos del registro actual (equivalente al ←/→ de `DataGrid`) y sigue
 * funcionando mientras ese registro está en edición; ←/→ camina entre
 * registros (equivalente al ↑/↓ de `DataGrid`) y, como allá, se bloquea
 * mientras hay un registro en edición — no tiene sentido saltar a otro
 * mientras uno sigue en borrador. El teclado solo actúa mientras el foco está
 * dentro del propio grid, nunca en toda la ventana, y cede por completo a un
 * editor de celda abierto (igual que `DataGrid` distingue con `inEditor`).
 *
 * Deliberadamente no trae lo que este caso no necesita: virtualización,
 * resize de columnas, drag, portapapeles, alta/borrado de registros en línea
 * (agregar/quitar columna aquí es un flujo externo del consumidor, ver
 * `onAddColumn`).
 */
export function VerticalGrid({
  columns,
  groups,
  renderColumnHeader,
  onAddColumn,
  addColumnTitle = "Agregar columna",
  initialRows,
  onEditRow,
  onSaveError,
  onSaveSuccess,
  onCancelEdit,
}: {
  /** Los campos capturables — se pintan como renglones. */
  columns: DataGridColumn[];
  /** Organiza los campos en secciones tituladas (anidables); el orden aquí es el orden de los renglones. */
  groups: VerticalGridGroup[];
  /** Los registros — se pintan como columnas, en este orden. */
  initialRows: Row[];
  renderColumnHeader: (row: Row) => ReactNode;
  onAddColumn?: () => void;
  addColumnTitle?: string;
} & Pick<DataGridPersistProps, "onEditRow" | "onSaveError" | "onSaveSuccess" | "onCancelEdit">) {
  const selectionStore = useRef(createSelectionStore()).current;
  const openCellStore = useRef(createStore<OpenCell | null>(null)).current;
  const chromeStore = useRef(createStore<GridChrome>(EMPTY_CHROME)).current;
  const metaRef = useRef<DataGridMeta>(null as unknown as DataGridMeta);
  const columnsRef = useRef<DataGridColumn[]>(columns);
  columnsRef.current = columns;
  const uiStore = useRef<GridUi>({
    selection: selectionStore,
    openCell: openCellStore,
    chrome: chromeStore,
    meta: metaRef,
    columns: columnsRef,
  }).current;

  const {
    rows,
    rowsRef,
    editing,
    editingRef,
    saving,
    saveError,
    errorFields,
    selectCell,
    openCellAt,
    closeCell,
    commitCellChange,
    commitEdit,
    cancelEdit,
  } = useRowEditing({
    columns,
    initialRows,
    selection: selectionStore,
    openCell: openCellStore,
    onEditRow,
    onSaveError,
    onSaveSuccess,
    onCancelEdit,
  });

  const meta: DataGridMeta = {
    editing,
    highlightSelection: false,
    saving,
    selectCell,
    openCellAt,
    commitCellChange,
    closeCell,
    commitEdit: () => void commitEdit(),
    cancelEdit,
    errorFields,
    saveError,
  };
  metaRef.current = meta;
  useEffect(() => {
    chromeStore.set({ editing, saving, errorFields, saveError, highlightSelection: false });
  }, [chromeStore, editing, saving, errorFields, saveError]);

  const columnByField = useMemo(() => new Map(columns.map((c) => [c.field, c])), [columns]);
  const items = useMemo(() => flatten(groups), [groups]);
  const orderedFields = useMemo(
    () => items.filter((i): i is Extract<FlatItem, { type: "field" }> => i.type === "field").map((i) => i.field),
    [items],
  );

  const contenedorRef = useRef<HTMLDivElement>(null);
  const focusContenedor = () => contenedorRef.current?.focus({ preventScroll: true });

  const onContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // El evento burbujea desde el `<input>`/`<select>` del editor de celda —
    // `CellEditor` ya lo maneja por su cuenta (Escape/Tab/Enter/Ctrl+Enter);
    // este nivel no debe repetir ni pisar esa lógica.
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;

    const sel = selectionStore.get();
    const openCellNow = openCellStore.get();

    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S") && editing) {
      e.preventDefault();
      void commitEdit();
      return;
    }

    // Escape con el editor cerrado cancela el borrador del registro completo
    // (igual que el ✗) — con el editor abierto, `CellEditor` ya consumió
    // Escape para descartar solo esa celda.
    if (e.key === "Escape" && editing && !openCellNow) {
      e.preventDefault();
      cancelEdit();
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (orderedFields.length === 0) return;
      e.preventDefault();
      if (!sel) {
        const rowId = rows[0]?._id;
        if (rowId) selectionStore.set({ rowId, field: orderedFields[0] });
        return;
      }
      const idx = orderedFields.indexOf(sel.field);
      const next = orderedFields[Math.min(orderedFields.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) selectionStore.set({ rowId: sel.rowId, field: next });
      return;
    }

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Saltar de registro en pleno borrador lo dejaría a medio confirmar —
      // igual que `DataGrid` bloquea ↑/↓ (su eje de fila) mientras se edita.
      if (editingRef.current) return;
      if (rows.length === 0) return;
      e.preventDefault();
      const currentIdx = sel ? rows.findIndex((r) => r._id === sel.rowId) : -1;
      const nextRow = rows[Math.min(rows.length - 1, Math.max(0, currentIdx + (e.key === "ArrowRight" ? 1 : -1)))];
      const field = sel?.field ?? firstEditableField(columns);
      if (nextRow && field) selectionStore.set({ rowId: nextRow._id, field });
      return;
    }

    if (!openCellNow && sel && e.key === "F2") {
      const column = columnByField.get(sel.field);
      if (column && !column.readOnly) {
        e.preventDefault();
        if (column.boolean) {
          const row = rowsRef.current.find((r) => r._id === sel.rowId);
          if (row) commitCellChange(sel.rowId, column.field, !row[column.field]);
        } else {
          openCellAt(sel.rowId, sel.field);
        }
      }
      return;
    }

    if (!openCellNow && sel && e.key === " ") {
      const column = columnByField.get(sel.field);
      if (column?.boolean && !column.readOnly) {
        e.preventDefault();
        const row = rowsRef.current.find((r) => r._id === sel.rowId);
        if (row) commitCellChange(sel.rowId, column.field, !row[column.field]);
        return;
      }
    }

    // Delete/Backspace limpian la celda seleccionada y entran al borrador del
    // registro — no se guarda hasta ✓, igual que en Excel y que `DataGrid`.
    if (!openCellNow && sel && (e.key === "Delete" || e.key === "Backspace")) {
      const column = columnByField.get(sel.field);
      if (column && !column.readOnly) {
        e.preventDefault();
        commitCellChange(sel.rowId, column.field, emptyValue(column));
      }
      return;
    }

    // Teclear directo sobre la celda seleccionada abre el editor reemplazando
    // el valor — igual que Excel y que `DataGrid`.
    if (!openCellNow && sel && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const column = columnByField.get(sel.field);
      if (column && !column.readOnly && !column.boolean) {
        e.preventDefault();
        openCellAt(sel.rowId, sel.field, e.key);
      }
    }
  };

  const colSpanCompleto = rows.length + (onAddColumn ? 1 : 0) + 1;
  let vistosDeNivelSuperior = 0;

  return (
    <GridUiContext.Provider value={uiStore}>
      <div ref={contenedorRef} tabIndex={0} onKeyDown={onContainerKeyDown} className="w-fit max-w-full outline-none">
        <table className="w-max max-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-border bg-muted px-3 py-1.5 text-left font-semibold text-muted-foreground" />
              {rows.map((row) => (
                <th key={row._id} className="w-24 border border-border bg-muted px-2 py-1.5 text-center font-semibold text-foreground">
                  <div className="flex flex-col items-center gap-1">
                    {renderColumnHeader(row)}
                    <RowActions rowId={row._id} />
                  </div>
                </th>
              ))}
              {onAddColumn && (
                <th className="border border-border bg-muted p-0 text-center">
                  <button
                    type="button"
                    title={addColumnTitle}
                    onClick={onAddColumn}
                    className="flex h-full w-8 items-center justify-center py-1.5 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                  >
                    <Plus size={14} />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              if (item.type === "title") {
                const esNivelSuperior = item.depth === 0;
                if (esNivelSuperior) vistosDeNivelSuperior += 1;
                return (
                  <tr key={item.id}>
                    <td
                      colSpan={colSpanCompleto}
                      className={cn(
                        esNivelSuperior
                          ? cn("border-b-2 border-foreground/20 px-4 py-3", vistosDeNivelSuperior > 1 && "border-t-2")
                          : "border border-border bg-muted/60 px-3 py-1 font-semibold text-foreground",
                        item.className ?? (esNivelSuperior ? "text-sm font-semibold" : undefined),
                      )}
                    >
                      {item.title}
                    </td>
                  </tr>
                );
              }
              const column = columnByField.get(item.field);
              if (!column) return null;
              return (
                <tr key={item.field}>
                  <th className="border border-border px-3 py-1 text-left font-normal text-foreground">{column.header}</th>
                  {rows.map((row) => (
                    <td key={row._id} onClick={focusContenedor} className="border border-border p-0 text-center">
                      <GridCellMemo column={column} row={row} />
                    </td>
                  ))}
                  {onAddColumn && <td className="border border-border p-0" />}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GridUiContext.Provider>
  );
}
