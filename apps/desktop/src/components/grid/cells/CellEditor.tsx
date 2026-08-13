import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { parseNumber } from "../gridValues";
import type { DataGridColumn, DataGridMeta, Row } from "../types";
import { CellCombobox } from "./CellCombobox";

/**
 * Inline cell editor — a text/number input or a `<select>` (boolean or options).
 * Commits on blur/Enter/Tab; Escape discards without saving. Tab/Shift+Tab
 * commit and open the editor of the next/previous editable column in the same
 * row. Enter/Shift+Enter commit and only select that column, without opening
 * its editor. It never jumps rows (the commit is per row, with ✓/✗).
 * Ctrl+Enter commits the whole row.
 */
export function CellEditor({
  column,
  row,
  meta,
  columns,
  forcedValue,
}: {
  column: DataGridColumn;
  row: Row;
  meta: DataGridMeta;
  columns: DataGridColumn[];
  forcedValue?: string;
}) {
  // When `forcedValue` is given (the editor opened by typing straight over the
  // selected cell, without a double click), it starts by replacing the existing
  // value — just like Excel.
  const initialValue = forcedValue ?? row[column.field];
  const [value, setValue] = useState<string>(
    forcedValue !== undefined ? forcedValue : String(initialValue ?? ""),
  );
  // Keeps the native blur fired when this editor unmounts (e.g. on closing
  // with Escape) from re-committing a value the user discarded.
  const discardedRef = useRef(false);

  const commit = (): boolean => {
    if (discardedRef.current) return false;
    let finalValue: string | number | boolean = value;
    if (column.boolean) finalValue = value === "Sí" || value === "true";
    else if (column.numeric) {
      const n = parseNumber(value);
      if (n === null) {
        discardedRef.current = true;
        meta.closeCell();
        return false;
      }
      finalValue = n;
    }
    meta.commitCellChange(row._id, column.field, finalValue);
    return true;
  };

  const navigate = (delta: 1 | -1, openEditor: boolean) => {
    const editable = columns.filter((c) => !c.readOnly);
    const currentIdx = editable.findIndex((c) => c.field === column.field);
    const next = editable[currentIdx + delta];
    meta.selectCell(row._id, next ? next.field : column.field);
    if (next && openEditor) meta.openCellAt(row._id, next.field);
  };

  const moveTo = (delta: 1 | -1, openEditor: boolean) => {
    commit();
    navigate(delta, openEditor);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === "Escape") {
      discardedRef.current = true;
      meta.closeCell();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (commit()) meta.commitEdit();
      return;
    }
    if (e.key === "Enter") {
      // Enter commits the cell and moves the selection to the next column of
      // *this* row — it never moves down, because the commit is per row (✓/✗).
      e.preventDefault();
      moveTo(e.shiftKey ? -1 : 1, false);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveTo(e.shiftKey ? -1 : 1, true);
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.currentTarget.tagName === "SELECT") {
      // A `<select>` does nothing with ←/→ (unlike a text input, where they
      // move the caret) — without blocking the default behaviour, the browser
      // falls back to scrolling the container.
      e.preventDefault();
    }
  };

  const options = typeof column.options === "function" ? column.options(row) : column.options;

  const className = cn(
    "h-full w-full cursor-text rounded-none border-none bg-background px-1 text-sm outline-none ring-1 ring-primary",
    column.numeric && "text-right tabular-nums",
  );

  if (options) {
    return (
      <CellCombobox
        options={options}
        initialValue={String(initialValue ?? "")}
        filterOnOpen={forcedValue !== undefined}
        className={className}
        onPick={(v) => meta.commitCellChange(row._id, column.field, v)}
        onDiscard={() => meta.closeCell()}
        onTab={(shift) => navigate(shift ? -1 : 1, true)}
        onEnter={(shift) => navigate(shift ? -1 : 1, false)}
        onCommitRow={() => meta.commitEdit()}
      />
    );
  }

  return (
    <input
      autoFocus
      type="text"
      inputMode={column.numeric ? "decimal" : undefined}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => {
        // Opened by typing (`forcedValue`): the value *is* the key just
        // pressed, so selecting it would make the next key replace it and the
        // first character would be lost. The caret goes to the end instead.
        if (forcedValue === undefined) e.currentTarget.select();
        else e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
}
