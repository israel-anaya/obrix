import { useEffect, useRef } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { activeGridClipboard, setActiveGridClipboard, type GridClipboard } from "@/components/grid/gridClipboard";
import type { SelectionStore, Store } from "./gridStore";
import { applyLineToRow, parseTsv, rowToTsv, writeClipboard } from "./gridTsv";
import { displayValue, emptyValue } from "./gridValues";
import type { DataGridColumn, EditState, OpenCell, Row } from "./types";

/** The native clipboard events fired inside an editor belong to the editor. */
function isFormField(target: EventTarget | null) {
  const t = target as HTMLElement | null;
  return t?.tagName === "INPUT" || t?.tagName === "SELECT" || t?.tagName === "TEXTAREA";
}

/**
 * Cut/Copy/Paste over the selection, in TSV so it round-trips with a
 * spreadsheet. Two entry points reach the same code: the container's native
 * events (returned here as handlers) and `App`'s Edit menu, which calls the
 * grid that last received focus through `gridClipboard`.
 *
 * A paste or a cut writes into the row's draft — nothing is persisted until ✓.
 */
export function useGridClipboard({
  columns,
  columnByField,
  selection: selectionStore,
  openCell: openCellStore,
  selectionMode,
  rowSelection,
  rowsRef,
  setRows,
  editingRef,
  setEditing,
  copyWholeRowRef,
  getSelectedRows,
  commitCellChange,
  scrollRef,
}: {
  columns: DataGridColumn[];
  columnByField: ReadonlyMap<string, DataGridColumn>;
  selection: SelectionStore;
  openCell: Store<OpenCell | null>;
  selectionMode: "multiple" | "single";
  rowSelection: RowSelectionState;
  rowsRef: React.RefObject<Row[]>;
  setRows: React.Dispatch<React.SetStateAction<Row[]>>;
  editingRef: React.RefObject<EditState | null>;
  setEditing: React.Dispatch<React.SetStateAction<EditState | null>>;
  copyWholeRowRef: React.RefObject<boolean>;
  getSelectedRows: () => Row[];
  commitCellChange: (rowId: string, field: string, value: string | number | boolean) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const textToCopy = (): string | null => {
    const selectedCell = selectionStore.get();
    const selectedRows = getSelectedRows();
    if (copyWholeRowRef.current || (selectionMode === "multiple" && selectedRows.length > 1)) {
      const source =
        selectionMode === "single"
          ? rowsRef.current.filter((f) => f._id === selectedCell?.rowId)
          : selectedRows.length > 0
            ? selectedRows
            : rowsRef.current.filter((f) => f._id === selectedCell?.rowId);
      if (source.length === 0) return null;
      return source.map((f) => rowToTsv(f, columns)).join("\n");
    }
    if (!selectedCell) return null;
    const row = rowsRef.current.find((f) => f._id === selectedCell.rowId);
    const col = columnByField.get(selectedCell.field);
    if (!row || !col) return null;
    return displayValue(row, col);
  };

  const copy = async () => {
    const text = textToCopy();
    if (text == null) return;
    await writeClipboard(text);
  };

  const applyPaste = (lines: string[][]) => {
    const selectedCell = selectionStore.get();
    const line = lines[0];
    if (!line || line.length === 0) return;
    const targetId = selectedCell?.rowId ?? Object.keys(rowSelection)[0];
    if (!targetId) return;
    if (editingRef.current && editingRef.current.id !== targetId) return;
    const row = rowsRef.current.find((f) => f._id === targetId);
    if (!row) return;
    let startIdx = 0;
    if (line.length === 1 && selectedCell) {
      startIdx = columns.findIndex((c) => c.field === selectedCell.field);
      if (startIdx < 0) startIdx = 0;
    }
    const { row: next, changed } = applyLineToRow(row, line, startIdx, columns);
    if (!changed) return;
    const nextRows = rowsRef.current.map((f) => (f._id === targetId ? next : f));
    rowsRef.current = nextRows;
    setRows(nextRows);
    openCellStore.set(null);
    if (!editingRef.current) {
      const nextEditing = { id: targetId, isNew: false, original: row };
      editingRef.current = nextEditing;
      setEditing(nextEditing);
    }
  };

  const clearCopiedSelection = () => {
    const selectedCell = selectionStore.get();
    if (!selectedCell) return;
    if (copyWholeRowRef.current) {
      const row = rowsRef.current.find((f) => f._id === selectedCell.rowId);
      if (!row) return;
      let next: Row = { ...row };
      let changed = false;
      for (const col of columns) {
        if (col.readOnly) continue;
        const empty = emptyValue(col);
        if (next[col.field] !== empty) {
          next = { ...next, [col.field]: empty };
          changed = true;
        }
      }
      if (!changed) return;
      const nextRows = rowsRef.current.map((f) => (f._id === selectedCell.rowId ? next : f));
      rowsRef.current = nextRows;
      setRows(nextRows);
      if (!editingRef.current) {
        const nextEditing = { id: selectedCell.rowId, isNew: false, original: row };
        editingRef.current = nextEditing;
        setEditing(nextEditing);
      }
      return;
    }
    const col = columnByField.get(selectedCell.field);
    if (!col || col.readOnly) return;
    commitCellChange(selectedCell.rowId, col.field, emptyValue(col));
  };

  const cut = async () => {
    await copy();
    clearCopiedSelection();
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) applyPaste(parseTsv(text));
    } catch {
      /* the native `paste` event covers the case without clipboard permission */
    }
  };

  const clipboardApiRef = useRef<GridClipboard>({
    copy: async () => {},
    cut: async () => {},
    paste: async () => {},
  });
  clipboardApiRef.current = { copy, cut, paste };

  useEffect(() => {
    const api: GridClipboard = {
      copy: () => clipboardApiRef.current.copy(),
      cut: () => clipboardApiRef.current.cut(),
      paste: () => clipboardApiRef.current.paste(),
    };
    const onFocus = () => setActiveGridClipboard(api);
    const el = scrollRef.current;
    el?.addEventListener("focusin", onFocus);
    return () => {
      el?.removeEventListener("focusin", onFocus);
      if (activeGridClipboard() === api) setActiveGridClipboard(null);
    };
  }, []);
  return {
    onCopy: (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (isFormField(e.target)) return;
      const text = textToCopy();
      if (text == null) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
    },
    onCut: (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (isFormField(e.target)) return;
      const text = textToCopy();
      if (text == null) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
      clearCopiedSelection();
    },
    onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (isFormField(e.target)) return;
      e.preventDefault();
      applyPaste(parseTsv(e.clipboardData.getData("text/plain")));
    },
  };
}
