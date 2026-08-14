import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CellEditor } from "../cells/CellEditor";
import { CellView } from "../cells/CellView";
import { CELL_ERROR, CELL_LOCKED, CELL_SAVING, useCellState, useGridUi, useIsCellSelected, useOpenCell } from "../gridContext";
import type { DataGridColumn, Row } from "../types";

function GridCell({ column, row }: { column: DataGridColumn; row: Row }) {
  const ui = useGridUi();
  const meta = ui.meta.current;
  const openCell = useOpenCell(row._id, column.field);
  const selected = useIsCellSelected(row._id, column.field);
  const state = useCellState(row._id, column.field);
  const hasError = (state & CELL_ERROR) !== 0;
  const directClick = column.boolean || column.stars;

  // Stable (they go through the `meta` ref, not the render's `meta`) so that
  // `Stars` can be memoized and the checkbox never gets a fresh handler.
  const toggleBoolean = useCallback(() => {
    const m = ui.meta.current;
    m.selectCell(row._id, column.field);
    m.commitCellChange(row._id, column.field, !row[column.field]);
  }, [ui, row, column.field]);

  const pickStar = useCallback(
    (n: number) => {
      const m = ui.meta.current;
      m.selectCell(row._id, column.field);
      m.commitCellChange(row._id, column.field, n);
    },
    [ui, row._id, column.field],
  );
  if (!column.readOnly && openCell && !column.boolean) {
    return (
      <CellEditor column={column} row={row} meta={meta} forcedValue={openCell.initialValue} />
    );
  }
  const canMutate = !column.readOnly && (state & (CELL_SAVING | CELL_LOCKED)) === 0;
  return (
    <div
      className={cn(
        "flex h-full min-h-[22px] min-w-0 items-center px-1 ring-inset",
        column.readOnly && "text-muted-foreground",
        selected && !hasError && "ring-2 ring-primary",
        hasError && "ring-2 ring-destructive",
      )}
      title={hasError ? (meta.saveError ?? "Revisa este campo") : undefined}
      onClick={() => {
        meta.selectCell(row._id, column.field);
        if (selected && !column.readOnly && !directClick) {
          meta.openCellAt(row._id, column.field);
        }
      }}
      onDoubleClick={column.readOnly || directClick ? undefined : () => meta.openCellAt(row._id, column.field)}
    >
      <CellView
        row={row}
        column={column}
        onToggleBoolean={column.boolean && canMutate ? toggleBoolean : undefined}
        onStar={column.stars && canMutate ? pickStar : undefined}
      />
    </div>
  );
}

export const GridCellMemo = memo(GridCell);
