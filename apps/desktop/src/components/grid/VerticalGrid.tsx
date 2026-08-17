import {
  forwardRef,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Plus } from "lucide-react";
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
import { activeGridClipboard, setActiveGridClipboard, type GridClipboard } from "./gridClipboard";
import {
  DRAFT_PINNED_CELL_CLASS,
  DRAFT_ROW_CLASS,
  GridUiContext,
  useDraftKind,
  useIsRowActive,
  type GridUi,
} from "./gridContext";
import { ROW_HEIGHT } from "./gridLayout";
import { createSelectionStore, createStore, EMPTY_CHROME } from "./gridStore";
import { applyLineToRow, parseTsv, writeClipboard } from "./gridTsv";
import { displayValue, emptyRow, emptyValue, firstEditableField, isFieldEditable, isNewRow } from "./gridValues";
import { ResizeHandle } from "./header/ResizeHandle";
import { GridCellMemo } from "./rows/GridCell";
import { RowActions } from "./rows/RowActions";
import { RowContextMenu } from "./rows/RowContextMenu";
import { useRowEditing } from "./useRowEditing";
import type {
  DataGridColumn,
  DataGridConfig,
  DataGridHandle,
  DataGridMeta,
  DataGridPersistProps,
  GridChrome,
  OpenCell,
  Row,
} from "./types";

export type { DataGridColumn, DataGridConfig, DataGridHandle, DataGridPersistProps, Row } from "./types";

/** Ancho inicial de la columna de etiquetas (los `header` de cada campo). */
const LABEL_WIDTH = 220;
/** Ancho inicial de cada registro — todos miden lo mismo, ver `startResize`. */
const RECORD_WIDTH = 150;
const MIN_LABEL_WIDTH = 96;
const MIN_RECORD_WIDTH = 64;
/** Clave del ancho de la columna de etiquetas — ningún `_id` empieza con `__`. */
const LABEL_KEY = "__label";

/**
 * Las dos tablas —encabezado y cuerpo— comparten clases para que sus columnas
 * midan igual. `border-separate` y no `border-collapse`: con los bordes
 * colapsados la línea de 1px la pinta la tabla y no la celda, así que no viaja
 * con la columna de etiquetas al desplazarse en horizontal. Cada celda dibuja
 * solo su borde derecho e inferior, de modo que sin colapsar tampoco se
 * duplican entre vecinas.
 */
const TABLA = "border-separate border-spacing-0 border-l border-t border-border text-xs";

/**
 * Agrupa los campos (renglones) bajo un título que abarca todo el ancho. Un
 * grupo es hoja (`fields`, en el orden en que se pintan) o rama (`groups`,
 * anidados) — exactamente uno de los dos.
 */
export interface VerticalGridGroup {
  id: string;
  /**
   * Vacío (`""`, `null`, `false`) o ausente: el grupo no pinta renglón de
   * sección, solo junta sus campos — sirve para agrupar sin encabezar.
   */
  title?: ReactNode;
  /** Sustituye el tamaño/peso del título (los de primer nivel son `text-sm font-semibold`; los anidados, una barra más ligera). */
  titleClassName?: string;
  fields?: string[];
  groups?: VerticalGridGroup[];
}

type FlatItem =
  | { type: "title"; id: string; title: ReactNode; className?: string; depth: number }
  | { type: "field"; field: string };

function tieneTitulo(title: ReactNode): boolean {
  return title !== undefined && title !== null && title !== false && title !== "";
}

function flatten(groups: VerticalGridGroup[], depth = 0): FlatItem[] {
  const out: FlatItem[] = [];
  for (const g of groups) {
    const titulado = tieneTitulo(g.title);
    if (titulado) {
      out.push({ type: "title", id: g.id, title: g.title, className: g.titleClassName, depth });
    }
    // Un grupo sin título no cuenta como nivel: sus hijos se pintan con la
    // jerarquía que se ve, no con la del árbol — si no, el primer título
    // visible saldría con el estilo de subsección sin nada encima.
    if (g.groups) out.push(...flatten(g.groups, titulado ? depth + 1 : depth));
    else if (g.fields) for (const field of g.fields) out.push({ type: "field", field });
  }
  return out;
}

/**
 * Altura fija para el contenido de una celda del encabezado. Va en un `<div>`
 * interno y no en el `<th>` a propósito: en una tabla, `height` sobre la celda
 * es un mínimo —el contenido más alto la estira igual—, así que lo que fija la
 * altura de verdad es el bloque de adentro, recortando lo que sobre.
 */
function fixedHeight(height: number | undefined): React.CSSProperties | undefined {
  return height === undefined ? undefined : { height, overflow: "hidden" };
}

/** El texto que titula la columna de un registro cuando no hay `renderRecordHeader`. */
function defaultHeaderColumn(columns: DataGridColumn[]): DataGridColumn | undefined {
  return columns.find((c) => !c.readOnly && !c.numeric && !c.boolean && !c.stars) ?? columns[0];
}

/**
 * La celda de un registro. Memoizada como la fila del `DataGrid`: el cuerpo se
 * repinta con cada cambio de estado del grid, pero una celda solo depende de su
 * registro, su campo y de si el registro está seleccionado — el borrador, la
 * celda activa y el guardado llegan por suscripción a los stores.
 */
