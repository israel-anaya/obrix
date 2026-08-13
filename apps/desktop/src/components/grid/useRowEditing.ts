import { useEffect, useRef, useState } from "react";
import type { SelectionStore, Store } from "./gridStore";
import { emptyRow, fieldsFromMessage, firstEditableField, mergeRows } from "./gridValues";
import type { DataGridColumn, DataGridPersistProps, EditState, OpenCell, Row } from "./types";

/**
 * The rows and the lifecycle of the draft on top of them: which row is being
 * edited, the commands that change a cell, and the commit/cancel that persist
 * or revert it. Everything else in the grid (keyboard, clipboard, the imperative
 * handle) reads and writes the rows through the refs returned here, so there is
 * a single source of truth for what is on screen and what is in flight.
 */
export function useRowEditing({
  columns,
  initialRows,
  selection,
  openCell: openCellStore,
  onAddRow,
  onEditRow,
  onSaveError,
  onSaveSuccess,
  onCancelEdit,
}: {
  columns: DataGridColumn[];
  selection: SelectionStore;
  openCell: Store<OpenCell | null>;
} & Pick<
  DataGridPersistProps,
  "initialRows" | "onAddRow" | "onEditRow" | "onSaveError" | "onSaveSuccess" | "onCancelEdit"
>) {
  const isControlled = initialRows !== undefined;
  const [rows, setRows] = useState<Row[]>(
    () => initialRows ?? [emptyRow(columns), emptyRow(columns)],
  );
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<Set<string>>(() => new Set());
  const savingRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const copyWholeRowRef = useRef(false);

  useEffect(() => {
    if (!initialRows) return;
    setRows((prev) => mergeRows(prev, initialRows, editingRef.current, savingRef.current));
  }, [initialRows]);

  const selectCell = (rowId: string, field: string) => {
    if (editingRef.current && editingRef.current.id !== rowId) return;
    copyWholeRowRef.current = false;
    selection.set({ rowId, field });
  };

  const openCellAt = (rowId: string, field: string, initialValue?: string) => {
    if (editingRef.current && editingRef.current.id !== rowId) return;
    if (savingRef.current) return;
    openCellStore.set({ rowId, field, initialValue });
  };

  const closeCell = () => openCellStore.set(null);

  const commitCellChange = (rowId: string, field: string, value: string | number | boolean) => {
    const currentRow = rowsRef.current.find((f) => f._id === rowId);
    if (!currentRow || currentRow[field] === value) {
      openCellStore.set(null);
      return;
    }
    const nextRows = rowsRef.current.map((f) => (f._id === rowId ? { ...f, [field]: value } : f));
    rowsRef.current = nextRows;
    setRows(nextRows);
    openCellStore.set(null);
    setErrorFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
    if (!editingRef.current) {
      const nextEditing = { id: rowId, isNew: false, original: currentRow };
      editingRef.current = nextEditing;
      setEditing(nextEditing);
    }
  };

  const commitEdit = async () => {
    if (!editingRef.current || savingRef.current) return;
    const current = editingRef.current;
    openCellStore.set(null);
    const currentRow = rowsRef.current.find((f) => f._id === current.id);
    if (!currentRow) {
      setEditing(null);
      editingRef.current = null;
      return;
    }
    // Clearing a cell (e.g. Delete without typing anything new) can leave the
    // value `null`/`undefined` — it is sanitized here, on save, so as not to
    // depend on how each editor handles that case.
    const sanitizedRow: Row = { ...currentRow };
    for (const col of columns) {
      if (sanitizedRow[col.field] == null) {
        sanitizedRow[col.field] = col.numeric ? 0 : "";
      }
    }
    const nextRows = rowsRef.current.map((f) => (f._id === current.id ? sanitizedRow : f));
    rowsRef.current = nextRows;
    setRows(nextRows);
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setErrorFields(new Set());
    try {
      if (current.isNew) {
        if (isControlled) await onAddRow?.(sanitizedRow);
      } else if (isControlled) {
        await onEditRow?.(sanitizedRow);
      }
    } catch (e) {
      // If the save fails (e.g. a required field left empty), the draft is kept
      // (same row, same `isNew`) so it can be retried — clearing `editing` here
      // would make a later retry of a failed new row look like an edit of an
      // existing one, and it would try to update an id the backend never created.
      const message = e instanceof Error ? e.message : String(e);
      savingRef.current = false;
      setSaving(false);
      setSaveError(message);
      const flagged = fieldsFromMessage(message, columns, sanitizedRow);
      setErrorFields(new Set(flagged.length > 0 ? flagged : [firstEditableField(columns)].filter(Boolean) as string[]));
      onSaveError?.(message);
      return;
    }
    savingRef.current = false;
    setSaving(false);
    setSaveError(null);
    setErrorFields(new Set());
    editingRef.current = null;
    setEditing(null);
    onSaveSuccess?.();
  };

  const cancelEdit = () => {
    if (!editingRef.current || savingRef.current) return;
    const current = editingRef.current;
    openCellStore.set(null);
    if (current.isNew) {
      const nextRows = rowsRef.current.filter((f) => f._id !== current.id);
      rowsRef.current = nextRows;
      setRows(nextRows);
    } else {
      const nextRows = rowsRef.current.map((f) => (f._id === current.id ? current.original : f));
      rowsRef.current = nextRows;
      setRows(nextRows);
    }
    editingRef.current = null;
    setEditing(null);
    setSaveError(null);
    setErrorFields(new Set());
    onCancelEdit?.();
  };
  return {
    rows,
    setRows,
    rowsRef,
    editing,
    setEditing,
    editingRef,
    saving,
    saveError,
    errorFields,
    isControlled,
    copyWholeRowRef,
    selectCell,
    openCellAt,
    closeCell,
    commitCellChange,
    commitEdit,
    cancelEdit,
  };
}
