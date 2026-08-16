import { forwardRef, useDeferredValue, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTable, type FilterFn, type RowSelectionState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchInput } from "@/components/SearchInput";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { GridUiContext, type GridUi } from "./gridContext";
import { ROW_HEIGHT, widthVar } from "./gridLayout";
import { createSelectionStore, createStore, EMPTY_CHROME } from "./gridStore";
import { features } from "./gridTable";
import { displayValue, emptyRow, emptyValue, firstEditableField } from "./gridValues";
import { ColumnMenu } from "./header/ColumnMenu";
import { HeaderCell } from "./header/HeaderCell";
import { ResizeHandle } from "./header/ResizeHandle";
import { useColumnDrag } from "./header/useColumnDrag";
import { RowContextMenu } from "./rows/RowContextMenu";
import { SkeletonRows } from "./rows/SkeletonRows";
import { VirtualRow } from "./rows/VirtualRow";
import { useGridClipboard } from "./useGridClipboard";
import { useGridColumns } from "./useGridColumns";
import { useGridLayout } from "./useGridLayout";
import { useRowEditing } from "./useRowEditing";
import type { DataGridColumn, DataGridConfig, DataGridHandle, DataGridMeta, DataGridPersistProps, GridChrome, OpenCell, Row } from "./types";

export type { DataGridColumn, DataGridConfig, DataGridHandle, DataGridPersistProps, Row } from "./types";

/** Waits for the first echo, aligned with the OS's typical KeyboardDelay. */
const ARROW_REPEAT_DELAY_MS = 400;
/** ~25 Hz once the hold kicks in — not the `keydown.repeat` flood. */
const ARROW_REPEAT_MS = 40;
/** PageUp/Down jump a viewport; ~12 Hz so every page has time to paint. */
const PAGE_REPEAT_MS = 80;

type HoldKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "PageUp"
  | "PageDown";

function isHoldKey(key: string): key is HoldKey {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "PageUp" ||
    key === "PageDown"
  );
}

function isVerticalKey(key: HoldKey): boolean {
  return key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown";
}

export const DataGrid = forwardRef<
  DataGridHandle,
  {
    config: DataGridConfig;
    onSelectionChange?: (hasSelection: boolean) => void;
    /** Fires with the first selected row (or `null` when nothing is selected) — for views that need to know which one, not just whether there is one. */
    onRowSelected?: (row: Row | null) => void;
    /**
     * "multiple" (the default): checkboxes, optional selection — the catalogs' current behaviour.
     * "single": no checkboxes, selection on click, there is always one selected row (the first on load)
     * and the up/down arrows move the selection — meant for the master of a master/detail view.
     */
    selectionMode?: "multiple" | "single";
    /**
     * Marks the selected row with a colored indicator in the actions column —
     * meant for when a side panel opens (prices, data sheet) and the grid's
     * selected row, having lost width and focus, gets visually lost among the
     * rest.
     */
    highlightSelection?: boolean;
    /**
     * `_id` to reselect when the grid (re)mounts in "single" mode — the grid
     * loses its internal selection if it changes position in the tree, so
     * without this it would always fall back to the first row.
     */
    initialSelectedId?: string | null;
    /**
     * Search controlled by the parent (to move it into its own action bar, see
     * `SearchInput`) — when omitted, the grid handles its search internally and
     * draws its own row above the table.
     */
    search?: string;
    onSearchChange?: (search: string) => void;
    /**
     * Name under which this grid's layout is remembered — column widths, order,
     * hidden columns and sort (see `useGridLayout`). Defaults to `config.title`,
     * which is what tells one catalog from another; only worth setting when two
     * different grids share a title and each should keep its own layout.
     */
    layoutKey?: string;
    /**
     * Data on its way. The grid shows the shape of the table instead of the
     * "Sin registros." it would otherwise show while the rows have not arrived,
     * which reads as "there is nothing" rather than "wait a moment". On a
     * reload it keeps the rows on screen and only marks the wait at the top.
     */
    loading?: boolean;
    /**
     * Turns off the click-to-sort header handler for the whole grid — for a
     * grid where the row order already carries its own meaning (e.g. a manual
     * position with its own up/down controls), where sorting by column would
     * clash with it. Defaults to `true`.
     */
    enableSorting?: boolean;
  } & DataGridPersistProps
