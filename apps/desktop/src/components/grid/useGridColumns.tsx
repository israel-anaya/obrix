import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { columnHelper, features } from "./gridTable";
import { widthVar } from "./gridLayout";
import { RowActions } from "./rows/RowActions";
import { RowIndex } from "./rows/RowIndex";
import { GridCellMemo } from "./rows/GridCell";
import type { DataGridColumn, Row } from "./types";

/**
 * Everything derived from `config.columns`: the table's column definitions, the
 * lookup by field, and the per-column styles and classes. It is all pure
 * geometry —it does not read the grid's state— so it recomputes only when the
 * columns or the selection mode change, never on an edit or a keystroke.
 */
export function useGridColumns(configColumns: DataGridColumn[], selectionMode: "multiple" | "single") {
  /** Lookup by field — used by the keyboard shortcuts and the clipboard, which
   * used to scan `configColumns` with a `find` on every keypress. */
  const columnByField = useMemo(
    () => new Map(configColumns.map((c) => [c.field, c])),
    [configColumns],
  );

  const columns = useMemo(() => {
    const cols: ColumnDef<typeof features, Row, any>[] = [];
    cols.push(
      columnHelper.display({
        id: "__index",
        header: "",
        size: 36,
        minSize: 36,
        enableResizing: false,
        cell: (ctx) => <RowIndex rowId={ctx.row.original._id} index={ctx.row.index + 1} />,
      }),
    );
    if (selectionMode === "multiple") {
      cols.push(
        columnHelper.display({
          id: "__select",
          header: "",
          size: 36,
          minSize: 36,
          enableResizing: false,
          cell: (ctx) => (
            <div className="flex h-full items-center justify-center">
              <input
                type="checkbox"
                checked={ctx.row.getIsSelected()}
                onChange={(e) => ctx.row.toggleSelected(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ),
        }),
      );
    }
    cols.push(
      columnHelper.display({
        id: "__actions",
        header: "",
        size: 54,
        minSize: 54,
        enableResizing: false,
        cell: (ctx) => <RowActions rowId={ctx.row.original._id} />,
      }),
    );
    for (const c of configColumns) {
      cols.push(
        columnHelper.accessor((row) => row[c.field], {
          id: c.field,
          header: c.header,
          size: c.width,
          minSize: 48,
          enableGlobalFilter: true,
          cell: (ctx) => <GridCellMemo column={c} row={ctx.row.original} columns={configColumns} />,
        }),
      );
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configColumns, selectionMode]);

  // The `__` columns (selection checkbox, action buttons) are pinned to the
  // left edge, one after another — each with the accumulated offset of the
  // previous widths, not all at `left: 0` (that would overlap them).
  const { pinnedLeft, pinnedWidth } = useMemo(() => {
    const map = new Map<string, number>();
    let offset = 0;
    for (const c of columns) {
      const id = String(c.id ?? "");
      if (!id.startsWith("__")) break;
      map.set(id, offset);
      offset += c.size ?? 0;
    }
    return { pinnedLeft: map, pinnedWidth: offset };
  }, [columns]);

  // Per-column styles and classes, computed once: the width no longer travels
  // in each `<td>`'s `style` (it goes through a CSS variable on the `<table>`,
  // see `widthVar`), so they are all constant per column. Avoids building a
  // style object and calling `cn`/`twMerge` per cell on every render — and
  // during a resize the header repaints on every `mousemove`.
  const { cellStyles, cellClasses, pinnedColumns, thClasses, thButtonClasses } = useMemo(() => {
    const styles = new Map<string, React.CSSProperties>();
    const classes = new Map<string, string>();
    const pinned = new Set<string>();
    const th = new Map<string, string>();
    const thButton = new Map<string, string>();
    for (const c of columns) {
      const id = String(c.id ?? "");
      const width = `var(${widthVar(id)})`;
      const left = pinnedLeft.get(id);
      const isNumeric = columnByField.get(id)?.numeric;
      styles.set(id, {
        flex: `0 0 ${width}`,
        width: width,
        ...(left !== undefined ? { left: left } : { scrollMarginLeft: pinnedWidth }),
      });
      classes.set(
        id,
        cn(
          "overflow-hidden py-0.5 text-xs",
          "border-b border-r border-border",
          id.startsWith("__") && "px-0",
          left !== undefined && "sticky z-[1]",
        ),
      );
      th.set(
        id,
        cn(
          "relative border-b border-r border-border px-1.5 py-1.5 text-xs font-medium text-muted-foreground",
          isNumeric ? "text-right" : "text-left",
          left !== undefined && "sticky z-30 bg-muted",
        ),
      );
      thButton.set(
        id,
        cn("flex items-center gap-1 hover:text-foreground disabled:opacity-50", isNumeric && "ml-auto"),
      );
      if (left !== undefined) pinned.add(id);
    }
    return { cellStyles: styles, cellClasses: classes, pinnedColumns: pinned, thClasses: th, thButtonClasses: thButton };
  }, [columns, pinnedLeft, pinnedWidth, columnByField]);

  return {
    columnByField,
    columns,
    pinnedWidth,
    cellStyles,
    cellClasses,
    pinnedColumns,
    thClasses,
    thButtonClasses,
  };
}
