import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CellEditor } from "../cells/CellEditor";
import { CellView } from "../cells/CellView";
import { CELL_ERROR, CELL_LOCKED, CELL_ROW_EDIT, CELL_ROW_NEW, CELL_SAVING, useCellState, useGridUi, useIsCellSelected, useOpenCell } from "../gridContext";
import { isFieldEditable } from "../gridValues";
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
  // A `readOnlyOnEdit` column only takes input while its row is the new-record
  // draft; on every other row the record already exists and the cell is locked.
  const editable = isFieldEditable(column, (state & CELL_ROW_NEW) !== 0);
  if (editable && openCell && !column.boolean) {
    return (
      <CellEditor column={column} row={row} meta={meta} forcedValue={openCell.initialValue} />
    );
  }
  const canMutate = editable && (state & (CELL_SAVING | CELL_LOCKED)) === 0;
  // The permanently read-only columns are muted everywhere; the ones locked
  // only on edit, just while that row's draft is open — otherwise every
  // existing record would show its key greyed out at rest, and the user would
  // read it as data that is missing rather than data that is fixed.
  const muted = column.readOnly || (!editable && (state & CELL_ROW_EDIT) !== 0);
  return (
    <div
      className={cn(
        "flex h-full min-h-[22px] min-w-0 items-center px-1 ring-inset",
        muted && "text-muted-foreground",
        selected && !hasError && "ring-2 ring-primary",
        hasError && "ring-2 ring-destructive",
      )}
      title={hasError ? (meta.saveError ?? "Revisa este campo") : undefined}
      onClick={() => {
        meta.selectCell(row._id, column.field);
        if (selected && editable && !directClick) {
          meta.openCellAt(row._id, column.field);
        }
      }}
      onDoubleClick={!editable || directClick ? undefined : () => meta.openCellAt(row._id, column.field)}
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
