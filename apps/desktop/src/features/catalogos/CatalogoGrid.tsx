import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellEditingStartedEvent,
  type CellFocusedEvent,
  type CellValueChangedEvent,
  type ColDef,
  type GetRowIdParams,
  type ICellEditorParams,
  type ICellRendererParams,
} from "ag-grid-community";
import { Check, Star, X } from "lucide-react";
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
import { formatearFecha } from "@/lib/fecha";
import { cn } from "@/lib/utils";

ModuleRegistry.registerModules([AllCommunityModule]);

const obrixGridTheme = themeQuartz.withParams({
  backgroundColor: "hsl(var(--card))",
  foregroundColor: "hsl(var(--foreground))",
  borderColor: "hsl(var(--border))",
  chromeBackgroundColor: "hsl(var(--muted))",
  headerBackgroundColor: "hsl(var(--muted))",
  headerTextColor: "hsl(var(--muted-foreground))",
  oddRowBackgroundColor: "hsl(var(--muted) / 0.4)",
  rowHoverColor: "hsl(var(--accent))",
  selectedRowBackgroundColor: "hsl(var(--primary) / 0.15)",
  accentColor: "hsl(var(--primary))",
  fontFamily: "inherit",
  fontSize: 13,
  rowHeight: 30,
  headerHeight: 32,
  borderRadius: 6,
  wrapperBorderRadius: 6,
  spacing: 6,
});

/**
 * Color de fondo para la fila en edición (`.fila-editando`) y para la fila
 * nueva sin confirmar (`.fila-nueva`) — clases propias, aplicadas vía
 * `rowClassRules`. La selección de ag-Grid no pinta un `background-color`
 * normal: dibuja una capa encima vía la variable `--ag-internal-row-overlay-color`
 * (ver `.ag-row.ag-row-selected` en su CSS), así que para que el color de
 * edición/nueva predomine sobre el de selección hay que sobreescribir esa
 * misma variable con más especificidad, no solo el `background-color`.
 */
const COLOR_EDICION = "hsl(38 92% 50% / 0.18)";
const COLOR_NUEVA = "hsl(142 71% 45% / 0.16)";
const ESTILO_EDICION = `
  .fila-editando { background-color: ${COLOR_EDICION} !important; }
  .fila-nueva { background-color: ${COLOR_NUEVA} !important; }
  .ag-row.ag-row-selected.fila-editando { --ag-internal-row-overlay-color: ${COLOR_EDICION} !important; }
  .ag-row.ag-row-selected.fila-nueva { --ag-internal-row-overlay-color: ${COLOR_NUEVA} !important; }

  /*
   * El popup de agSelectCellEditor (.ag-select-list) sigue el tema por
   * defecto (variables de la Theming API) — el usuario prefiere que la
   * lista desplegable siempre se vea blanca, sin importar el tema activo,
   * aunque la celda cerrada sí siga el tema normal.
   */
  .ag-select-list {
    background-color: #ffffff !important;
    color: #1f2937 !important;
    border-color: rgba(0, 0, 0, 0.12) !important;
  }
  .ag-select-list .ag-list-item.ag-active-item {
    background-color: rgba(0, 0, 0, 0.06) !important;
  }
`;

export interface CatalogoColumnaDef {
  campo: string;
  encabezado: string;
  ancho?: number;
  numero?: boolean;
  /** Se edita/muestra como checkbox — para columnas cuyo valor es verdadero/falso. */
  booleano?: boolean;
  /** Texto que se agrega al valor solo para mostrarlo (p. ej. "%") — no afecta el valor real al editar. */
  sufijo?: string;
  /**
   * Si se pasa, la celda se edita con un selector en vez de texto libre — para
   * columnas cuyo valor es un enum. Como función, las opciones dependen de
   * otro campo de la misma fila (p. ej. subfamilia según la familia elegida).
   */
  opciones?: readonly string[] | ((fila: Fila) => readonly string[]);
  /** Columnas de auditoría (created_at/updated_at/created_by/updated_by) — visibles pero no editables. */
  soloLectura?: boolean;
  /** Nombre del campo de la fila que trae la profundidad del nodo — si se pasa, la celda se indenta como árbol. */
  indentarPor?: string;
  /** Se muestra como estrellas (0–5) en modo lectura; la edición sigue siendo el valor numérico crudo. */
  estrellas?: boolean;
  /** Se muestra con el formato de fecha de región México (ver `lib/fecha.ts`) — el valor real no cambia. */
  fecha?: boolean;
  /** Desactiva el filtro de columna de ag-Grid (activo por defecto en todas las columnas). */
  sinFiltro?: boolean;
}

