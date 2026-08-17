import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { EMPTY_LAYOUT, loadLayout, saveLayout, type GridLayout } from "./gridLayoutStorage";
import type { DataGridColumn } from "./types";

/** A resize fires on every `mousemove`; the widths are written once the hand stops. */
const SAVE_WIDTHS_MS = 400;

/**
 * The layout the user arranges by hand — column order, hidden columns, widths
 * and sort — kept in sync with `localStorage` (see `gridLayoutStorage`).
 *
 * Order, visibility and sort are React state: they change on a discrete action
 * and the grid has to repaint. Widths are *not*: they change on every
 * `mousemove` of a resize, so the table keeps owning that slice (it publishes
 * it as CSS variables without re-rendering the rows) and this hook only listens
 * in to persist it.
 */
export function useGridLayout(storageKey: string, columns: DataGridColumn[]) {
  const [layout, setLayout] = useState<GridLayout>(() => loadLayout(storageKey));
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Switching the grid to another stored layout without unmounting (the same
  // component rendering a different catalog): reading during render, the React
  // way, instead of an effect that would paint one frame with the old layout.
  const [appliedKey, setAppliedKey] = useState(storageKey);
  if (appliedKey !== storageKey) {
    const next = loadLayout(storageKey);
    layoutRef.current = next;
    setAppliedKey(storageKey);
    setLayout(next);
  }

  const fields = useMemo(() => columns.map((c) => c.field), [columns]);
  const knownFields = useMemo(() => new Set(fields), [fields]);

  const write = useCallback(
    (patch: Partial<GridLayout>) => {
      const next = { ...layoutRef.current, ...patch };
      layoutRef.current = next;
      setLayout(next);
      saveLayout(storageKey, next);
    },
    [storageKey],
  );

  /**
   * The user's order, cleaned against the columns that exist today: fields that
   * disappeared are dropped and new ones go at the end, so a change to the
   * catalog's definition never wipes what the user had arranged.
   */
  const orderedFields = useMemo(() => {
    if (layout.order.length === 0) return fields;
    const placed = new Set<string>();
    const result: string[] = [];
    for (const field of layout.order) {
      if (knownFields.has(field) && !placed.has(field)) {
        result.push(field);
        placed.add(field);
      }
    }
    for (const field of fields) if (!placed.has(field)) result.push(field);
    return result;
  }, [layout.order, fields, knownFields]);

  const hiddenByDefault = useMemo(
    () => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.field)),
    [columns],
  );

  const hiddenFields = useMemo(() => {
    const hidden = new Set(layout.hidden.filter((f) => knownFields.has(f)));
    const revealed = new Set(layout.revealed.filter((f) => knownFields.has(f)));
    for (const field of hiddenByDefault) {
      if (!revealed.has(field)) hidden.add(field);
    }
    return hidden;
  }, [layout.hidden, layout.revealed, knownFields, hiddenByDefault]);

  /** Every column in the user's order, hidden ones included — the list the
   * column menu shows. */
  const orderedColumns = useMemo(() => {
    const byField = new Map(columns.map((c) => [c.field, c]));
    return orderedFields.flatMap((field) => byField.get(field) ?? []);
  }, [columns, orderedFields]);

  /**
   * The columns as the user sees them: in their order and without the hidden
   * ones. This is what drives arrow navigation, Tab between editors, the
   * clipboard and the search — everything the grid does "over what is on
   * screen". Building a row still uses every column (see `emptyRow`).
   */
  const visibleColumns = useMemo(
    () => orderedColumns.filter((c) => !hiddenFields.has(c.field)),
    [orderedColumns, hiddenFields],
  );

  const columnVisibility = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const field of hiddenFields) state[field] = false;
    return state;
  }, [hiddenFields]);

  const sorting = useMemo<SortingState>(
    () => layout.sort.filter((s) => knownFields.has(s.id)),
    [layout.sort, knownFields],
  );

  const onSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      const current = layoutRef.current.sort.filter((s) => knownFields.has(s.id));
      const next = typeof updater === "function" ? updater(current) : updater;
      write({ sort: next.map((s) => ({ id: s.id, desc: s.desc })) });
    },
    [write, knownFields],
  );

  /** Moves `field` in front of `beforeField`, or to the end when it is `null`. */
  const moveColumn = useCallback(
    (field: string, beforeField: string | null) => {
      if (field === beforeField) return;
      const next = orderedFields.filter((f) => f !== field);
      const at = beforeField === null ? -1 : next.indexOf(beforeField);
      next.splice(at < 0 ? next.length : at, 0, field);
      write({ order: next });
    },
    [orderedFields, write],
  );

  const toggleColumn = useCallback(
    (field: string) => {
      const hidden = new Set(hiddenFields);
      const revealed = new Set(layoutRef.current.revealed.filter((f) => knownFields.has(f)));
      if (hidden.has(field)) {
        hidden.delete(field);
        if (hiddenByDefault.has(field)) revealed.add(field);
      } else if (hidden.size + 1 < knownFields.size) {
        hidden.add(field);
        revealed.delete(field);
      } else return;
      // Persist only the user's overrides: hidden fields that are not the
      // column's default, and default-hidden fields they chose to show.
      write({
        hidden: orderedFields.filter((f) => hidden.has(f) && !hiddenByDefault.has(f)),
        revealed: orderedFields.filter((f) => revealed.has(f)),
      });
    },
    [hiddenFields, knownFields, orderedFields, hiddenByDefault, write],
  );

  const resetLayout = useCallback(() => {
    layoutRef.current = EMPTY_LAYOUT;
    setLayout(EMPTY_LAYOUT);
    saveLayout(storageKey, EMPTY_LAYOUT);
  }, [storageKey]);

  /**
   * The widths as they were read on mount — fed to the table as `initialState`
   * so the first paint already has them and there is no jump.
   */
  const initialWidths = useRef(
    Object.fromEntries(Object.entries(layoutRef.current.widths).filter(([f]) => knownFields.has(f))),
  ).current;

  /** The widths of the layout in force, to push into the table when the grid
   * switches to another stored layout without unmounting. */
  const savedWidths = useMemo(
    () => Object.fromEntries(Object.entries(layout.widths).filter(([f]) => knownFields.has(f))),
    [layout.widths, knownFields],
  );

  // Persisting widths never goes through React state: it would re-render the
  // grid on every `mousemove` of a resize, which is exactly what the CSS
  // variables on the `<table>` are there to avoid.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveWidths = useCallback(
    (sizing: Record<string, number>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const widths: Record<string, number> = {};
        for (const [field, width] of Object.entries(sizing)) {
          if (knownFields.has(field)) widths[field] = width;
        }
        layoutRef.current = { ...layoutRef.current, widths };
        saveLayout(storageKey, layoutRef.current);
      }, SAVE_WIDTHS_MS);
    },
    [storageKey, knownFields],
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    orderedFields,
    orderedColumns,
    visibleColumns,
    hiddenFields,
    columnVisibility,
    sorting,
    onSortingChange,
    moveColumn,
    toggleColumn,
    resetLayout,
    initialWidths,
    savedWidths,
    saveWidths,
  };
}