const RecordCell = memo(function RecordCell({
  column,
  row,
  selected,
  selectionMode,
}: {
  column: DataGridColumn;
  row: Row;
  selected: boolean;
  selectionMode: "multiple" | "single";
}) {
  const active = useIsRowActive(row._id);
  const draftKind = useDraftKind(row._id);
  const visuallySelected = selectionMode === "single" ? active : selected;
  return (
    <td
      data-row-id={row._id}
      data-field={column.field}
      style={{ height: ROW_HEIGHT }}
      className={cn(
        "overflow-hidden border-b border-r border-border p-0 align-middle text-xs",
        draftKind !== "" ? DRAFT_ROW_CLASS[draftKind] : visuallySelected && "bg-accent",
      )}
    >
      <GridCellMemo column={column} row={row} />
    </td>
  );
});

/**
 * El encabezado de un registro: lo que en el `DataGrid` sería su fila —
 * casilla de selección, texto que lo identifica y los botones ✓/✗ del
 * borrador.
 */
const RecordHeader = memo(function RecordHeader({
  row,
  label,
  height,
  selected,
  selectionMode,
  onToggleSelected,
  resizing,
  onResizeStart,
  containerRef,
}: {
  row: Row;
  label: ReactNode;
  height?: number;
  selected: boolean;
  selectionMode: "multiple" | "single";
  onToggleSelected: (rowId: string, checked: boolean) => void;
  resizing: boolean;
  onResizeStart: (key: string, clientX: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const active = useIsRowActive(row._id);
  const draftKind = useDraftKind(row._id);
  const visuallySelected = selectionMode === "single" ? active : selected;
  return (
    <th
      data-row-id={row._id}
      scope="col"
      className={cn(
        "relative border-b border-r border-border px-1.5 py-1 align-bottom text-xs font-medium",
        // Va pegado arriba (`sticky` en el `<thead>`), así que el tinte del
        // borrador se pinta en su versión opaca: el normal es translúcido en
        // tema oscuro y dejaría ver los renglones que pasan por debajo.
        draftKind !== "" ? DRAFT_PINNED_CELL_CLASS[draftKind] : visuallySelected ? "bg-accent" : "bg-muted",
      )}
    >
      <div className="flex min-w-0 flex-col items-center justify-end gap-0.5" style={fixedHeight(height)}>
        <div className="flex w-full min-w-0 items-center gap-1">
          {selectionMode === "multiple" && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onToggleSelected(row._id, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {/* Sin número de posición: al registro lo nombra su propio título, y
              el número sería posición en lo filtrado, no identidad. */}
          <span
            title={typeof label === "string" ? label : undefined}
            className={cn("min-w-0 flex-1 truncate text-center", active && "text-foreground")}
          >
            {label}
          </span>
        </div>
        {/* El espacio de los ✓/✗ está siempre reservado, aunque el registro no
            esté en borrador: si apareciera al empezar a editar, el encabezado
            crecería de golpe y con `recordHeaderHeight` fija se recortarían los
            botones — que son la única forma de confirmar con el ratón. */}
        <div className="flex h-[18px] w-full shrink-0 items-center justify-center">
          <RowActions rowId={row._id} />
        </div>
      </div>
      <ResizeHandle
        resizing={resizing}
        containerRef={containerRef}
        onMouseDown={(e) => onResizeStart(row._id, e.clientX)}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) onResizeStart(row._id, touch.clientX);
        }}
      />
    </th>
  );
});

/**
 * El grid acostado: comparte el motor del `DataGrid` —mismos
 * `DataGridColumn`/`Row`, mismo `useRowEditing` (un borrador por registro,
 * ✓/✗, guardado y errores), mismo `GridCell`/`CellEditor` por celda— pero lo
 * pinta transpuesto: **cada columna (`DataGridColumn`) es un renglón y cada
 * renglón (`Row`) es una columna**. Sirve para catálogos de pocos registros y
 * muchos campos, donde la tabla normal obliga a pasearse a lo ancho.
 *
 * Conserva del `DataGrid` lo que sí tiene sentido transpuesto: selección
 * simple/múltiple, alta y baja de registros (`ref`), búsqueda (propia o del
 * padre), portapapeles en TSV, menú contextual, encabezado y columna de
 * etiquetas fijos, ancho ajustable (y altura fija de encabezado si se pide,
 * ver `recordHeaderHeight`), skeleton de carga y el aviso de error de
 * guardado.
 *
 * Las flechas quedan invertidas para calzar con el dibujo: ↑/↓ camina los
 * campos del registro actual (el ←/→ del `DataGrid`) y sigue funcionando
 * mientras ese registro está en borrador; ←/→ camina entre registros (el ↑/↓
 * del `DataGrid`) y, como allá, se bloquea mientras hay un borrador abierto —
 * saltar a otro registro lo dejaría a medio confirmar. Ctrl+Enter confirma,
 * Escape cancela, F2 y teclear encima abren el editor, Supr limpia la celda.
 *
 * Deliberadamente no trae lo que aquí no aplica: virtualización (transpuesto,
 * lo que crece son los campos, que son fijos y contados), ordenamiento por
 * columna, reordenar u ocultar campos y persistencia del diseño. Si el
 * catálogo tiene cientos de registros, el que va es el `DataGrid`.
 */
export const VerticalGrid = forwardRef<
  DataGridHandle,
  {
    config: DataGridConfig;
    /** Organiza los campos en secciones tituladas (anidables); el orden aquí es el orden de los renglones. Sin esto se pintan todos, en el orden de `config.columns`. */
    groups?: VerticalGridGroup[];
    /** Lo que titula la columna de cada registro — por omisión, el valor de su primer campo capturable de texto. */
    renderRecordHeader?: (row: Row, index: number) => ReactNode;
    onSelectionChange?: (hasSelection: boolean) => void;
    /** Avisa cuál es el primer registro seleccionado (o `null`) — para las vistas que necesitan saber cuál, no solo si hay. */
    onRowSelected?: (row: Row | null) => void;
    /**
     * "multiple" (por omisión): casillas en el encabezado de cada registro.
     * "single": sin casillas, selección al hacer clic y siempre hay un
     * registro seleccionado (el primero al cargar).
     */
    selectionMode?: "multiple" | "single";
    /** Marca el registro seleccionado con un punto de color en su encabezado — para cuando el grid pierde el foco al abrir un panel lateral. */
    highlightSelection?: boolean;
    /** `_id` que se vuelve a seleccionar al (re)montar en modo "single". */
    initialSelectedId?: string | null;
    /** Búsqueda controlada por el padre (para llevarla a su propia barra, ver `SearchInput`); si se omite, el grid pinta la suya. Filtra registros, es decir columnas. */
    search?: string;
    onSearchChange?: (search: string) => void;
    /** Los registros vienen en camino: en lugar de "Sin registros." pinta la forma de la tabla. */
    loading?: boolean;
    /** Ancho inicial de la columna de etiquetas; el usuario puede ajustarlo. */
    labelWidth?: number;
    /** Ancho inicial de cada registro; el usuario puede ajustarlo (todos a la vez). */
    recordWidth?: number;
    /**
     * Altura fija (px) del encabezado de registros — el mismo alto para todos,
     * aunque uno traiga un `renderRecordHeader` de dos renglones y otro de uno.
     * Sin esto la marca su contenido. Lo que no quepa se recorta, así que hay
     * que dejar lugar para los ✓/✗ del borrador (18px, siempre reservados).
     */
    recordHeaderHeight?: number;
    /** Botón "+" al final del encabezado, además de `ref.addRow()` — solo si hay con qué dar de alta. */
    showAddButton?: boolean;
  } & DataGridPersistProps
>(function VerticalGrid(
  {
    config,
    groups,
    renderRecordHeader,
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
    loading = false,
    labelWidth: labelWidthProp = LABEL_WIDTH,
    recordWidth: recordWidthProp = RECORD_WIDTH,
    recordHeaderHeight,
    showAddButton = true,
  },
  ref,
) {
  const selectionStore = useRef(createSelectionStore()).current;
  const openCellStore = useRef(createStore<OpenCell | null>(null)).current;
  const chromeStore = useRef(createStore<GridChrome>(EMPTY_CHROME)).current;
  const metaRef = useRef<DataGridMeta>(null as unknown as DataGridMeta);
  const columnsRef = useRef<DataGridColumn[]>(config.columns);
  const uiStore = useRef<GridUi>({
    selection: selectionStore,
    openCell: openCellStore,
    chrome: chromeStore,
    meta: metaRef,
    columns: columnsRef,
  }).current;

  // Los renglones: los campos en el orden en que se pintan (el de `groups` si
  // lo hay), con sus títulos de sección intercalados.
  const columnByField = useMemo(
    () => new Map(config.columns.map((c) => [c.field, c])),
    [config.columns],
  );
  const items = useMemo<FlatItem[]>(
    () => (groups ? flatten(groups) : config.columns.map((c) => ({ type: "field", field: c.field }))),
    [groups, config.columns],
  );
  const orderedColumns = useMemo(
    () =>
      items
        .filter((i): i is Extract<FlatItem, { type: "field" }> => i.type === "field")
        .map((i) => columnByField.get(i.field))
        .filter((c): c is DataGridColumn => c !== undefined),
    [items, columnByField],
  );
  columnsRef.current = orderedColumns;
  const orderedFields = useMemo(() => orderedColumns.map((c) => c.field), [orderedColumns]);
  const headerColumn = useMemo(() => defaultHeaderColumn(orderedColumns), [orderedColumns]);

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
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [internalSearch, setInternalSearch] = useState("");
  const isSearchControlled = controlledSearch !== undefined;
  const search = isSearchControlled ? controlledSearch : internalSearch;
  const setSearch = isSearchControlled ? onSearchChange! : setInternalSearch;
  // Igual que en el `DataGrid`: el campo responde a cada tecla y el refiltrado
  // (que repinta el cuerpo entero) va en un render de baja prioridad.
  const deferredSearch = useDeferredValue(search);

  /** El marco: lo que tiene el foco y escucha el teclado (el scroll es del cuerpo). */
  const frameRef = useRef<HTMLDivElement>(null);
  /** La tira del encabezado, que sigue en horizontal al cuerpo. */
  const headRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** La tira del encabezado sigue al cuerpo en horizontal (en vertical no se mueve). */
  const sincronizarEncabezado = () => {
    const head = headRef.current;
    const body = scrollRef.current;
    if (head && body) head.scrollLeft = body.scrollLeft;
  };

  // La barra de scroll vertical del cuerpo se le descuenta al encabezado, que
  // no tiene ninguna: sin esto las dos tablas dejarían de coincidir a lo ancho
  // en los sistemas donde la barra ocupa lugar.
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setScrollbarWidth(el.offsetWidth - el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Anchos ajustables a mano, uno por registro (más el de la columna de
  // etiquetas), como el `DataGrid` los ajusta por columna. Van por `_id`, que
  // es el del backend y sobrevive a una recarga; un registro sin ancho propio
  // usa el que trajo el consumidor. No se persisten entre sesiones: aquí no
  // hay diseño guardado (ver el comentario del componente).
  const [labelWidth, setLabelWidth] = useState(labelWidthProp);
  const [recordWidths, setRecordWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const widthsRef = useRef({ label: labelWidth, records: recordWidths, base: recordWidthProp });
  widthsRef.current = { label: labelWidth, records: recordWidths, base: recordWidthProp };
  const labelWidthRef = useRef(labelWidth);
  labelWidthRef.current = labelWidth;

  const startResize = useCallback((key: string, startX: number) => {
    const { label, records, base } = widthsRef.current;
    const isLabel = key === LABEL_KEY;
    const startWidth = isLabel ? label : (records[key] ?? base);
    const min = isLabel ? MIN_LABEL_WIDTH : MIN_RECORD_WIDTH;
    setResizingKey(key);
    const apply = (x: number) => {
      const next = Math.max(min, Math.round(startWidth + (x - startX)));
      if (isLabel) setLabelWidth(next);
      else setRecordWidths((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
    };
    const onMouseMove = (e: MouseEvent) => apply(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) apply(touch.clientX);
    };
    const stop = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stop);
      setResizingKey(null);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", stop);
  }, []);

  const widthOf = (rowId: string) => recordWidths[rowId] ?? recordWidthProp;

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
  }, [chromeStore, editing, saving, errorFields, saveError, highlightSelection]);

  // La búsqueda filtra registros (columnas), comparando contra el texto ya
  // formateado de todos sus campos —el mismo que el usuario ve— y no contra
  // los valores crudos. El borrador siempre pasa: si no, "Agregar" con una
  // búsqueda activa escondería la columna recién creada. El texto se cachea
  // por registro en un `WeakMap`, así editar una celda solo recalcula el suyo.
  const rowTextCache = useMemo(() => new WeakMap<Row, string>(), [orderedColumns]);
  const visibleRows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return rows;
    const draftId = editingRef.current?.id;
    return rows.filter((row) => {
      if (row._id === draftId) return true;
      let text = rowTextCache.get(row);
      if (text === undefined) {
        text = orderedColumns.map((c) => displayValue(row, c)).join(" ").toLowerCase();
        rowTextCache.set(row, text);
      }
      return text.includes(query);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, deferredSearch, orderedColumns, rowTextCache]);
  const visibleRowsRef = useRef(visibleRows);
  visibleRowsRef.current = visibleRows;

  const toggleSelected = useCallback((rowId: string, checked: boolean) => {
    setRowSelection((prev) => {
      const next = { ...prev };
      if (checked) next[rowId] = true;
      else delete next[rowId];
      return next;
    });
  }, []);

  // Un registro que deja de existir (se borró, o la búsqueda lo dejó fuera) no
  // puede seguir contando como seleccionado: la barra de acciones creería que
  // hay algo que borrar.
  useEffect(() => {
    setRowSelection((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      const alive = new Set(visibleRows.map((r) => r._id));
      if (ids.every((id) => alive.has(id))) return prev;
      return Object.fromEntries(ids.filter((id) => alive.has(id)).map((id) => [id, true]));
    });
  }, [visibleRows]);

  // Modo "single": siempre hay exactamente un registro seleccionado — al
  // montar, `initialSelectedId` o el primero; si la selección se vacía (por
  // ejemplo al borrarlo), vuelve a caer en el primero.
  useEffect(() => {
    if (selectionMode !== "single") return;
    if (selectionStore.get() && visibleRows.some((r) => r._id === selectionStore.get()?.rowId)) return;
    if (visibleRows.length === 0) return;
    const target = initialSelectedId ? visibleRows.find((r) => r._id === initialSelectedId) : undefined;
    const row = target ?? visibleRows[0];
    const field = selectionStore.get()?.field ?? firstEditableField(orderedColumns);
    if (field) selectionStore.set({ rowId: row._id, field });
    setRowSelection({ [row._id]: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode, visibleRows, initialSelectedId]);

  const onRowSelectedRef = useRef(onRowSelected);
  onRowSelectedRef.current = onRowSelected;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Modo "single": el registro seleccionado se sigue desde el store de la
  // selección (que se mueve con el teclado sin repintar el grid), con la misma
  // espera de 200 ms del `DataGrid` para no disparar al padre en cada flecha.
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
        const row = rowsRef.current.find((r) => r._id === rowId) ?? null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode]);

  useEffect(() => {
    if (selectionMode === "single") return;
    const ids = Object.keys(rowSelection);
    onSelectionChangeRef.current?.(ids.length > 0);
    const row = rowsRef.current.find((r) => r._id === ids[0]) ?? null;
    const t = window.setTimeout(() => onRowSelectedRef.current?.(row), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection, selectionMode]);

  // Trae a la vista la celda seleccionada. El encabezado (pegado arriba) y la
  // columna de etiquetas (pegada a la izquierda) tapan lo que pase por debajo,
  // así que cuentan como margen.
  useEffect(() => {
    const align = () => {
      const sel = selectionStore.get();
      const box = scrollRef.current;
      if (!sel || !box) return;
      const cell = box.querySelector<HTMLTableCellElement>(
        `td[data-row-id="${CSS.escape(sel.rowId)}"][data-field="${CSS.escape(sel.field)}"]`,
      );
      if (!cell) return;
      const c = cell.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (c.bottom > b.bottom) box.scrollTop += c.bottom - b.bottom;
      else if (c.top < b.top) box.scrollTop -= b.top - c.top;
      if (c.right > b.right) box.scrollLeft += c.right - b.right;
      else if (c.left < b.left + labelWidthRef.current) box.scrollLeft -= b.left + labelWidthRef.current - c.left;
    };
    const apply = () => {
      const sel = selectionStore.get();
      align();
      // La celda puede no estar montada todavía (un registro recién agregado);
      // se reintenta en el siguiente cuadro, si la selección sigue ahí.
      requestAnimationFrame(() => {
        if (selectionStore.get() !== sel) return;
        align();
      });
    };
    apply();
    return selectionStore.subscribe(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cerrarse el editor de una celda sin saltar a otra (Enter/Escape) el
  // foco se pierde por completo y las flechas dejan de llegar al contenedor.
  useEffect(() => {
    const onClose = () => {
      if (openCellStore.get()) return;
      frameRef.current?.focus({ preventScroll: true });
    };
    return openCellStore.subscribe(onClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Portapapeles ─────────────────────────────────────────────────────────
  // En TSV, pero transpuesto igual que el dibujo: un registro se copia como
  // una columna (un campo por renglón), no como una línea. Así el viaje de ida
  // y vuelta a una hoja de cálculo respeta lo que se ve en pantalla.
  const selectedRecords = (): Row[] => {
    const sel = selectionStore.get();
    if (selectionMode === "multiple") {
      const ids = Object.keys(rowSelection);
      if (ids.length > 0) return visibleRowsRef.current.filter((r) => ids.includes(r._id));
    }
    return rowsRef.current.filter((r) => r._id === sel?.rowId);
  };

  const textToCopy = (): string | null => {
    const sel = selectionStore.get();
    const records = selectedRecords();
    if (copyWholeRowRef.current || records.length > 1) {
      if (records.length === 0) return null;
      return orderedColumns
        .map((column) => records.map((row) => displayValue(row, column)).join("\t"))
        .join("\n");
    }
    if (!sel) return null;
    const row = rowsRef.current.find((r) => r._id === sel.rowId);
    const column = columnByField.get(sel.field);
    if (!row || !column) return null;
    return displayValue(row, column);
  };

  const copy = async () => {
    const text = textToCopy();
    if (text == null) return;
    await writeClipboard(text);
  };

  /**
   * Pega sobre el registro seleccionado, hacia abajo desde el campo activo. De
   * cada línea se toma su primera celda: escribir de corrido en varios
   * registros pediría un borrador por cada uno, y el borrador es de a uno
   * (✓/✗ por registro), igual que en el `DataGrid`.
   */
  const applyPaste = (lines: string[][]) => {
    const sel = selectionStore.get();
    const targetId = sel?.rowId ?? Object.keys(rowSelection)[0];
    if (!targetId || lines.length === 0) return;
    if (editingRef.current && editingRef.current.id !== targetId) return;
    const row = rowsRef.current.find((r) => r._id === targetId);
    if (!row) return;
    const startIdx = copyWholeRowRef.current
      ? 0
      : Math.max(0, orderedFields.indexOf(sel?.field ?? ""));
    const values = lines.map((line) => line[0] ?? "");
    const { row: next, changed } = applyLineToRow(
      row,
      values,
      startIdx,
      orderedColumns,
      isNewRow(editingRef.current, targetId),
    );
    if (!changed) return;
    const nextRows = rowsRef.current.map((r) => (r._id === targetId ? next : r));
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
    const sel = selectionStore.get();
    if (!sel) return;
    const isNew = isNewRow(editingRef.current, sel.rowId);
    if (!copyWholeRowRef.current) {
      const column = columnByField.get(sel.field);
      if (!column || !isFieldEditable(column, isNew)) return;
      commitCellChange(sel.rowId, column.field, emptyValue(column));
      return;
    }
    const row = rowsRef.current.find((r) => r._id === sel.rowId);
    if (!row) return;
    let next: Row = { ...row };
    let changed = false;
    for (const column of orderedColumns) {
      if (!isFieldEditable(column, isNew)) continue;
      const empty = emptyValue(column);
      if (next[column.field] !== empty) {
        next = { ...next, [column.field]: empty };
        changed = true;
      }
    }
    if (!changed) return;
    const nextRows = rowsRef.current.map((r) => (r._id === sel.rowId ? next : r));
    rowsRef.current = nextRows;
    setRows(nextRows);
    if (!editingRef.current) {
      const nextEditing = { id: sel.rowId, isNew: false, original: row };
      editingRef.current = nextEditing;
      setEditing(nextEditing);
    }
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
      /* el evento nativo `paste` cubre el caso sin permiso de portapapeles */
    }
  };

  /** Los eventos nativos de portapapeles disparados dentro de un editor son del editor. */
  const isFormField = (target: EventTarget | null) => {
    const t = target as HTMLElement | null;
    return t?.tagName === "INPUT" || t?.tagName === "SELECT" || t?.tagName === "TEXTAREA";
  };

  // El menú Edición de `App` habla con el último grid que recibió el foco.
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
    const el = frameRef.current;
    el?.addEventListener("focusin", onFocus);
    return () => {
      el?.removeEventListener("focusin", onFocus);
      if (activeGridClipboard() === api) setActiveGridClipboard(null);
    };
  }, []);

  // ── Teclado ──────────────────────────────────────────────────────────────
  const moveField = (delta: number, toEdge: boolean) => {
    if (orderedFields.length === 0) return;
    const sel = selectionStore.get();
    if (!sel) {
      const rowId = visibleRowsRef.current[0]?._id;
      if (rowId) selectionStore.set({ rowId, field: orderedFields[0] });
      return;
    }
    const idx = orderedFields.indexOf(sel.field);
    const target = toEdge
      ? delta > 0
        ? orderedFields.length - 1
        : 0
      : Math.min(orderedFields.length - 1, Math.max(0, idx + delta));
    const field = orderedFields[target];
    if (field) selectionStore.set({ rowId: sel.rowId, field });
  };

  const moveRecord = (delta: number, toEdge: boolean) => {
    const visible = visibleRowsRef.current;
    if (visible.length === 0) return;
    const sel = selectionStore.get();
    const currentIdx = sel ? visible.findIndex((r) => r._id === sel.rowId) : -1;
    const target = toEdge
      ? delta > 0
        ? visible.length - 1
        : 0
      : Math.min(visible.length - 1, Math.max(0, currentIdx + delta));
    const next = visible[target];
    const field = sel?.field ?? firstEditableField(orderedColumns);
    if (!next || !field) return;
    selectionStore.set({ rowId: next._id, field });
    if (selectionMode === "multiple") setRowSelection({ [next._id]: true });
  };

  // El teclado llega a las mismas celdas que el ratón, así que cada atajo que
  // escribe pasa por la misma regla que `GridCell` (ver `readOnlyOnEdit`).
  const canCapture = (column: DataGridColumn, rowId: string) =>
    isFieldEditable(column, isNewRow(editingRef.current, rowId));

  const onContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // El evento burbujea desde el `<input>`/`<select>` del editor de celda —
    // `CellEditor` ya maneja ahí Escape/Tab/Enter/Ctrl+Enter; este nivel no
    // debe repetir ni pisar esa lógica.
    if (isFormField(target)) return;

    const sel = selectionStore.get();
    const openCellNow = openCellStore.get();

    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S") && editing) {
      e.preventDefault();
      void commitEdit();
      return;
    }

    // Escape con el editor cerrado cancela el borrador del registro completo
    // (igual que el ✗); con el editor abierto, `CellEditor` ya lo consumió
    // para descartar solo esa celda.
    if (e.key === "Escape" && editing && !openCellNow) {
      e.preventDefault();
      cancelEdit();
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      moveField(e.key === "ArrowDown" ? 1 : -1, e.ctrlKey || e.metaKey);
      return;
    }

    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const viewport = scrollRef.current?.clientHeight ?? 400;
      const perPage = Math.max(1, Math.floor(viewport / ROW_HEIGHT) - 1);
      moveField(e.key === "PageDown" ? perPage : -perPage, false);
      return;
    }

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Saltar de registro en pleno borrador lo dejaría a medio confirmar —
      // igual que el `DataGrid` bloquea ↑/↓ (su eje de registro) al editar.
      if (editing) return;
      e.preventDefault();
      moveRecord(e.key === "ArrowRight" ? 1 : -1, e.ctrlKey || e.metaKey);
      return;
    }

    if (e.key === "Home" || e.key === "End") {
      if (!sel && visibleRowsRef.current.length === 0) return;
      e.preventDefault();
      const toStart = e.key === "Home";
      if ((e.ctrlKey || e.metaKey) && !editing) moveRecord(toStart ? -1 : 1, true);
      moveField(toStart ? -1 : 1, true);
      return;
    }

    if (!openCellNow && sel && e.key === "F2") {
      const column = columnByField.get(sel.field);
      if (column && canCapture(column, sel.rowId)) {
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
      if (column?.boolean && canCapture(column, sel.rowId)) {
        e.preventDefault();
        const row = rowsRef.current.find((r) => r._id === sel.rowId);
        if (row) commitCellChange(sel.rowId, column.field, !row[column.field]);
        return;
      }
    }

    // Supr/Retroceso limpian la celda seleccionada y entran al borrador del
    // registro — no se guarda hasta ✓, igual que en Excel y que el `DataGrid`.
    if (!openCellNow && sel && (e.key === "Delete" || e.key === "Backspace")) {
      const column = columnByField.get(sel.field);
      if (column && canCapture(column, sel.rowId)) {
        e.preventDefault();
        commitCellChange(sel.rowId, column.field, emptyValue(column));
      }
      return;
    }

    // Teclear directo sobre la celda seleccionada abre el editor reemplazando
    // el valor — igual que Excel y que el `DataGrid`.
    if (!openCellNow && sel && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const column = columnByField.get(sel.field);
      if (column && !column.boolean && canCapture(column, sel.rowId)) {
        e.preventDefault();
        openCellAt(sel.rowId, sel.field, e.key);
      }
    }
  };

  // ── Alta y baja ──────────────────────────────────────────────────────────
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
      const field = firstEditableField(orderedColumns);
      if (field) {
        selectionStore.set({ rowId: newRow._id, field });
        openCellStore.set({ rowId: newRow._id, field });
      }
    },
    deleteSelectedRows: () => {
      const selected = selectedRecords();
      if (selected.length === 0) return;
      setPendingDelete(selected);
    },
  };
  useImperativeHandle(ref, () => handle);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const ids = pendingDelete.map((r) => r._id);
    try {
      if (isControlled) {
        await onDeleteRows?.(ids);
      } else {
        const idsSet = new Set(ids);
        setRows((prev) => prev.filter((r) => !idsSet.has(r._id)));
      }
      setPendingDelete(null);
      setRowSelection({});
      selectionStore.set(null);
      onSelectionChange?.(false);
      onRowSelected?.(null);
    } catch (e) {
      setPendingDelete(null);
      const message = e instanceof Error ? e.message : String(e);
      if (onSaveError) onSaveError(message);
      else toast({ description: message, variant: "destructive" });
    }
  };

  // ── Ratón ────────────────────────────────────────────────────────────────
  const focusContainer = () => frameRef.current?.focus({ preventScroll: true });

  // El foco vive en el contenedor (no en cada celda, que se desmonta al
  // editar): sin él las flechas no llegarían a `onContainerKeyDown`.
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isFormField(e.target)) return;
    focusContainer();
  };

  /** Un clic sobre el encabezado de un registro lo toma completo — como el clic sobre el número de fila del `DataGrid`. */
  const selectWholeRecord = (rowId: string) => {
    if (editingRef.current && editingRef.current.id !== rowId) return;
    copyWholeRowRef.current = true;
    const sel = selectionStore.get();
    const field =
      sel?.field ?? firstEditableField(orderedColumns, isNewRow(editingRef.current, rowId));
    if (field) selectionStore.set({ rowId, field });
    if (selectionMode === "multiple") setRowSelection({ [rowId]: true });
  };

  const onContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const th = (e.target as HTMLElement).closest<HTMLTableCellElement>("th[data-row-id]");
    if (th?.dataset.rowId) selectWholeRecord(th.dataset.rowId);
  };

  // Igual que el `DataGrid`: el clic derecho lleva el cursor a donde se hizo
  // clic *antes* de abrir el menú — si no, Copiar actuaría sobre lo que
  // estuviera seleccionado en otra parte.
  const onContainerContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const th = target.closest<HTMLTableCellElement>("th[data-row-id]");
    if (th?.dataset.rowId) {
      selectWholeRecord(th.dataset.rowId);
      return;
    }
    const td = target.closest<HTMLTableCellElement>("td[data-row-id][data-field]");
    const rowId = td?.dataset.rowId;
    const field = td?.dataset.field;
    if (!rowId || !field) return;
    if (editingRef.current && editingRef.current.id !== rowId) return;
    copyWholeRowRef.current = false;
    selectionStore.set({ rowId, field });
  };

  // ── Pintura ──────────────────────────────────────────────────────────────
  const showSkeleton = loading && visibleRows.length === 0;
  const skeletonRecords = 3;
  const recordCount = showSkeleton ? skeletonRecords : visibleRows.length;
  const canAdd = !isControlled || !!onAddRow;
  const addColumn = showAddButton && canAdd;
  const fullSpan = 1 + recordCount + (addColumn ? 1 : 0);

  let topLevelTitles = 0;

  // Las dos tablas se dibujan con `table-layout: fixed` y un ancho total
  // explícito: con el reparto automático, el `<colgroup>` es solo una
  // sugerencia y cada tabla la estira según su contenido —el cuerpo tiene
  // texto y el encabezado puede no tenerlo—, así que las columnas dejaban de
  // coincidir entre una y otra. Fijas, mandan los anchos y nada más.
  const anchoTotal =
    labelWidth +
    (showSkeleton
      ? skeletonRecords * recordWidthProp
      : visibleRows.reduce((suma, row) => suma + widthOf(row._id), 0)) +
    (addColumn ? 32 : 0);
  const estiloTabla: React.CSSProperties = { width: anchoTotal, tableLayout: "fixed" };

  // Un solo `<colgroup>` para las dos tablas: es lo que las mantiene alineadas
  // columna por columna.
  const columnas = (
    <colgroup>
      <col style={{ width: labelWidth }} />
      {showSkeleton
        ? Array.from({ length: skeletonRecords }, (_, i) => <col key={i} style={{ width: recordWidthProp }} />)
        : visibleRows.map((row) => <col key={row._id} style={{ width: widthOf(row._id) }} />)}
      {addColumn && <col style={{ width: 32 }} />}
    </colgroup>
  );

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
        {/* Una recarga sobre registros que ya están en pantalla: se quedan, y
            la espera se marca con un hilo de luz cruzando el borde. */}
        {loading && !showSkeleton && (
          <div data-t="grid-loading" aria-hidden className="h-[3px] shrink-0 overflow-hidden bg-primary/25">
            <div className="barra-progreso-indeterminada h-full w-1/3 rounded-full bg-primary" />
          </div>
        )}
        <RowContextMenu
          editing={!!editing}
          canAdd={canAdd}
          canDelete={
            selectionMode === "single"
              ? selectionStore.get() !== null
              : Object.keys(rowSelection).length > 0
          }
          addLabel="Agregar registro"
          onCopy={() => void copy()}
          onCut={() => void cut()}
          onPaste={() => void paste()}
          onAddRow={() => handle.addRow()}
          onDeleteRows={() => handle.deleteSelectedRows()}
        >
          <div
            ref={frameRef}
            tabIndex={0}
            onKeyDown={onContainerKeyDown}
            onMouseDown={onMouseDown}
            onClick={onContainerClick}
            onContextMenu={onContainerContextMenu}
            onCopy={(e) => {
              if (isFormField(e.target)) return;
              const text = textToCopy();
              if (text == null) return;
              e.preventDefault();
              e.clipboardData.setData("text/plain", text);
            }}
            onCut={(e) => {
              if (isFormField(e.target)) return;
              const text = textToCopy();
              if (text == null) return;
              e.preventDefault();
              e.clipboardData.setData("text/plain", text);
              clearCopiedSelection();
            }}
            onPaste={(e) => {
              if (isFormField(e.target)) return;
              e.preventDefault();
              applyPaste(parseTsv(e.clipboardData.getData("text/plain")));
            }}
            // `group/grid`: de este marco cuelga el cursor de celda (ver
            // `RING_CURSOR` en `GridCell`) — es el elemento enfocable y, por
            // `asChild`, el disparador del menú contextual.
            className="group/grid flex min-h-0 flex-1 flex-col outline-none"
          >
            {/* El encabezado vive en su propia tabla, fuera del área que se
                desplaza, y solo se sincroniza en horizontal. No va pegado con
                `sticky` sobre el cuerpo a propósito: un encabezado encima del
                contenido deja una costura de subpíxel por la que, con la
                pantalla a escalas fraccionarias (125%, 150%), se alcanzan a ver
                las letras de los renglones que pasan por debajo. Aquí no hay
                nada debajo del encabezado que pueda asomarse. */}
            <div ref={headRef} className="shrink-0 overflow-hidden" style={{ paddingRight: scrollbarWidth }}>
              <table className={TABLA} style={estiloTabla}>
                {columnas}
                <thead>
                <tr>
                  <th
                    scope="col"
                    style={{ width: labelWidth }}
                    className="sticky left-0 z-40 border-b border-r border-border bg-muted px-2 py-1 text-left align-bottom text-xs font-semibold text-muted-foreground"
                  >
                    <div className="flex flex-col justify-end" style={fixedHeight(recordHeaderHeight)}>
                      <span className="block truncate" title={config.title}>
                        {config.title}
                      </span>
                    </div>
                    <ResizeHandle
                      resizing={resizingKey === LABEL_KEY}
                      containerRef={frameRef}
                      onMouseDown={(e) => startResize(LABEL_KEY, e.clientX)}
                      onTouchStart={(e) => {
                        const touch = e.touches[0];
                        if (touch) startResize(LABEL_KEY, touch.clientX);
                      }}
                    />
                  </th>
                  {showSkeleton
                    ? Array.from({ length: skeletonRecords }, (_, i) => (
                        <th key={i} aria-hidden className="border-b border-r border-border bg-muted px-2 py-1">
                          <div className="flex flex-col justify-end" style={fixedHeight(recordHeaderHeight)}>
                            <div className="mx-auto h-2.5 w-2/3 animate-pulse rounded bg-muted-foreground/15" />
                          </div>
                        </th>
                      ))
                    : visibleRows.map((row, index) => (
                        <RecordHeader
                          key={row._id}
                          row={row}
                          label={
                            renderRecordHeader?.(row, index) ??
                            (headerColumn ? displayValue(row, headerColumn) : "") ??
                            ""
                          }
                          height={recordHeaderHeight}
                          selected={!!rowSelection[row._id]}
                          selectionMode={selectionMode}
                          onToggleSelected={toggleSelected}
                          resizing={resizingKey === row._id}
                          onResizeStart={startResize}
                          containerRef={frameRef}
                        />
                      ))}
                  {addColumn && (
                    <th className="border-b border-r border-border bg-muted p-0 align-middle">
                      <button
                        type="button"
                        title="Agregar registro"
                        disabled={!!editing}
                        onClick={() => handle.addRow()}
                        className="flex h-full w-8 items-center justify-center py-1 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground disabled:opacity-40"
                      >
                        <Plus size={14} />
                      </button>
                    </th>
                  )}
                </tr>
                </thead>
              </table>
            </div>
            <div ref={scrollRef} onScroll={sincronizarEncabezado} className="min-h-0 flex-1 overflow-auto">
              <table className={cn(TABLA, "border-t-0")} style={estiloTabla}>
                {columnas}
                <tbody>
                {!showSkeleton && visibleRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={fullSpan}
                      className="border-b border-r border-border px-2 py-4 text-center text-xs text-muted-foreground"
                    >
                      Sin registros.
                    </td>
                  </tr>
                )}
                {items.map((item) => {
                  if (item.type === "title") {
                    const topLevel = item.depth === 0;
                    if (topLevel) topLevelTitles += 1;
                    return (
                      <tr key={item.id}>
                        <td
                          colSpan={fullSpan}
                          className={cn(
                            topLevel
                              ? cn(
                                  "border-b-2 border-foreground/20 py-3",
                                  topLevelTitles > 1 && "border-t-2",
                                )
                              : "border-b border-r border-border bg-muted/60 py-1 font-semibold text-foreground",
                            item.className ?? (topLevel ? "text-sm font-semibold" : undefined),
                          )}
                        >
                          {/* La celda abarca todo el ancho, así que su texto se
                              iría de vista al desplazarse a la derecha: se queda
                              pegado al borde, encima de la columna de etiquetas,
                              que es donde el título encabeza a sus campos. El
                              margen va dentro (no en la celda) para que lo
                              conserve también ya pegado. */}
                          <span className={cn("sticky left-0 inline-block", topLevel ? "px-4" : "px-3")}>
                            {item.title}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  const column = columnByField.get(item.field);
                  if (!column) return null;
                  return (
                    <tr key={item.field} style={{ height: ROW_HEIGHT }}>
                      <th
                        scope="row"
                        data-field={column.field}
                        style={{ width: labelWidth }}
                        className={cn(
                          "sticky left-0 z-10 border-b border-r border-border bg-background px-2 py-0.5 text-left align-middle text-xs font-normal",
                          column.readOnly && "text-muted-foreground",
                        )}
                      >
                        <span className="block truncate" title={column.header}>
                          {column.header}
                        </span>
                      </th>
                      {showSkeleton
                        ? Array.from({ length: skeletonRecords }, (_, i) => (
                            <td key={i} aria-hidden data-skeleton className="border-b border-r border-border px-1 py-0.5">
                              <div className="h-2.5 animate-pulse rounded bg-muted-foreground/15" style={{ width: "70%" }} />
                            </td>
                          ))
                        : visibleRows.map((row) => (
                            <RecordCell
                              key={row._id}
                              column={column}
                              row={row}
                              selected={!!rowSelection[row._id]}
                              selectionMode={selectionMode}
                            />
                          ))}
                      {addColumn && <td className="border-b border-r border-border p-0" />}
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
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
                {pendingDelete && pendingDelete.length === 1 && headerColumn
                  ? `Se eliminará "${displayValue(pendingDelete[0], headerColumn)}". Esta acción no se puede deshacer.`
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