/**
 * Columnas `booleano` se editan/muestran como un combobox "Sí"/"No" (no
 * checkbox) — el checkbox nativo de ag-Grid (`agCheckboxCellRenderer`) tiene
 * estado propio que no siempre refleja un valor revertido por `setFilas`
 * (cancelar una edición), y forzar su redraw resultó frágil. El dato
 * subyacente sigue siendo `boolean`, ver `valueGetter`/`valueSetter` abajo.
 */
const SI_NO = ["Sí", "No"] as const;

const ESTRELLA_VACIA = "text-muted-foreground/30";
const ESTRELLA_LLENA = "fill-amber-400 text-amber-400";

function renderEstrellas(valor: unknown) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  // Redondea al medio punto más cercano (4.3 -> 4.5, 4.2 -> 4) para poder
  // dibujar una estrella a la mitad, no solo llena/vacía.
  const redondeado = Math.round(numero * 2) / 2;
  return (
    <div className="flex h-full items-center gap-0.5" title={String(valor)}>
      {Array.from({ length: 5 }, (_, i) => {
        const relleno = Math.min(Math.max(redondeado - i, 0), 1);
        if (relleno === 0) return <Star key={i} size={13} className={ESTRELLA_VACIA} />;
        if (relleno === 1) return <Star key={i} size={13} className={ESTRELLA_LLENA} />;
        return (
          <span key={i} className="relative inline-block" style={{ width: 13, height: 13 }}>
            <Star size={13} className={cn("absolute inset-0", ESTRELLA_VACIA)} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
              <Star size={13} className={ESTRELLA_LLENA} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

export interface CatalogoGridConfig {
  titulo: string;
  columnas: CatalogoColumnaDef[];
}

export type Fila = Record<string, string | number | boolean> & { _id: string };

function filaVacia(columnas: CatalogoColumnaDef[]): Fila {
  return {
    _id: crypto.randomUUID(),
    ...Object.fromEntries(columnas.map((c) => [c.campo, c.booleano ? false : c.numero ? 0 : ""])),
  };
}

export interface CatalogoGridHandle {
  agregarFila: () => void;
  eliminarFilaSeleccionada: () => void;
}

export interface CatalogoGridPersistProps {
  /** Filas reales, controladas por el padre — cuando se pasa, el grid deja de manejar datos de ejemplo en memoria. */
  filasIniciales?: Fila[];
  /** Se dispara al confirmar un registro nuevo (icono de check), con los valores ya editados por el usuario. */
  onAgregarFila?: (fila: Fila) => void | Promise<void>;
  /** Reemplaza el borrado por una eliminación real, recibe los `_id` seleccionados. */
  onEliminarFilas?: (ids: string[]) => void | Promise<void>;
  /** Se dispara al confirmar la edición de una fila existente (icono de check). */
  onCeldaEditada?: (fila: Fila) => void | Promise<void>;
}

interface EstadoEdicion {
  id: string;
  esNueva: boolean;
  /** Copia tomada al empezar a editar — para poder revertir si se cancela. */
  original: Fila;
}

export const CatalogoGrid = forwardRef<
  CatalogoGridHandle,
  {
    config: CatalogoGridConfig;
    onSelectionChange?: (haySeleccion: boolean) => void;
    /** Se dispara con la primera fila seleccionada (o `null` sin selección) — para vistas que necesitan saber cuál, no solo si hay. */
    onFilaSeleccionada?: (fila: Fila | null) => void;
    /**
     * "multiple" (por defecto): checkboxes, selección opcional — comportamiento actual de los catálogos.
     * "unica": sin checkboxes, selección al click, siempre hay una fila seleccionada (la primera al cargar) y
     * las flechas arriba/abajo mueven la selección — pensado para el maestro de una vista maestro/detalle.
     */
    modoSeleccion?: "multiple" | "unica";
    /**
     * Marca la fila seleccionada con un indicador de color en la columna de
     * acciones — pensado para cuando se abre un panel lateral (precios,
     * ficha) y la fila seleccionada del grid, al perder ancho/foco, se
     * pierde visualmente entre las demás.
     */
    resaltarSeleccion?: boolean;
    /**
     * `_id` a reseleccionar cuando el grid (re)monta en modo "unica" — el
     * grid pierde su selección interna cada vez que cambia de posición en el
     * árbol (p. ej. al abrir un panel lateral, ver `MaterialesSeccion`), así
     * que sin esto siempre volvería a caer en la primera fila.
     */
    seleccionInicialId?: string | null;
  } & CatalogoGridPersistProps
>(function CatalogoGrid(
  {
    config,
    onSelectionChange,
    onFilaSeleccionada,
    modoSeleccion = "multiple",
    resaltarSeleccion = false,
    seleccionInicialId = null,
    filasIniciales,
    onAgregarFila,
    onEliminarFilas,
    onCeldaEditada,
  },
  ref,
) {
  const gridRef = useRef<AgGridReact<Fila>>(null);
  const esPersistido = filasIniciales !== undefined;
  const [filas, setFilas] = useState<Fila[]>(
    () => filasIniciales ?? [filaVacia(config.columnas), filaVacia(config.columnas)],
  );
  const [pendienteEliminar, setPendienteEliminar] = useState<Fila[] | null>(null);
  const [edicion, setEdicion] = useState<EstadoEdicion | null>(null);
  const [filaSeleccionadaId, setFilaSeleccionadaId] = useState<string | null>(null);

  // Refs con el valor más reciente — para que confirmar/cancelar (llamados
  // desde un cellRenderer cuyas columnDefs no se regeneran en cada tecleo)
  // siempre lean el estado actual, no el capturado cuando se armó la columna.
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const edicionRef = useRef(edicion);
  edicionRef.current = edicion;
  const guardandoRef = useRef(false);
  // El indicador de selección (cellRenderer de `__acciones`) lee estos refs
  // en vez de cerrar sobre `resaltarSeleccion`/`filaSeleccionadaId`
  // directamente — así `columnDefs` no depende de ellos y no se reconstruye
  // en cada cambio de selección (p. ej. al recorrer filas con las flechas en
  // modo "unica"), que recreaba todas las columnas/celdas del grid entero y
  // causaba un parpadeo visible al desplazarse.
  const resaltarSeleccionRef = useRef(resaltarSeleccion);
  resaltarSeleccionRef.current = resaltarSeleccion;
  const filaSeleccionadaIdRef = useRef(filaSeleccionadaId);
  filaSeleccionadaIdRef.current = filaSeleccionadaId;
  // Snapshot tomado al empezar a editar una celda existente — el modo edición
  // (color + iconos) solo se activa si el valor realmente cambia; si el
  // usuario entra y sale sin modificar nada, no pasa nada.
  const pendienteRef = useRef<{ id: string; original: Fila } | null>(null);

  useEffect(() => {
    if (filasIniciales) setFilas(filasIniciales);
  }, [filasIniciales]);

  useEffect(() => {
    if (modoSeleccion !== "unica") return;
    const api = gridRef.current?.api;
    if (!api || filas.length === 0 || api.getSelectedRows().length > 0) return;
    api.getDisplayedRowAtIndex(0)?.setSelected(true, true);
  }, [modoSeleccion, filas]);

  // Con muchos registros, la fila nueva (agregada al final) o la que se
  // empieza a editar puede quedar fuera del área visible — hace scroll hasta
  // ella para que el usuario la vea de inmediato.
  useEffect(() => {
    if (!edicion) return;
    gridRef.current?.api.ensureNodeVisible((nodo) => nodo.data?._id === edicion.id, "middle");
  }, [edicion]);

  // El indicador de selección vive en un cellRenderer de la columna
  // `__acciones` — igual que con `edicion`, ag-Grid no lo vuelve a invocar
  // solo porque cambió `resaltarSeleccion` (p. ej. al abrir el panel
  // lateral) o la fila seleccionada, así que hay que forzar el refresco. Se
  // limita a la fila anterior y la nueva, y solo a la columna `__acciones`
  // (no `redrawRows()`, que recrea el DOM de la fila entera): en modo
  // "unica" la selección cambia en cada fila al desplazarse con las
  // flechas, y redibujar la fila completa recreaba también la celda con el
  // foco del teclado, tirando el foco del grid — visible sobre todo
  // navegando rápido (flecha sostenida) cerca del primer/último registro.
  const anteriorSeleccionadaIdRef = useRef<string | null>(null);
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const ids = new Set([anteriorSeleccionadaIdRef.current, filaSeleccionadaId].filter((id) => id !== null));
    const nodos = [...ids].map((id) => api.getRowNode(id)).filter((n) => n !== undefined);
    if (nodos.length > 0) api.refreshCells({ rowNodes: nodos, columns: ["__acciones"], force: true });
    anteriorSeleccionadaIdRef.current = filaSeleccionadaId;
  }, [resaltarSeleccion, filaSeleccionadaId]);

  const onCellFocused = (event: CellFocusedEvent<Fila>) => {
    if (modoSeleccion !== "unica" || event.rowIndex == null) return;
    gridRef.current?.api.getDisplayedRowAtIndex(event.rowIndex)?.setSelected(true, true);
  };

  const confirmarEdicion = async () => {
    const actual = edicionRef.current;
    if (!actual || guardandoRef.current) return;
    gridRef.current?.api.stopEditing(false);
    const filaActual = filasRef.current.find((f) => f._id === actual.id);
    if (!filaActual) {
      setEdicion(null);
      return;
    }
    guardandoRef.current = true;
    try {
      if (actual.esNueva) {
        if (esPersistido) await onAgregarFila?.(filaActual);
      } else if (esPersistido) {
        await onCeldaEditada?.(filaActual);
      }
    } catch {
      // Si falla el guardado (p. ej. un campo requerido no capturado), se
      // conserva el borrador (misma fila, mismo `esNueva`) para reintentar —
      // si aquí se limpiara `edicion`, un reintento posterior de una fila
      // nueva fallida se trataría como edición de una existente, e
      // intentaría actualizar un id que el backend nunca llegó a crear.
      guardandoRef.current = false;
      return;
    }
    guardandoRef.current = false;
    setEdicion(null);
    const nodo = gridRef.current?.api.getRowNode(actual.id);
    if (nodo) gridRef.current?.api.redrawRows({ rowNodes: [nodo] });
  };

  const cancelarEdicion = () => {
    const actual = edicionRef.current;
    if (!actual || guardandoRef.current) return;
    gridRef.current?.api.stopEditing(true);
    if (actual.esNueva) {
      setFilas((prev) => prev.filter((f) => f._id !== actual.id));
    } else {
      setFilas((prev) => prev.map((f) => (f._id === actual.id ? actual.original : f)));
    }
    setEdicion(null);
  };

  const onCellEditingStarted = (event: CellEditingStartedEvent<Fila>) => {
    const id = event.data?._id;
    if (!id) return;
    const actual = edicionRef.current;
    if (actual && actual.id !== id) {
      // Solo una fila a la vez: cancela el intento de editar otra mientras hay una edición pendiente.
      gridRef.current?.api.stopEditing(true);
      return;
    }
    if (!actual && !pendienteRef.current) {
      pendienteRef.current = { id, original: { ...event.data! } };
    }
  };

  const onCellEditingStopped = () => {
    // Si terminó de editar sin que se activara el modo edición (no cambió nada), limpia el snapshot.
    if (!edicionRef.current) pendienteRef.current = null;
  };

  const onCellValueChanged = (event: CellValueChangedEvent<Fila>) => {
    if (edicionRef.current) return;
    const pendiente = pendienteRef.current;
    if (!pendiente || pendiente.id !== event.data._id || event.newValue === event.oldValue) return;
    setEdicion({ id: pendiente.id, esNueva: false, original: pendiente.original });
    const nodo = gridRef.current?.api.getRowNode(pendiente.id);
    if (nodo) gridRef.current?.api.redrawRows({ rowNodes: [nodo] });
  };

  useImperativeHandle(ref, () => ({
    agregarFila: () => {
      if (edicionRef.current) return;
      const nueva = filaVacia(config.columnas);
      setFilas((prev) => [...prev, nueva]);
      setEdicion({ id: nueva._id, esNueva: true, original: nueva });
    },
    eliminarFilaSeleccionada: () => {
      const seleccionadas = gridRef.current?.api.getSelectedRows() ?? [];
      if (seleccionadas.length === 0) return;
      setPendienteEliminar(seleccionadas);
    },
  }));

  const confirmarEliminacion = () => {
    if (!pendienteEliminar) return;
    const ids = pendienteEliminar.map((f) => f._id);
    if (esPersistido) {
      void onEliminarFilas?.(ids);
    } else {
      const idsSet = new Set(ids);
      setFilas((prev) => prev.filter((f) => !idsSet.has(f._id)));
    }
    setPendienteEliminar(null);
    onSelectionChange?.(false);
    onFilaSeleccionada?.(null);
  };

  const primerCampoTexto = config.columnas.find((c) => !c.numero)?.campo ?? config.columnas[0]?.campo;

  const columnDefs = useMemo<ColDef<Fila>[]>(
    () => [
      {
        colId: "__acciones",
        headerName: "",
        pinned: "left" as const,
        lockPosition: "left" as const,
        suppressMovable: true,
        width: 50,
        sortable: false,
        resizable: false,
        editable: false,
        filter: false,
        suppressHeaderMenuButton: true,
        suppressHeaderFilterButton: true,
        cellStyle: { padding: "0 4px" },
        cellRenderer: (params: ICellRendererParams<Fila>) => {
          if (edicion && params.data?._id === edicion.id) {
            return (
              <div className="flex h-full items-center gap-0.5">
                <button
                  type="button"
                  title="Confirmar"
                  onClick={() => void confirmarEdicion()}
                  className="rounded p-0.5 text-emerald-600 hover:bg-muted"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  title="Cancelar"
                  onClick={cancelarEdicion}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <X size={13} />
                </button>
              </div>
            );
          }
          if (resaltarSeleccionRef.current && params.data?._id === filaSeleccionadaIdRef.current) {
            return (
              <div className="flex h-full items-center justify-center" title="Fila seleccionada">
                <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.25)]" />
              </div>
            );
          }
          return null;
        },
      },
      ...config.columnas.map((c) => ({
        field: c.campo,
        headerName: c.encabezado,
        width: c.ancho,
        flex: c.ancho ? undefined : 1,
        minWidth: c.ancho ?? 160,
        editable: !c.soloLectura,
        filter: c.sinFiltro ? false : undefined,
        type: c.numero ? "rightAligned" : undefined,
        cellClass: cn(c.numero && "num", c.soloLectura && "text-muted-foreground"),
        valueGetter: c.booleano ? (params: { data?: Fila }) => (params.data?.[c.campo] ? "Sí" : "No") : undefined,
        valueSetter: c.booleano
          ? (params: { data: Fila; newValue: unknown }) => {
              params.data[c.campo] = params.newValue === "Sí";
              return true;
            }
          : undefined,
        valueFormatter: c.fecha
          ? (params: { value: unknown }) => formatearFecha(params.value as string)
          : c.sufijo
            ? (params: { value: unknown }) =>
                params.value === "" || params.value == null ? "" : `${params.value}${c.sufijo}`
            : undefined,
        cellEditor: c.booleano || c.opciones ? "agSelectCellEditor" : undefined,
        cellEditorParams:
          c.booleano || c.opciones
            ? (params: ICellEditorParams<Fila>) => ({
                values: c.booleano
                  ? SI_NO
                  : typeof c.opciones === "function"
                    ? c.opciones(params.data)
                    : c.opciones,
              })
            : undefined,
        cellRenderer: c.estrellas
          ? (params: ICellRendererParams<Fila>) => renderEstrellas(params.value)
          : c.indentarPor
            ? (params: ICellRendererParams<Fila>) => (
                <span style={{ paddingLeft: (Number(params.data?.[c.indentarPor!]) || 0) * 16 }}>
                  {params.value}
                </span>
              )
            : undefined,
      })),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ],
    [config.columnas, edicion?.id, edicion?.esNueva],
  );

  const getRowId = (params: GetRowIdParams<Fila>) => params.data._id;

  const rowClassRules = useMemo(
    () => ({
      "fila-nueva": (params: { data?: Fila }) =>
        edicionRef.current?.esNueva === true && params.data?._id === edicionRef.current?.id,
      "fila-editando": (params: { data?: Fila }) =>
        edicionRef.current?.esNueva === false && params.data?._id === edicionRef.current?.id,
    }),
    [],
  );

  return (
    <div className="flex h-full flex-col pr-[3px]">
      <style>{ESTILO_EDICION}</style>
      <div className="min-h-0 flex-1 overflow-hidden">
        <AgGridReact
          ref={gridRef}
          theme={obrixGridTheme}
          rowData={filas}
          columnDefs={columnDefs}
          getRowId={getRowId}
          // Sin esto, al llegar a la primera fila y seguir con flecha arriba
          // el foco (y, en modo "unica", la selección) salta al encabezado —
          // la navegación debe detenerse en la primera fila de datos.
          suppressHeaderFocus
          rowSelection={
            modoSeleccion === "unica"
              ? { mode: "singleRow", checkboxes: false, enableClickSelection: true }
              : { mode: "multiRow", checkboxes: true, headerCheckbox: false }
          }
          selectionColumnDef={modoSeleccion === "unica" ? undefined : { pinned: "left" }}
          onCellFocused={onCellFocused}
          onSelectionChanged={() => {
            const seleccionadas = gridRef.current?.api.getSelectedRows() ?? [];
            onSelectionChange?.(seleccionadas.length > 0);
            onFilaSeleccionada?.(seleccionadas[0] ?? null);
            setFilaSeleccionadaId(seleccionadas[0]?._id ?? null);
          }}
          onCellEditingStarted={onCellEditingStarted}
          onCellEditingStopped={onCellEditingStopped}
          onCellValueChanged={onCellValueChanged}
          rowClassRules={rowClassRules}
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
          suppressHorizontalScroll
          onGridReady={(params) => {
            params.api.sizeColumnsToFit();
            if (modoSeleccion === "unica" && params.api.getSelectedRows().length === 0) {
              const nodo = seleccionInicialId ? params.api.getRowNode(seleccionInicialId) : undefined;
              (nodo ?? params.api.getDisplayedRowAtIndex(0))?.setSelected(true, true);
            }
          }}
          onGridSizeChanged={(params) => params.api.sizeColumnsToFit()}
          animateRows
        />
      </div>

      <AlertDialog
        open={pendienteEliminar !== null}
        onOpenChange={(open) => {
          if (!open) setPendienteEliminar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendienteEliminar && pendienteEliminar.length === 1
                ? "¿Eliminar el registro seleccionado?"
                : `¿Eliminar los ${pendienteEliminar?.length ?? 0} registros seleccionados?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendienteEliminar && pendienteEliminar.length === 1 && primerCampoTexto
                ? `Se eliminará "${pendienteEliminar[0][primerCampoTexto]}". Esta acción no se puede deshacer.`
                : "Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={confirmarEliminacion}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
