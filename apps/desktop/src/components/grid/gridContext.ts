import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { SelectionStore, Store } from "./gridStore";
import type { DataGridMeta, DraftKind, GridChrome, OpenCell } from "./types";

export type GridUi = {
  selection: SelectionStore;
  openCell: Store<OpenCell | null>;
  chrome: Store<GridChrome>;
  meta: { current: DataGridMeta };
};

export const GridUiContext = createContext<GridUi | null>(null);

export function useGridUi(): GridUi {
  const ctx = useContext(GridUiContext);
  if (!ctx) throw new Error("GridUiContext");
  return ctx;
}

// `getSnapshot` and `subscribe` go through `useCallback`: if their identity
// changes, React re-subscribes and re-runs the snapshot on every render.

export function useIsCellSelected(rowId: string, field: string) {
  const { selection } = useGridUi();
  return useSyncExternalStore(
    useCallback((fn) => selection.subscribeCell(rowId, field, fn), [selection, rowId, field]),
    useCallback(() => {
      const s = selection.get();
      return !!s && s.rowId === rowId && s.field === field;
    }, [selection, rowId, field]),
  );
}

export function useIsRowActive(rowId: string) {
  const { selection } = useGridUi();
  return useSyncExternalStore(
    useCallback((fn) => selection.subscribeRow(rowId, fn), [selection, rowId]),
    useCallback(() => selection.get()?.rowId === rowId, [selection, rowId]),
  );
}

export function useIsFieldActive(field: string) {
  const { selection } = useGridUi();
  return useSyncExternalStore(
    useCallback((fn) => selection.subscribeField(field, fn), [selection, field]),
    useCallback(() => selection.get()?.field === field, [selection, field]),
  );
}

export function useOpenCell(rowId: string, field: string) {
  const { openCell } = useGridUi();
  return useSyncExternalStore(
    openCell.subscribe,
    useCallback(() => {
      const a = openCell.get();
      return a?.rowId === rowId && a?.field === field ? a : null;
    }, [openCell, rowId, field]),
  );
}

/**
 * The three states the chrome contributes to a cell, packed into one integer: a
 * single subscription per cell instead of three (with ~20 columns × ~40 visible
 * rows that meant ~2,400 listener adds and removes per viewport turnover), and
 * a primitive snapshot React can compare without re-rendering.
 */
export const CELL_LOCKED = 1;
export const CELL_SAVING = 2;
export const CELL_ERROR = 4;

export function useCellState(rowId: string, field: string): number {
  const { chrome } = useGridUi();
  return useSyncExternalStore(
    chrome.subscribe,
    useCallback(() => {
      const c = chrome.get();
      const e = c.editing;
      return (
        (e && e.id !== rowId ? CELL_LOCKED : 0) |
        (c.saving ? CELL_SAVING : 0) |
        (e?.id === rowId && c.errorFields.has(field) ? CELL_ERROR : 0)
      );
    }, [chrome, rowId, field]),
  );
}

/** Same as `useCellState`, for a row's actions column. */
export const ROW_DRAFT = 1;
export const ROW_SAVING = 2;
export const ROW_HIGHLIGHT = 4;

export function useRowActionsState(rowId: string): number {
  const { chrome } = useGridUi();
  return useSyncExternalStore(
    chrome.subscribe,
    useCallback(() => {
      const c = chrome.get();
      return (
        (c.editing?.id === rowId ? ROW_DRAFT : 0) |
        (c.saving ? ROW_SAVING : 0) |
        (c.highlightSelection ? ROW_HIGHLIGHT : 0)
      );
    }, [chrome, rowId]),
  );
}

export function useDraftKind(rowId: string): DraftKind {
  const { chrome } = useGridUi();
  return useSyncExternalStore(
    chrome.subscribe,
    useCallback((): DraftKind => {
      const e = chrome.get().editing;
      if (e?.id !== rowId) return "";
      return e.isNew ? "new" : "edit";
    }, [chrome, rowId]),
  );
}

export const DRAFT_ROW_CLASS: Record<DraftKind, string> = {
  "": "",
  new: "row-new",
  edit: "row-edit",
};

/** Opaque: background + tint in two layers, to hide what scrolls underneath. */
export const DRAFT_PINNED_CELL_CLASS: Record<DraftKind, string> = {
  "": "",
  new: "pinned-cell-new",
  edit: "pinned-cell-edit",
};