>(function DataGrid(
  {
    config,
    onSelectionChange,
    onRowSelected,
    selectionMode = "multiple",
    highlightSelection = false,
    initialSelectedId = null,
    initialRows,
    onAddRow,
    onDeleteRows,
    onEditRow,
    onSaveError,
    onSaveSuccess,
    onCancelEdit,
    search: controlledSearch,
    onSearchChange,
    layoutKey,
    loading = false,
    enableSorting = true,
  },
  ref,
) {
  const selectionStore = useRef(createSelectionStore()).current;
  const openCellStore = useRef(createStore<OpenCell | null>(null)).current;
  const chromeStore = useRef(createStore<GridChrome>(EMPTY_CHROME)).current;
  const metaRef = useRef<DataGridMeta>(null as unknown as DataGridMeta);
  const visibleColumnsRef = useRef<DataGridColumn[]>(config.columns);
  const uiStore = useRef<GridUi>({
    selection: selectionStore,
    openCell: openCellStore,
    chrome: chromeStore,
    meta: metaRef,
    columns: visibleColumnsRef,
  }).current;

  const {
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
  } = useGridLayout(layoutKey ?? config.title, config.columns);
  visibleColumnsRef.current = visibleColumns;

  const {
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
  } = useRowEditing({
    columns: config.columns,
    initialRows,
    selection: selectionStore,
    openCell: openCellStore,
    onAddRow,
    onEditRow,
    onSaveError,
    onSaveSuccess,
    onCancelEdit,
  });

  const [pendingDelete, setPendingDelete] = useState<Row[] | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [internalSearch, setInternalSearch] = useState("");
  const isSearchControlled = controlledSearch !== undefined;
  const search = isSearchControlled ? controlledSearch : internalSearch;
  const setSearch = isSearchControlled ? onSearchChange! : setInternalSearch;
  // The input responds to every keystroke; the re-filtering (which rebuilds the
  // row model and repaints the body) happens in a low-priority render that
  // React can interrupt if the user keeps typing.
  const deferredSearch = useDeferredValue(search);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Real height of the (sticky) `<thead>` — so rows reserve that space when
  // scrolling towards them (`scroll-margin-top`) and are not covered by the
  // header on reaching the first row.
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerHeightRef = useRef(0);
  headerHeightRef.current = headerHeight;

  useLayoutEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // How many skeleton rows fill the viewport. Only measured while loading:
  // observing the container the rest of the time would re-render the grid on
  // every frame of dragging a panel divider.
  const [bodyHeight, setBodyHeight] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!loading || !el) return;
    const measure = () => setBodyHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  const meta: DataGridMeta = {
    editing,
    highlightSelection,
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
    chromeStore.set({ editing, saving, errorFields, saveError, highlightSelection });
  }, [editing, saving, errorFields, saveError, highlightSelection]);

  // Compares against the whole row's already-formatted text (the same text the
  // user sees: date through `formatearFecha`, "Sí"/"No", suffix applied), not
  // against the raw values — so searching for something visible always finds it.
  // The draft row always passes the filter: otherwise "Add" with an active
  // search hides the empty row and it looks like nothing happened.
  //
  // The text is cached per row object in a `WeakMap`: building it is O(columns)
  // with `formatearFecha` and string concatenation, and the filter re-runs on
  // every keystroke in the search box *and* on every cell commit (the identity
  // of `rows` changes). Editing a cell makes only that row a new object, so
  // only that one is recomputed; the rest comes from the cache.
  //
  // It only looks at the columns on screen: searching for something in a column
  // the user hid would find rows with nothing visible to explain the match.
  const rowTextCache = useMemo(() => new WeakMap<Row, string>(), [visibleColumns]);
  const globalFilter = useMemo<FilterFn<typeof features, Row>>(() => {
    let lastFilter: unknown;
    let lastFilterLower = "";
    return (row, _columnId, filterValue) => {
      const draft = editingRef.current;
      if (draft && row.original._id === draft.id) return true;
      if (!filterValue) return true;
      if (filterValue !== lastFilter) {
        lastFilter = filterValue;
        lastFilterLower = String(filterValue).toLowerCase();
      }
      let text = rowTextCache.get(row.original);
      if (text === undefined) {
        text = visibleColumns
          .map((c) => displayValue(row.original, c))
          .join(" ")
          .toLowerCase();
        rowTextCache.set(row.original, text);
      }
      return text.includes(lastFilterLower);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, rowTextCache]);

  const {
    columnByField,
    columns,
    pinnedWidth,
    cellStyles,
    cellClasses,
    pinnedColumns,
    thClasses,
    thButtonClasses,
  } = useGridColumns(config.columns, selectionMode);
  const pinnedWidthRef = useRef(0);
  pinnedWidthRef.current = pinnedWidth;

  // The `__` columns stay pinned to the left edge, always ahead of the user's
  // order: a partial `columnOrder` would push every unlisted column to the end.
  const columnOrder = useMemo(
    () => [...columns.map((c) => String(c.id)).filter((id) => id.startsWith("__")), ...orderedFields],
    [columns, orderedFields],
  );

  // What each row paints. Derived here, not from `table.getVisibleLeafColumns()`,
  // so its identity only changes when the layout does: it is a prop of a
  // memoized `VirtualRow`, and a fresh array on every render would defeat it.
  const leafColumnIds = useMemo(
    () => columnOrder.filter((id) => !hiddenFields.has(id)),
    [columnOrder, hiddenFields],
  );

  const table = useTable(
    {
      features,
      data: rows,
      columns,
      getRowId: (f) => f._id,
      state: { rowSelection, globalFilter: deferredSearch, columnOrder, columnVisibility, sorting },
      // Widths are the one slice the table keeps for itself: they change on
      // every `mousemove` of a resize, and routing that through React state
      // would repaint the grid on each one. They come in as `initialState` and
      // leave through the subscription below (see `saveWidths`).
      initialState: { columnSizing: initialWidths },
      onRowSelectionChange: setRowSelection,
      onGlobalFilterChange: (updater) => setSearch(typeof updater === "function" ? updater(search) : updater),
      onSortingChange,
      enableMultiRowSelection: selectionMode === "multiple",
      globalFilterFn: globalFilter,
      getColumnCanGlobalFilter: (column) => !String(column.id).startsWith("__"),
      columnResizeMode: "onChange",
      enableColumnResizing: true,
      enableSorting,
      meta,
    },
    (state) => ({ rowSelection: state.rowSelection, globalFilter: state.globalFilter }),
  );

  // Persists the widths without going through React: the store notifies on
  // every change and `saveWidths` waits for the hand to stop.
  const tableRef = useRef(table);
  tableRef.current = table;
  useEffect(() => {
    let last = tableRef.current.store.state.columnSizing;
    const sub = tableRef.current.store.subscribe((state) => {
      if (state.columnSizing === last) return;
      last = state.columnSizing;
      saveWidths(last);
    });
    return () => sub.unsubscribe();
  }, [saveWidths]);

  // Restores the stored widths when the grid switches to another layout
  // without unmounting — on the first mount `initialState` already did it.
  const appliedLayoutRef = useRef(layoutKey ?? config.title);
  useLayoutEffect(() => {
    const key = layoutKey ?? config.title;
    if (appliedLayoutRef.current === key) return;
    appliedLayoutRef.current = key;
    tableRef.current.setColumnSizing(savedWidths);
  }, [layoutKey, config.title, savedWidths]);

  const resetGridLayout = () => {
    resetLayout();
    // Widths do not live in the layout's React state (see above), so clearing
    // the stored ones is not enough — the table has to drop its own.
    tableRef.current.resetColumnSizing(true);
  };

  // Hiding the column the cursor was in would leave the selection pointing at
  // something that is no longer on screen.
  useEffect(() => {
    const sel = selectionStore.get();
    if (!sel || visibleColumns.some((c) => c.field === sel.field)) return;
    const field = firstEditableField(visibleColumns) ?? visibleColumns[0]?.field;
    selectionStore.set(field ? { rowId: sel.rowId, field } : null);
  }, [visibleColumns, selectionStore]);

  const visibleFields = useMemo(() => visibleColumns.map((c) => c.field), [visibleColumns]);
  const columnDrag = useColumnDrag({ fields: visibleFields, onMove: moveColumn });

  const modelRows = table.getRowModel().rows;

  // With a column sorted, editing a cell of that column would slide the row out
  // from under the hand the moment the value changes — the record looks lost.
  // So while a row is in draft the order stays put, and it is on ✓ or ✗ that the
  // row takes its new place.
  //
  // The snapshot has to be taken *before* the edit: `commitCellChange` applies
  // the value and opens the draft in the same batch, so by the time the grid
  // re-renders the row has already moved. It is refreshed on every model of a
  // grid at rest, and simply stops being refreshed while the draft is open.
  const orderRef = useRef<{ source: unknown; index: Map<string, number> } | null>(null);
  const sorted = sorting.length > 0;
  if (!editing && sorted && orderRef.current?.source !== modelRows) {
    orderRef.current = { source: modelRows, index: new Map(modelRows.map((r, i) => [r.id, i])) };
  }
  const frozenOrder = editing && sorted ? orderRef.current?.index : undefined;
  const visibleRows = frozenOrder
    ? // A brand new row is not in the snapshot: it stays at the end, which is
      // where an unsorted grid puts it too, instead of jumping around as the
      // first fields get filled in.
      [...modelRows].sort(
        (a, b) => (frozenOrder.get(a.id) ?? Infinity) - (frozenOrder.get(b.id) ?? Infinity),
      )
    : modelRows;
  const visibleRowsRef = useRef(visibleRows);
  visibleRowsRef.current = visibleRows;

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // ~216px of cushion above and below. Every mounted row costs store
    // subscriptions, so with rows already memoized it pays to mount fewer.
    overscan: 8,
    getItemKey: (index) => visibleRows[index]?.id ?? index,
    scrollPaddingStart: headerHeight,
  });
  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;
  const scrollAlignRef = useRef<"start" | "end" | "nearest">("nearest");

  const alignVertical = (rowId: string) => {
    const row = rowRefs.current.get(rowId);
    const box = scrollRef.current;
    if (!row || !box) return false;
    const f = row.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const margin = headerHeightRef.current;
    if (f.bottom > b.bottom) box.scrollTop += f.bottom - b.bottom;
    else if (f.top < b.top + margin) box.scrollTop -= b.top + margin - f.top;
    return true;
  };

  // If the row is not mounted, `scrollToIndex` with start/end (not `auto`) plus
  // the virtualizer's flushSync leaves the DOM ready; `alignVertical` corrects
  // for the sticky thead in the same turn, before the paint.
  const bringRowIntoView = (rowId: string) => {
    if (alignVertical(rowId)) return true;
    const idx = visibleRowsRef.current.findIndex((r) => r.original._id === rowId);
    if (idx < 0) return false;
    let align = scrollAlignRef.current;
    if (align === "nearest") {
      const top = scrollRef.current?.scrollTop ?? 0;
      align = idx * ROW_HEIGHT < top ? "start" : "end";
    }
    rowVirtualizerRef.current.scrollToIndex(idx, { align });
    return alignVertical(rowId);
  };

  const focusRow = (_index: number, rowId: string) => {
    const node = rowRefs.current.get(rowId);
    if (node) node.focus({ preventScroll: true });
    else scrollRef.current?.focus({ preventScroll: true });
  };

  const rowSelectionRef = useRef(rowSelection);
  rowSelectionRef.current = rowSelection;
  const moveByKey = (key: HoldKey, opts: { toEdge: boolean; focus: boolean }) => {
    // The arrows walk the columns as they are on screen, in the user's order
    // and skipping the hidden ones.
    const cols = visibleColumnsRef.current;
    const visible = visibleRowsRef.current;
    const sel = selectionStore.get();

    if (key === "ArrowUp" || key === "ArrowDown") {
      if (editingRef.current) return;
      const currentRowId = sel?.rowId ?? Object.keys(rowSelectionRef.current)[0];
      const currentIdx = visible.findIndex((r) => r.original._id === currentRowId);
      const target = opts.toEdge
        ? key === "ArrowDown"
          ? visible.length - 1
          : 0
        : currentIdx + (key === "ArrowDown" ? 1 : -1);
      const next = visible[target];
      if (!next) return;
      const field = sel?.field ?? firstEditableField(cols);
      if (field) selectionStore.set({ rowId: next.original._id, field });
      if (opts.focus) focusRow(target, next.original._id);
      return;
    }

    if (key === "PageUp" || key === "PageDown") {
      if (editingRef.current) return;
      const viewportHeight = (scrollRef.current?.clientHeight ?? 400) - headerHeightRef.current;
      const perPage = Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT) - 1);
      const currentRowId = sel?.rowId ?? Object.keys(rowSelectionRef.current)[0];
      const currentIdx = Math.max(0, visible.findIndex((r) => r.original._id === currentRowId));
      const target = Math.min(
        visible.length - 1,
        Math.max(0, currentIdx + (key === "PageDown" ? perPage : -perPage)),
      );
      const next = visible[target];
      if (!next) return;
      const field = sel?.field ?? firstEditableField(cols);
      scrollAlignRef.current = key === "PageDown" ? "end" : "start";
      if (field) selectionStore.set({ rowId: next.original._id, field });
      scrollAlignRef.current = "nearest";
      if (opts.focus) focusRow(target, next.original._id);
      return;
    }

    if (!sel) return;
    if (opts.toEdge) {
      const field = key === "ArrowLeft" ? cols[0]?.field : cols[cols.length - 1]?.field;
      if (field) selectionStore.set({ rowId: sel.rowId, field });
      return;
    }
    const currentIdx = cols.findIndex((c) => c.field === sel.field);
    const nextCol = cols[currentIdx + (key === "ArrowRight" ? 1 : -1)];
    if (!nextCol) return;
    selectionStore.set({ rowId: sel.rowId, field: nextCol.field });
  };

  const holdRef = useRef({
    held: new Set<HoldKey>(),
    active: null as HoldKey | null,
    raf: 0,
    startedAt: 0,
    lastMove: 0,
    parked: false,
  });
  const moveByKeyRef = useRef(moveByKey);
  moveByKeyRef.current = moveByKey;
  const holdLoopRef = useRef<(t: number) => void>(() => {});

  const stopHold = () => {
    const h = holdRef.current;
    h.held.clear();
    h.active = null;
    h.parked = false;
    if (h.raf) {
      cancelAnimationFrame(h.raf);
      h.raf = 0;
    }
  };

  holdLoopRef.current = (t: number) => {
    const h = holdRef.current;
    if (!h.active) {
      h.raf = 0;
      return;
    }
    h.raf = requestAnimationFrame((now) => holdLoopRef.current(now));
    if (openCellStore.get()) return;
    if (isVerticalKey(h.active) && editingRef.current) return;
    if (t - h.startedAt < ARROW_REPEAT_DELAY_MS) return;
    // Focus on the originating row would be lost once it is virtualized; the
    // container (tabIndex=0) does survive the whole hold.
    if (!h.parked) {
      h.parked = true;
      scrollRef.current?.focus({ preventScroll: true });
    }
    const interval = h.active === "PageUp" || h.active === "PageDown" ? PAGE_REPEAT_MS : ARROW_REPEAT_MS;
    if (t - h.lastMove < interval) return;
    h.lastMove = t;
    moveByKeyRef.current(h.active, { toEdge: false, focus: false });
  };

  const startHold = (key: HoldKey) => {
    const h = holdRef.current;
    h.held.add(key);
    h.active = key;
    h.startedAt = performance.now();
    h.lastMove = h.startedAt;
    if (!h.raf) {
      h.parked = false;
      h.raf = requestAnimationFrame((now) => holdLoopRef.current(now));
    }
  };

  const onHoldKeyUp = (key: string) => {
    if (!isHoldKey(key)) return;
    const h = holdRef.current;
    if (!h.held.has(key)) return;
    h.held.delete(key);
    if (h.active === key) {
      const rest = [...h.held];
      h.active = rest[rest.length - 1] ?? null;
      if (h.active) {
        h.startedAt = performance.now();
        h.lastMove = h.startedAt;
      }
    }
    if (h.active) return;
    h.parked = false;
    if (h.raf) {
      cancelAnimationFrame(h.raf);
      h.raf = 0;
    }
    const sel = selectionStore.get();
    if (!sel) return;
    const node = rowRefs.current.get(sel.rowId);
    if (node && document.activeElement === node) return;
    const idx = visibleRowsRef.current.findIndex((r) => r.original._id === sel.rowId);
    if (idx >= 0) focusRow(idx, sel.rowId);
  };

  const onHoldKeyUpRef = useRef(onHoldKeyUp);
  onHoldKeyUpRef.current = onHoldKeyUp;
  const stopHoldRef = useRef(stopHold);
  stopHoldRef.current = stopHold;

  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => onHoldKeyUpRef.current(e.key);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!holdRef.current.active || !isHoldKey(e.key)) return;
      e.preventDefault();
    };
    const onBlur = () => stopHoldRef.current();
    const onFocusIn = (e: FocusEvent) => {
      const box = scrollRef.current;
      if (!box || !holdRef.current.active) return;
      if (e.target instanceof Node && box.contains(e.target)) return;
      stopHoldRef.current();
    };
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("focusin", onFocusIn);
      stopHoldRef.current();
    };
  }, []);

  // Keeps exactly one selected row at all times in "single" mode: on mount it
  // restores `initialSelectedId` or falls back to the first; if the selection
  // empties later (e.g. the selected row was deleted), it falls back to the
  // first again. A single effect avoids the race of two effects reading the
  // same (not yet updated) `rowSelection` in the same commit.
  useEffect(() => {
    if (selectionMode !== "single") return;
    if (Object.keys(rowSelection).length > 0) return;
    if (visibleRows.length === 0) return;
    const target = initialSelectedId ? visibleRows.find((r) => r.original._id === initialSelectedId) : undefined;
    const row = target ?? visibleRows[0];
    row.toggleSelected(true);
    const sel = selectionStore.get();
    const field =
      (sel && visibleColumns.some((c) => c.field === sel.field)
        ? sel.field
        : firstEditableField(visibleColumns));
    if (field) selectionStore.set({ rowId: row.original._id, field });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode, rows, rowSelection, initialSelectedId]);

  const onRowSelectedRef = useRef(onRowSelected);
  onRowSelectedRef.current = onRowSelected;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    if (selectionMode !== "single") return;
    let t = 0;
    let lastNotified: string | null = null;
    const schedule = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const rowId = selectionStore.get()?.rowId;
        if (!rowId) return;
        setRowSelection((prev) => (prev[rowId] ? prev : { [rowId]: true }));
        if (lastNotified === rowId) return;
        lastNotified = rowId;
        const row = rowsRef.current.find((f) => f._id === rowId) ?? null;
        onRowSelectedRef.current?.(row);
        onSelectionChangeRef.current?.(true);
      }, 200);
    };
    schedule();
    const unsub = selectionStore.subscribe(schedule);
    return () => {
      window.clearTimeout(t);
      unsub();
    };
  }, [selectionMode]);

  useEffect(() => {
    if (selectionMode === "single") return;
    onSelectionChange?.(Object.keys(rowSelection).length > 0);
    const row = table.getSelectedRowModel().rows[0]?.original ?? null;
    const t = window.setTimeout(() => onRowSelected?.(row), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection, selectionMode]);

  // With many records, the new row or the one being edited can end up outside
  // the visible area — scrolls to it.
  //
  // Also when the draft closes: the order was frozen while it was open (see
  // `frozenOrder`), so accepting it is what moves the row to its place under the
  // sort. Without following it, the viewport stays where it was and the record
  // is just as lost, only later.
  const lastDraftRef = useRef<string | null>(null);
  useEffect(() => {
    const closed = editing ? null : lastDraftRef.current;
    lastDraftRef.current = editing?.id ?? null;
    const rowId = editing?.id ?? closed;
    if (!rowId || (closed && !sorted)) return;
    const idx = visibleRowsRef.current.findIndex((r) => r.original._id === rowId);
    if (idx >= 0) rowVirtualizerRef.current.scrollToIndex(idx, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, sorted]);

  // Brings the row into the viewport (virtualizer) and, once mounted, the column.
  useEffect(() => {
    const alignHorizontal = (rowId: string, field: string) => {
      // Queried inside the row instead of keeping a `Map` of refs per cell:
      // that Map cost a ref detach+attach per cell on every render, for a read
      // that only happens when the selection moves.
      const cell = rowRefs.current
        .get(rowId)
        ?.querySelector<HTMLTableCellElement>(`td[data-column-id="${CSS.escape(field)}"]`);
      const box = scrollRef.current;
      if (!cell || !box) return false;
      const c = cell.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const margin = pinnedWidthRef.current;
      if (c.right > b.right) box.scrollLeft += c.right - b.right;
      else if (c.left < b.left + margin) box.scrollLeft -= b.left + margin - c.left;
      return true;
    };
    const apply = () => {
      const sel = selectionStore.get();
      if (!sel) return;
      const vertical = bringRowIntoView(sel.rowId);
      const horizontal = alignHorizontal(sel.rowId, sel.field);
      if (vertical && horizontal) return;
      requestAnimationFrame(() => {
        if (selectionStore.get() !== sel) return;
        bringRowIntoView(sel.rowId);
        alignHorizontal(sel.rowId, sel.field);
      });
    };
    apply();
    return selectionStore.subscribe(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a cell edit is committed (Enter/blur) or cancelled (Escape) without
  // jumping to another one (`moveTo` handles that with Tab), the editor
  // unmounts and focus is lost entirely — with nothing focused inside the grid,
  // the arrows stop reaching `onContainerKeyDown`. Focus is returned to the row.
  useEffect(() => {
    const onClose = () => {
      if (openCellStore.get()) return;
      const rowId = selectionStore.get()?.rowId;
      if (!rowId) return;
      const node = rowRefs.current.get(rowId);
      if (node) node.focus({ preventScroll: true });
      else scrollRef.current?.focus({ preventScroll: true });
    };
    return openCellStore.subscribe(onClose);
  }, []);

  const { copy: onMenuCopy, cut: onMenuCut, paste: onMenuPaste, onCopy, onCut, onPaste } = useGridClipboard({
    // Copy and paste follow what is on screen: the TSV carries the visible
    // columns, in their order, so a round trip to a spreadsheet lines up.
    columns: visibleColumns,
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
    getSelectedRows: () => table.getSelectedRowModel().rows.map((r) => r.original),
    commitCellChange,
    scrollRef,
  });

  const onContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const selectedCell = selectionStore.get();
    const openCellNow = openCellStore.get();
    const target = e.target as HTMLElement;
    const inEditor = target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA";

    if (inEditor) {
      // Moving the text caret with ←/→ inside the editor can make the browser
      // scroll the container to "keep the caret visible" — the cell is already
      // visible (that is why it is being edited), so any incidental scroll that
      // triggers is reverted.
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && scrollRef.current) {
        const el = scrollRef.current;
        const { scrollLeft, scrollTop } = el;
        requestAnimationFrame(() => {
          el.scrollLeft = scrollLeft;
          el.scrollTop = scrollTop;
        });
      }
      return;
    }

    if (!isHoldKey(e.key) && holdRef.current.active) stopHold();

    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S") && editing) {
      e.preventDefault();
      void commitEdit();
      return;
    }

    // Escape with the editor closed cancels the row's draft (same as ✗). With
    // the editor open, CellEditor already consumed Escape to discard just the cell.
    if (e.key === "Escape" && editing && !openCellNow) {
      e.preventDefault();
      cancelEdit();
      return;
    }

    if (isHoldKey(e.key)) {
      // The first keydown moves right away; the OS echoes (`repeat`) are
      // ignored — the rAF loop moves at its own pace and keyup cuts it off
      // with no residual queue.
      if (isVerticalKey(e.key) && editing) {
        e.preventDefault();
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !selectedCell) return;
      const toEdge = (e.ctrlKey || e.metaKey) && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight");
      e.preventDefault();
      if (e.repeat) return;
      moveByKey(e.key, { toEdge, focus: isVerticalKey(e.key) });
      if (!toEdge) startHold(e.key);
      return;
    }

    if ((e.key === "Home" || e.key === "End") && (selectedCell || Object.keys(rowSelection).length > 0)) {
      e.preventDefault();
      const toEdge = e.ctrlKey || e.metaKey;
      const cols = visibleColumnsRef.current;
      if (toEdge && !editing) {
        const row = e.key === "Home" ? visibleRows[0] : visibleRows[visibleRows.length - 1];
        const field = e.key === "Home" ? cols[0]?.field : cols[cols.length - 1]?.field;
        if (row && field) {
          scrollAlignRef.current = e.key === "Home" ? "start" : "end";
          selectionStore.set({ rowId: row.original._id, field });
          scrollAlignRef.current = "nearest";
          focusRow(e.key === "Home" ? 0 : visibleRows.length - 1, row.original._id);
        }
        return;
      }
      const field = e.key === "Home" ? cols[0]?.field : cols[cols.length - 1]?.field;
      const rowId = editing?.id ?? selectedCell?.rowId ?? Object.keys(rowSelection)[0];
      if (field && rowId) selectionStore.set({ rowId, field });
      return;
    }

    if (!openCellNow && selectedCell && e.key === "F2") {
      const column = columnByField.get(selectedCell.field);
      if (column && !column.readOnly) {
        e.preventDefault();
        if (column.boolean) {
          const row = rowsRef.current.find((f) => f._id === selectedCell.rowId);
          if (row) commitCellChange(selectedCell.rowId, column.field, !row[column.field]);
        } else {
          openCellAt(selectedCell.rowId, selectedCell.field);
        }
      }
      return;
    }

    if (!openCellNow && selectedCell && e.key === " ") {
      const column = columnByField.get(selectedCell.field);
      if (column && column.boolean && !column.readOnly) {
        e.preventDefault();
        const row = rowsRef.current.find((f) => f._id === selectedCell.rowId);
        if (row) commitCellChange(selectedCell.rowId, column.field, !row[column.field]);
        return;
      }
    }

    // Delete/Backspace clear the selected cell and enter the row's draft — they
    // do not persist until ✓. Just like Excel, without opening the editor.
    if (!openCellNow && selectedCell && (e.key === "Delete" || e.key === "Backspace")) {
      const column = columnByField.get(selectedCell.field);
      if (column && !column.readOnly) {
        e.preventDefault();
        commitCellChange(selectedCell.rowId, column.field, emptyValue(column));
      }
      return;
    }

    // Typing straight over a selected cell (without a double click) opens the
    // editor replacing the value — just like Excel. Does not apply to read-only
    // columns nor to those edited with a `<select>` (boolean/options), where
    // "type to replace" makes no sense.
    if (!openCellNow && selectedCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const column = columnByField.get(selectedCell.field);
      if (column && !column.readOnly && !column.boolean) {
        e.preventDefault();
        openCellAt(selectedCell.rowId, selectedCell.field, e.key);
      }
    }
  };

  // Named so the right-click menu can reach the same two actions the parent's
  // action bar does, instead of a second copy of them.
  const handle: DataGridHandle = {
    addRow: () => {
      if (editingRef.current) return;
      const newRow = emptyRow(config.columns);
      const nextRows = [...rowsRef.current, newRow];
      rowsRef.current = nextRows;
      setRows(nextRows);
      const nextEditing = { id: newRow._id, isNew: true, original: newRow };
      editingRef.current = nextEditing;
      setEditing(nextEditing);
      setRowSelection({ [newRow._id]: true });
      const field = firstEditableField(visibleColumnsRef.current);
      if (field) {
        selectionStore.set({ rowId: newRow._id, field });
        openCellStore.set({ rowId: newRow._id, field });
      }
    },
    deleteSelectedRows: () => {
      if (selectionMode === "single") {
        const id = selectionStore.get()?.rowId;
        const row = id ? rowsRef.current.find((f) => f._id === id) : undefined;
        if (row) setPendingDelete([row]);
        return;
      }
      const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
      if (selectedRows.length === 0) return;
      setPendingDelete(selectedRows);
    },
  };
  useImperativeHandle(ref, () => handle);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const ids = pendingDelete.map((f) => f._id);
    try {
      if (isControlled) {
        await onDeleteRows?.(ids);
      } else {
        const idsSet = new Set(ids);
        setRows((prev) => prev.filter((f) => !idsSet.has(f._id)));
      }
      setPendingDelete(null);
      setRowSelection({});
      onSelectionChange?.(false);
      onRowSelected?.(null);
    } catch (e) {
      setPendingDelete(null);
      const message = e instanceof Error ? e.message : String(e);
      if (onSaveError) onSaveError(message);
      else toast({ description: message, variant: "destructive" });
    }
  };

  const firstTextField = config.columns.find((c) => !c.numeric)?.field ?? config.columns[0]?.field;

  // A single delegated handler on the `<tbody>` instead of one `onClick` per
  // row: that way `VirtualRow` never gets a fresh closure on each render and
  // can be memoized. The row is resolved through `data-index`.
  const onBodyClick = (e: React.MouseEvent<HTMLTableSectionElement>) => {
    const target = e.target as HTMLElement;
    const tr = target.closest<HTMLTableRowElement>("tr[data-index]");
    if (!tr) return;
    const row = visibleRowsRef.current[Number(tr.dataset.index)];
    if (!row) return;
    const rowId = row.original._id;
    if (editingRef.current && editingRef.current.id !== rowId) return;
    tr.focus();
    const columnId = target.closest("td")?.dataset.columnId;
    if (columnId && !columnId.startsWith("__")) return;
    copyWholeRowRef.current = columnId === "__index";
    const field = firstEditableField(visibleColumnsRef.current);
    if (field) selectionStore.set({ rowId, field });
  };

  // Right-click puts the cursor where it was clicked before the menu opens —
  // otherwise Copy would act on whatever was selected beforehand, somewhere
  // else entirely. On a `__` column it takes the whole row, same as a left
  // click does there.
  const onBodyContextMenu = (e: React.MouseEvent<HTMLTableSectionElement>) => {
    const target = e.target as HTMLElement;
    const tr = target.closest<HTMLTableRowElement>("tr[data-index]");
    if (!tr) return;
    const row = visibleRowsRef.current[Number(tr.dataset.index)];
    if (!row) return;
    const rowId = row.original._id;
    if (editingRef.current && editingRef.current.id !== rowId) return;
    tr.focus();
    const columnId = target.closest("td")?.dataset.columnId;
    const onData = columnId !== undefined && !columnId.startsWith("__");
    copyWholeRowRef.current = !onData;
    const field = onData ? columnId : firstEditableField(visibleColumnsRef.current);
    if (field) selectionStore.set({ rowId, field });
    // Right-clicking outside the checked rows moves the selection onto that
    // one, the way a file manager does, so Delete acts on what is under the
    // pointer. Right-clicking inside them leaves the whole set alone.
    if (selectionMode === "multiple" && !row.getIsSelected()) setRowSelection({ [rowId]: true });
  };

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end + 25
      : 0;

  // Only stands in for the body when there is nothing to show yet. A reload
  // with rows already on screen keeps them and just marks the wait at the top:
  // blanking data the user is reading is worse than a stale second.
  const showSkeleton = loading && visibleRows.length === 0;
  const skeletonCount = Math.max(3, Math.ceil((bodyHeight - headerHeight) / ROW_HEIGHT));

  return (
    <GridUiContext.Provider value={uiStore}>
    <div className="flex h-full flex-col">
      {!isSearchControlled && (
        <div className="border-b border-border px-2 py-1.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            className="rounded-none border-none px-0"
            inputClassName="w-full"
          />
        </div>
      )}
      {/* A reload over rows that are already on screen: they stay, and the wait
          shows as a thread of light crossing the top edge. */}
      {loading && !showSkeleton && (
        <div data-t="grid-loading" aria-hidden className="h-[3px] shrink-0 overflow-hidden bg-primary/25">
          <div className="barra-progreso-indeterminada h-full w-1/3 rounded-full bg-primary" />
        </div>
      )}
      <RowContextMenu
        editing={!!editing}
        canAdd={!isControlled || !!onAddRow}
        canDelete={
          selectionMode === "single"
            ? selectionStore.get() !== null
            : Object.keys(rowSelection).length > 0
        }
        onCopy={() => void onMenuCopy()}
        onCut={() => void onMenuCut()}
        onPaste={() => void onMenuPaste()}
        onAddRow={() => handle.addRow()}
        onDeleteRows={() => handle.deleteSelectedRows()}
      >
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onContainerKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        <table.Subscribe selector={(state) => state.columnSizing}>
          {(_columnSizing) => (
            <table.Subscribe selector={(state) => state.columnResizing?.isResizingColumn ?? false}>
              {() => {
            // Live widths are published as CSS variables on the `<table>`:
            // during a resize (`columnResizeMode: "onChange"`) this is the only
            // thing that changes, and the rows —memoized— do not re-render.
            const tableStyle: Record<string, string | number> = {
              minWidth: table.getTotalSize(),
              width: "100%",
            };
            for (const col of table.getAllLeafColumns()) {
              tableStyle[widthVar(col.id)] = `${col.getSize()}px`;
            }
            return (
            <table
              // `border-separate` (con `border-spacing: 0`) y no
              // `border-collapse`: con los bordes colapsados, la línea de 1px
              // la pinta la tabla y no la celda, así que no viaja con el
              // `<thead>` pegado — y por esa rendija se alcanzaba a ver el
              // texto de las filas que pasan por debajo. Cada celda dibuja solo
              // su borde derecho e inferior, de modo que sin colapsar tampoco
              // se duplican entre vecinas, y las medidas no cambian: los bordes
              // van dentro de la caja de la celda (ver ROW_HEIGHT).
              className="w-full border-separate border-spacing-0 border-l border-t border-border text-sm"
              style={tableStyle as React.CSSProperties}
            >
              <thead ref={theadRef} className="sticky top-0 z-20 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="flex">
                    {headerGroup.headers.map((header) => {
                      const columnId = header.column.id;
                      const isData = !columnId.startsWith("__");
                      const sorted = header.column.getIsSorted();
                      return (
                        <HeaderCell
                          key={header.id}
                          columnId={columnId}
                          data-column-id={columnId}
                          style={cellStyles.get(columnId)}
                          className={cn(thClasses.get(columnId), isData && columnDrag.cellClass(columnId))}
                          {...(isData && !editing ? columnDrag.cellProps(columnId) : null)}
                        >
                          {isData ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={!!editing}
                              // Dragging the header reorders the column; the
                              // handle is this button and not the `<th>`, so
                              // grabbing the edge still resizes.
                              {...(editing ? null : columnDrag.handleProps(columnId))}
                              onClick={editing ? undefined : header.column.getToggleSortingHandler()}
                              className={thButtonClasses.get(columnId)}
                            >
                              <table.FlexRender header={header} />
                              {sorted === "asc" && <ArrowUp size={11} />}
                              {sorted === "desc" && <ArrowDown size={11} />}
                            </button>
                          ) : columnId === "__index" ? (
                            <ColumnMenu
                              columns={orderedColumns}
                              hiddenFields={hiddenFields}
                              onToggle={toggleColumn}
                              onReset={resetGridLayout}
                            />
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                          {header.column.getCanResize() && (
                            <ResizeHandle
                              resizing={header.column.getIsResizing()}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              containerRef={scrollRef}
                            />
                          )}
                        </HeaderCell>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody onClick={onBodyClick} onContextMenu={onBodyContextMenu}>
                {showSkeleton ? (
                  <SkeletonRows
                    count={skeletonCount}
                    columnIds={leafColumnIds}
                    cellStyles={cellStyles}
                    cellClasses={cellClasses}
                  />
                ) : visibleRows.length === 0 ? (
                  <tr className="flex" style={{ width: "100%" }}>
                    <td className="flex-1 px-2 py-4 text-center text-xs text-muted-foreground">
                      Sin registros.
                    </td>
                  </tr>
                ) : (
                  <>
                    {paddingTop > 0 && (
                      <tr aria-hidden className="flex" style={{ height: paddingTop }}>
                        <td className="p-0" style={{ height: paddingTop }} />
                      </tr>
                    )}
                    {virtualItems.map((item) => {
                      const row = visibleRows[item.index];
                      if (!row) return null;
                      return (
                        <VirtualRow
                          key={row.id}
                          row={row}
                          columnIds={leafColumnIds}
                          itemIndex={item.index}
                          rowRefs={rowRefs}
                          headerHeight={headerHeight}
                          cellStyles={cellStyles}
                          cellClasses={cellClasses}
                          pinnedColumns={pinnedColumns}
                          selected={row.getIsSelected()}
                          selectionMode={selectionMode}
                        />
                      );
                    })}
                    {paddingBottom > 0 && (
                      <tr aria-hidden className="flex" style={{ height: paddingBottom }}>
                        <td className="p-0" style={{ height: paddingBottom }} />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
            );
              }}
            </table.Subscribe>
          )}
        </table.Subscribe>
      </div>
      </RowContextMenu>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete && pendingDelete.length === 1
                ? "¿Eliminar el registro seleccionado?"
                : `¿Eliminar los ${pendingDelete?.length ?? 0} registros seleccionados?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.length === 1 && firstTextField
                ? `Se eliminará "${pendingDelete[0][firstTextField]}". Esta acción no se puede deshacer.`
                : "Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => void confirmDelete()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </GridUiContext.Provider>
  );
});
