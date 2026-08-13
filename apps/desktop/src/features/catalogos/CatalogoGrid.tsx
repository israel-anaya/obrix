import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type FilterFn,
  type RowSelectionState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Check, Search, Star, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { formatearFecha } from "@/lib/fecha";
import { cn } from "@/lib/utils";

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
  /** @deprecated Ya no aplica — el filtro por columna se reemplazó por un buscador global (ver `CatalogoGrid`). */
  sinFiltro?: boolean;
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
  /** Se dispara cuando `onAgregarFila`/`onCeldaEditada` rechaza — el grid conserva el borrador, pero no muestra el error por sí solo. */
  onErrorGuardado?: (mensaje: string) => void;
  /** Se dispara cuando `onAgregarFila`/`onCeldaEditada` resuelve sin error. */
  onGuardadoExitoso?: () => void;
  /** Se dispara al cancelar una edición o alta en curso (botón X) — para limpiar un error de guardado previo. */
  onEdicionCancelada?: () => void;
}

interface EstadoEdicion {
  id: string;
  esNueva: boolean;
  /** Copia tomada al empezar a editar — para poder revertir si se cancela. */
  original: Fila;
}

/**
 * Columnas `booleano` se editan/muestran como un combobox "Sí"/"No" (no
 * checkbox) — el valor subyacente sigue siendo `boolean`, ver `EditorCelda`.
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

/**
 * Texto formateado de una celda — mismo texto que ve el usuario (fecha con
 * `formatearFecha`, booleano como "Sí"/"No", sufijo aplicado). Lo reusan el
 * renderer de vista y el buscador global, para que nunca queden
 * desincronizados (buscar algo que se ve en pantalla siempre debe encontrarlo).
 */
function valorVisible(fila: Fila, columna: CatalogoColumnaDef): string {
  const valor = fila[columna.campo];
  if (columna.booleano) return valor ? "Sí" : "No";
  if (columna.fecha) return formatearFecha(valor as string);
  if (columna.sufijo) return valor === "" || valor == null ? "" : `${valor}${columna.sufijo}`;
  return valor == null ? "" : String(valor);
}

/** Si se pasa `valorInicial`, el editor arranca con ese valor (reemplazando el
 * de la celda) en vez del valor actual — caso "escribir para reemplazar". */
interface CeldaAbierta {
  filaId: string;
  campo: string;
  valorInicial?: string;
}

interface CatalogoTableMeta {
  edicion: EstadoEdicion | null;
  celdaAbierta: CeldaAbierta | null;
  /** Celda marcada con un solo click — solo visual, distinta de `celdaAbierta` (que sí está en edición). */
  celdaSeleccionada: { filaId: string; campo: string } | null;
  resaltarSeleccion: boolean;
  seleccionarCelda: (filaId: string, campo: string) => void;
  abrirCelda: (filaId: string, campo: string, valorInicial?: string) => void;
  confirmarCambioCelda: (filaId: string, campo: string, valor: string | number | boolean) => void;
  cerrarCelda: () => void;
  confirmarEdicion: () => void;
  cancelarEdicion: () => void;
}

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnSizingFeature,
  columnResizingFeature,
  tableMeta: {} as CatalogoTableMeta,
});

const columnHelper = createColumnHelper<typeof features, Fila>();

/** Vista de solo lectura de una celda — estrellas, indentado, o el texto formateado normal. */
function CeldaVista({ fila, columna }: { fila: Fila; columna: CatalogoColumnaDef }) {
  if (columna.estrellas) return renderEstrellas(fila[columna.campo]);
  const texto = valorVisible(fila, columna);
  const contenido = columna.indentarPor ? (
    <span style={{ paddingLeft: (Number(fila[columna.indentarPor]) || 0) * 16 }}>{texto}</span>
  ) : (
    texto
  );
  return <span className={cn(columna.numero && "block w-full text-right")}>{contenido}</span>;
}

/**
 * Editor inline de una celda — input de texto/número o `<select>` (booleano u
 * opciones). Commitea en blur/Enter/Tab; Escape descarta sin guardar.
 * Tab/Shift+Tab confirman y abren el editor de la siguiente/anterior columna
 * editable de la misma fila. Enter/Shift+Enter confirman y solo seleccionan
 * esa columna, sin abrir su editor (como en Excel). Nunca salta de fila.
 */
function EditorCelda({
  columna,
  fila,
  meta,
  columnas,
}: {
  columna: CatalogoColumnaDef;
  fila: Fila;
  meta: CatalogoTableMeta;
  columnas: CatalogoColumnaDef[];
}) {
  // Si `celdaAbierta` trae `valorInicial` (se abrió escribiendo directamente
  // sobre la celda seleccionada, sin doble click), arranca reemplazando el
  // valor existente — igual que Excel.
  const valorForzado = meta.celdaAbierta?.valorInicial;
  const valorInicial = valorForzado ?? fila[columna.campo];
  const [valor, setValor] = useState<string>(
    valorForzado !== undefined
      ? valorForzado
      : columna.booleano
        ? (valorInicial ? "Sí" : "No")
        : String(valorInicial ?? ""),
  );
  // Evita que el blur nativo disparado al desmontar este editor (p. ej. al
  // cerrar con Escape) vuelva a commitear un valor que el usuario descartó.
  const descartarRef = useRef(false);

  const commit = () => {
    if (descartarRef.current) return;
    let valorFinal: string | number | boolean = valor;
    if (columna.booleano) valorFinal = valor === "Sí";
    else if (columna.numero) valorFinal = Number(valor) || 0;
    meta.confirmarCambioCelda(fila._id, columna.campo, valorFinal);
  };

  const moverA = (delta: 1 | -1, abrirEditor: boolean) => {
    const editables = columnas.filter((c) => !c.soloLectura);
    const idxActual = editables.findIndex((c) => c.campo === columna.campo);
    const siguiente = editables[idxActual + delta];
    commit();
    // `celdaSeleccionada` no se actualiza sola al navegar con Tab/Enter — sin
    // esto, el ring de "celda seleccionada" se queda en la primera celda
    // editada en vez de seguir a donde realmente terminó la navegación.
    meta.seleccionarCelda(fila._id, siguiente ? siguiente.campo : columna.campo);
    if (siguiente && abrirEditor) meta.abrirCelda(fila._id, siguiente.campo);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === "Escape") {
      descartarRef.current = true;
      meta.cerrarCelda();
      return;
    }
    if (e.key === "Enter") {
      // A diferencia de Tab, Enter solo confirma y selecciona la siguiente
      // columna editable — no la abre en modo edición (como en Excel, donde
      // Enter mueve la selección pero no arranca la edición de la celda).
      e.preventDefault();
      moverA(e.shiftKey ? -1 : 1, false);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moverA(e.shiftKey ? -1 : 1, true);
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.currentTarget.tagName === "SELECT") {
      // Un `<select>` no usa ←/→ para nada (a diferencia de un input de
      // texto, donde mueven el cursor) — sin bloquear su comportamiento por
      // default, el navegador cae en desplazar el contenedor con scroll.
      e.preventDefault();
    }
  };

  const opciones = columna.booleano
    ? SI_NO
    : typeof columna.opciones === "function"
      ? columna.opciones(fila)
      : columna.opciones;

  const clase = "h-full w-full rounded-none border-none bg-background px-1 text-sm outline-none ring-1 ring-primary";

  if (opciones) {
    return (
      <select autoFocus value={valor} onChange={(e) => setValor(e.target.value)} onBlur={commit} onKeyDown={onKeyDown} className={clase}>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      autoFocus
      type={columna.numero ? "number" : "text"}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={clase}
    />
  );
}

function CeldaCatalogo({
  columna,
  fila,
  meta,
  columnas,
}: {
  columna: CatalogoColumnaDef;
  fila: Fila;
  meta: CatalogoTableMeta;
  columnas: CatalogoColumnaDef[];
}) {
  const abierta = meta.celdaAbierta?.filaId === fila._id && meta.celdaAbierta?.campo === columna.campo;
  if (!columna.soloLectura && abierta) {
    return <EditorCelda columna={columna} fila={fila} meta={meta} columnas={columnas} />;
  }
  const seleccionada = meta.celdaSeleccionada?.filaId === fila._id && meta.celdaSeleccionada?.campo === columna.campo;
  return (
    <div
      className={cn(
        "flex h-full min-h-[22px] items-center px-1 ring-inset",
        columna.soloLectura ? "text-muted-foreground" : "cursor-pointer",
        // Borde marcado tipo "celda activa" de Excel, no un resaltado tenue.
        seleccionada && "ring-2 ring-primary",
      )}
      onClick={() => meta.seleccionarCelda(fila._id, columna.campo)}
      onDoubleClick={columna.soloLectura ? undefined : () => meta.abrirCelda(fila._id, columna.campo)}
    >
      <CeldaVista fila={fila} columna={columna} />
    </div>
  );
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
    /**
     * Buscador controlado por el padre (para moverlo a su propia barra de
     * acciones, ver `Buscador`) — si se omite, el grid maneja su búsqueda
     * internamente y se dibuja su propia fila arriba de la tabla.
     */
    busqueda?: string;
    onBusquedaChange?: (busqueda: string) => void;
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
    onErrorGuardado,
    onGuardadoExitoso,
    onEdicionCancelada,
    busqueda: busquedaControlada,
    onBusquedaChange,
  },
  ref,
) {
  const esPersistido = filasIniciales !== undefined;
  const [filas, setFilas] = useState<Fila[]>(
    () => filasIniciales ?? [filaVacia(config.columnas), filaVacia(config.columnas)],
  );
  const [pendienteEliminar, setPendienteEliminar] = useState<Fila[] | null>(null);
  const [edicion, setEdicion] = useState<EstadoEdicion | null>(null);
  const [celdaAbierta, setCeldaAbierta] = useState<CeldaAbierta | null>(null);
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{ filaId: string; campo: string } | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [busquedaInterna, setBusquedaInterna] = useState("");
  const buscadorControlado = busquedaControlada !== undefined;
  const busqueda = buscadorControlado ? busquedaControlada : busquedaInterna;
  const setBusqueda = buscadorControlado ? onBusquedaChange! : setBusquedaInterna;
  const guardandoRef = useRef(false);
  const filaRefs = useRef(new Map<string, HTMLTableRowElement>());
  const celdaRefs = useRef(new Map<string, HTMLTableCellElement>());
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Alto real del `<thead>` (sticky) — para que las filas reserven ese
  // espacio al hacer scroll hacia ellas (`scroll-margin-top`) y no queden
  // tapadas por el encabezado al llegar a la primera fila.
  const [altoEncabezado, setAltoEncabezado] = useState(0);

  useLayoutEffect(() => {
    setAltoEncabezado(theadRef.current?.getBoundingClientRect().height ?? 0);
  }, []);

  useEffect(() => {
    if (filasIniciales) setFilas(filasIniciales);
  }, [filasIniciales]);

  const seleccionarCelda = (filaId: string, campo: string) => {
    if (edicion && edicion.id !== filaId) return;
    setCeldaSeleccionada({ filaId, campo });
  };

  const abrirCelda = (filaId: string, campo: string, valorInicial?: string) => {
    if (edicion && edicion.id !== filaId) return;
    setCeldaAbierta({ filaId, campo, valorInicial });
  };

  const cerrarCelda = () => setCeldaAbierta(null);

  const confirmarCambioCelda = (filaId: string, campo: string, valor: string | number | boolean) => {
    const filaActual = filas.find((f) => f._id === filaId);
    if (!filaActual || filaActual[campo] === valor) {
      setCeldaAbierta(null);
      return;
    }
    setFilas((prev) => prev.map((f) => (f._id === filaId ? { ...f, [campo]: valor } : f)));
    setCeldaAbierta(null);
    if (!edicion) {
      setEdicion({ id: filaId, esNueva: false, original: filaActual });
    }
  };

  const confirmarEdicion = async () => {
    if (!edicion || guardandoRef.current) return;
    setCeldaAbierta(null);
    const filaActual = filas.find((f) => f._id === edicion.id);
    if (!filaActual) {
      setEdicion(null);
      return;
    }
    // Al borrar una celda (p. ej. Delete sin escribir nada nuevo) el valor
    // puede quedar `null`/`undefined` — se sanea aquí, al guardar, para no
    // depender de cómo cada editor maneja ese caso.
    const filaSaneada: Fila = { ...filaActual };
    for (const col of config.columnas) {
      if (filaSaneada[col.campo] == null) {
        filaSaneada[col.campo] = col.numero ? 0 : "";
      }
    }
    setFilas((prev) => prev.map((f) => (f._id === edicion.id ? filaSaneada : f)));
    guardandoRef.current = true;
    try {
      if (edicion.esNueva) {
        if (esPersistido) await onAgregarFila?.(filaSaneada);
      } else if (esPersistido) {
        await onCeldaEditada?.(filaSaneada);
      }
    } catch (e) {
      // Si falla el guardado (p. ej. un campo requerido no capturado), se
      // conserva el borrador (misma fila, mismo `esNueva`) para reintentar —
      // si aquí se limpiara `edicion`, un reintento posterior de una fila
      // nueva fallida se trataría como edición de una existente, e
      // intentaría actualizar un id que el backend nunca llegó a crear.
      guardandoRef.current = false;
      onErrorGuardado?.(e instanceof Error ? e.message : String(e));
      return;
    }
    guardandoRef.current = false;
    setEdicion(null);
    onGuardadoExitoso?.();
  };

  const cancelarEdicion = () => {
    if (!edicion || guardandoRef.current) return;
    setCeldaAbierta(null);
    if (edicion.esNueva) {
      setFilas((prev) => prev.filter((f) => f._id !== edicion.id));
    } else {
      setFilas((prev) => prev.map((f) => (f._id === edicion.id ? edicion.original : f)));
    }
    setEdicion(null);
    onEdicionCancelada?.();
  };

  const meta: CatalogoTableMeta = {
    edicion,
    celdaAbierta,
    celdaSeleccionada,
    resaltarSeleccion,
    seleccionarCelda,
    abrirCelda,
    confirmarCambioCelda,
    cerrarCelda,
    confirmarEdicion: () => void confirmarEdicion(),
    cancelarEdicion,
  };

  // Compara contra el texto ya formateado de toda la fila (mismo texto que
  // ve el usuario: fecha con `formatearFecha`, "Sí"/"No", sufijo aplicado),
  // no contra los valores crudos — así buscar algo visible siempre lo encuentra.
  const filtroGlobal = useMemo<FilterFn<typeof features, Fila>>(
    () => (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      const texto = config.columnas
        .map((c) => valorVisible(row.original, c))
        .join(" ")
        .toLowerCase();
      return texto.includes(String(filterValue).toLowerCase());
    },
    [config.columnas],
  );

  const columns = useMemo(() => {
    const cols: ColumnDef<typeof features, Fila, any>[] = [];
    if (modoSeleccion === "multiple") {
      cols.push(
        columnHelper.display({
          id: "__seleccion",
          header: "",
          size: 36,
          minSize: 36,
          enableResizing: false,
          cell: (ctx) => (
            <div className="flex h-full items-center justify-center">
              <input
                type="checkbox"
                checked={ctx.row.getIsSelected()}
                onChange={(e) => ctx.row.toggleSelected(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ),
        }),
      );
    }
    cols.push(
      columnHelper.display({
        id: "__acciones",
        header: "",
        size: 50,
        minSize: 50,
        enableResizing: false,
        cell: (ctx) => {
          const m = ctx.table.options.meta!;
          if (m.edicion && ctx.row.original._id === m.edicion.id) {
            return (
              <div className="flex h-full items-center justify-center gap-0.5">
                <button
                  type="button"
                  title="Confirmar"
                  onClick={(e) => {
                    e.stopPropagation();
                    m.confirmarEdicion();
                  }}
                  className="rounded p-0.5 text-emerald-600 hover:bg-muted"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  title="Cancelar"
                  onClick={(e) => {
                    e.stopPropagation();
                    m.cancelarEdicion();
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <X size={13} />
                </button>
              </div>
            );
          }
          if (m.resaltarSeleccion && ctx.row.getIsSelected()) {
            return (
              <div className="flex h-full items-center justify-center" title="Fila seleccionada">
                <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.25)]" />
              </div>
            );
          }
          return null;
        },
      }),
    );
    for (const c of config.columnas) {
      cols.push(
        columnHelper.accessor((fila) => fila[c.campo], {
          id: c.campo,
          header: c.encabezado,
          size: c.ancho ?? 160,
          minSize: c.ancho ?? 160,
          enableGlobalFilter: true,
          cell: (ctx) => <CeldaCatalogo columna={c} fila={ctx.row.original} meta={ctx.table.options.meta!} columnas={config.columnas} />,
        }),
      );
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.columnas, modoSeleccion]);

  // Las columnas `__` (checkbox de selección, botones de acción) van ancladas
  // al borde izquierdo, una tras otra — cada una con el offset acumulado del
  // ancho de las anteriores, no todas en `left: 0` (eso las haría superponerse).
  const { anclaIzquierda, anchoAncladoTotal } = useMemo(() => {
    const mapa = new Map<string, number>();
    let offset = 0;
    for (const c of columns) {
      const id = String(c.id ?? "");
      if (!id.startsWith("__")) break;
      mapa.set(id, offset);
      offset += c.size ?? 0;
    }
    return { anclaIzquierda: mapa, anchoAncladoTotal: offset };
  }, [columns]);

  const table = useTable(
    {
      features,
      data: filas,
      columns,
      getRowId: (f) => f._id,
      state: { rowSelection, globalFilter: busqueda },
      onRowSelectionChange: setRowSelection,
      onGlobalFilterChange: (updater) => setBusqueda(typeof updater === "function" ? updater(busqueda) : updater),
      enableMultiRowSelection: modoSeleccion === "multiple",
      globalFilterFn: filtroGlobal,
      getColumnCanGlobalFilter: (column) => column.id !== "__acciones" && column.id !== "__seleccion",
      columnResizeMode: "onChange",
      enableColumnResizing: true,
      meta,
    },
    (state) => ({ rowSelection: state.rowSelection, globalFilter: state.globalFilter }),
  );

  const filasVisibles = table.getRowModel().rows;

  // Mantiene siempre exactamente una fila seleccionada en modo "unica": al
  // montar (o remontar, p. ej. al abrir un panel lateral) restaura
  // `seleccionInicialId` o cae en la primera; si la selección se vacía más
  // adelante (p. ej. se borró la fila seleccionada), vuelve a caer en la
  // primera. Un solo efecto evita la carrera de dos efectos leyendo el mismo
  // `rowSelection` (aún no actualizado) en el mismo commit.
  useEffect(() => {
    if (modoSeleccion !== "unica") return;
    if (Object.keys(rowSelection).length > 0) return;
    if (filasVisibles.length === 0) return;
    const objetivo = seleccionInicialId ? filasVisibles.find((r) => r.original._id === seleccionInicialId) : undefined;
    (objetivo ?? filasVisibles[0]).toggleSelected(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoSeleccion, filas, rowSelection, seleccionInicialId]);

  useEffect(() => {
    onSelectionChange?.(Object.keys(rowSelection).length > 0);
    const seleccionadas = table.getSelectedRowModel().rows;
    onFilaSeleccionada?.(seleccionadas[0]?.original ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection]);

  // Con muchos registros, la fila nueva o la que se empieza a editar puede
  // quedar fuera del área visible — hace scroll hasta ella.
  useEffect(() => {
    if (!edicion) return;
    filaRefs.current.get(edicion.id)?.scrollIntoView({ block: "nearest" });
  }, [edicion]);

  // La navegación horizontal (←/→) solo mueve `celdaSeleccionada` — si la
  // columna destino queda fuera del área visible, hay que traerla a la vista.
  useEffect(() => {
    if (!celdaSeleccionada) return;
    const clave = `${celdaSeleccionada.filaId}:${celdaSeleccionada.campo}`;
    celdaRefs.current.get(clave)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [celdaSeleccionada]);

  // Al confirmar (Enter/blur) o cancelar (Escape) la edición de una celda sin
  // saltar a otra (eso lo maneja `moverA` con Tab), el editor se desmonta y el
  // foco se pierde del todo — sin nada enfocado dentro del grid, las flechas
  // dejan de llegarle a `onKeyDownContenedor`. Se regresa el foco a la fila.
  useEffect(() => {
    if (celdaAbierta) return;
    const filaId = celdaSeleccionada?.filaId;
    if (!filaId) return;
    filaRefs.current.get(filaId)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celdaAbierta]);

  const onKeyDownContenedor = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const objetivo = e.target as HTMLElement;
    if (objetivo.tagName === "INPUT" || objetivo.tagName === "SELECT" || objetivo.tagName === "TEXTAREA") {
      // Al mover el cursor de texto con ←/→ dentro del editor, el navegador
      // puede intentar hacer scroll del contenedor para "mantener visible" el
      // caret — la celda ya es visible (por eso se está editando), así que
      // se revierte cualquier scroll incidental que eso dispare.
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

    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && modoSeleccion === "unica") {
      // Con una fila en borrador (agregando/editando), las flechas ↑/↓ no
      // deben moverse a otra fila — solo ←/→ dentro de la misma.
      if (edicion) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const idxActual = filasVisibles.findIndex((r) => r.getIsSelected());
      const siguiente = filasVisibles[idxActual + (e.key === "ArrowDown" ? 1 : -1)];
      if (!siguiente) return;
      siguiente.toggleSelected(true);
      if (celdaSeleccionada) setCeldaSeleccionada({ filaId: siguiente.original._id, campo: celdaSeleccionada.campo });
      const nodo = filaRefs.current.get(siguiente.original._id);
      nodo?.focus();
      nodo?.scrollIntoView({ block: "nearest" });
      return;
    }

    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && celdaSeleccionada) {
      e.preventDefault();
      const idxActual = config.columnas.findIndex((c) => c.campo === celdaSeleccionada.campo);
      const siguienteCol = config.columnas[idxActual + (e.key === "ArrowRight" ? 1 : -1)];
      if (!siguienteCol) return;
      setCeldaSeleccionada({ filaId: celdaSeleccionada.filaId, campo: siguienteCol.campo });
      return;
    }

    // F2 abre el editor de la celda seleccionada conservando su valor actual
    // (a diferencia de teclear directamente, que lo reemplaza) — igual que Excel.
    if (!celdaAbierta && celdaSeleccionada && e.key === "F2") {
      const columna = config.columnas.find((c) => c.campo === celdaSeleccionada.campo);
      if (columna && !columna.soloLectura) {
        e.preventDefault();
        abrirCelda(celdaSeleccionada.filaId, celdaSeleccionada.campo);
      }
      return;
    }

    // Escribir directamente sobre una celda seleccionada (sin doble click)
    // abre el editor reemplazando el valor — igual que Excel. No aplica a
    // columnas de solo lectura ni a las que se editan con un `<select>`
    // (booleano/opciones), donde "reemplazar tecleando" no tiene sentido.
    if (!celdaAbierta && celdaSeleccionada && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const columna = config.columnas.find((c) => c.campo === celdaSeleccionada.campo);
      if (columna && !columna.soloLectura && !columna.booleano && !columna.opciones) {
        e.preventDefault();
        abrirCelda(celdaSeleccionada.filaId, celdaSeleccionada.campo, e.key);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    agregarFila: () => {
      if (edicion) return;
      const nueva = filaVacia(config.columnas);
      setFilas((prev) => [...prev, nueva]);
      setEdicion({ id: nueva._id, esNueva: true, original: nueva });
    },
    eliminarFilaSeleccionada: () => {
      const seleccionadas = table.getSelectedRowModel().rows.map((r) => r.original);
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

  // Las columnas `__seleccion`/`__acciones` no viven en `config.columnas` —
  // siempre usan un ancho fijo (el que trae su `size` de columnDef), nunca
  // flex-fill. Las columnas de datos sin `ancho` propio sí llenan el espacio
  // restante, salvo que el usuario ya las haya redimensionado a mano.
  const estiloColumna = (columnId: string, size: number, seRedimensiono: boolean): React.CSSProperties => {
    if (columnId.startsWith("__") || seRedimensiono) return { flex: `0 0 ${size}px`, width: size };
    const ancho = config.columnas.find((c) => c.campo === columnId)?.ancho;
    if (ancho) return { flex: `0 0 ${ancho}px`, width: ancho };
    return { flex: "1 1 0%", minWidth: ancho ?? 160 };
  };

  // La primera columna queda anclada (`sticky left-0`) para que el checkbox
  // de selección o los botones ✓/✗ sigan visibles al hacer scroll horizontal
  // — necesita un fondo 100% opaco (no un tinte translúcido como `.../15`,
  // que dejaría ver las columnas que pasan por debajo) para taparlas del todo.
  const claseFondoFila = (fila: Fila): string =>
    cn(
      "bg-background",
      edicion?.esNueva && fila._id === edicion.id && "bg-emerald-50",
      edicion && !edicion.esNueva && fila._id === edicion.id && "bg-amber-50",
    );

  return (
    <div className="flex h-full flex-col">
      {!buscadorControlado && (
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="h-6 border-none px-0 py-0 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
      )}
      <div ref={scrollRef} onKeyDown={onKeyDownContenedor} className="min-h-0 flex-1 overflow-auto">
        <table.Subscribe selector={(state) => state.columnSizing}>
          {(columnSizing) => (
            <table
              className="w-full border-collapse border-l border-t border-border text-sm"
              style={{ width: table.getTotalSize() }}
            >
              <thead ref={theadRef} className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="flex">
                    {headerGroup.headers.map((header) => {
                      const esOrdenable = !header.column.id.startsWith("__");
                      const orden = header.column.getIsSorted();
                      const anclaLeft = anclaIzquierda.get(header.column.id);
                      return (
                        <th
                          key={header.id}
                          style={{
                            ...estiloColumna(header.column.id, header.getSize(), header.column.id in columnSizing),
                            ...(anclaLeft !== undefined && { left: anclaLeft }),
                          }}
                          className={cn(
                            "relative border-b border-r border-border px-1.5 py-1.5 text-left text-xs font-medium text-muted-foreground",
                            anclaLeft !== undefined && "sticky z-20 bg-muted",
                          )}
                        >
                          {esOrdenable ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={header.column.getToggleSortingHandler()}
                              className="flex items-center gap-1 hover:text-foreground"
                            >
                              <table.FlexRender header={header} />
                              {orden === "asc" && <ArrowUp size={11} />}
                              {orden === "desc" && <ArrowDown size={11} />}
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                          {header.column.getCanResize() && (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className={cn(
                                "absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary/50",
                                header.column.getIsResizing() && "bg-primary",
                              )}
                            />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {filasVisibles.map((row) => (
                  <tr
                    key={row.id}
                    ref={(el) => {
                      if (el) filaRefs.current.set(row.original._id, el);
                      else filaRefs.current.delete(row.original._id);
                    }}
                    style={{ scrollMarginTop: altoEncabezado }}
                    tabIndex={modoSeleccion === "unica" ? 0 : undefined}
                    onClick={
                      modoSeleccion === "unica"
                        ? (e) => {
                            if (edicion && edicion.id !== row.original._id) return;
                            row.toggleSelected(true);
                            e.currentTarget.focus();
                          }
                        : undefined
                    }
                    className={cn(
                      "flex outline-none",
                      edicion?.esNueva && row.original._id === edicion.id && "bg-emerald-500/15",
                      edicion && !edicion.esNueva && row.original._id === edicion.id && "bg-amber-500/15",
                      modoSeleccion === "unica" && "cursor-pointer",
                    )}
                  >
                    {row.getAllCells().map((cell) => {
                      const anclaLeft = anclaIzquierda.get(cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          ref={(el) => {
                            const clave = `${row.original._id}:${cell.column.id}`;
                            if (el) celdaRefs.current.set(clave, el);
                            else celdaRefs.current.delete(clave);
                          }}
                          style={{
                            ...estiloColumna(cell.column.id, cell.column.getSize(), cell.column.id in columnSizing),
                            ...(anclaLeft !== undefined ? { left: anclaLeft } : { scrollMarginLeft: anchoAncladoTotal }),
                          }}
                          className={cn(
                            "overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border/70 py-0.5 text-xs",
                            cell.column.id.startsWith("__") && "px-0",
                            anclaLeft !== undefined && cn("sticky z-10", claseFondoFila(row.original)),
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filasVisibles.length === 0 && (
                  <tr className="flex" style={{ width: "100%" }}>
                    <td colSpan={columns.length} className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Sin registros.
                    </td>
                  </tr>
                )}
                {/* Fila espaciadora, no editable — evita que el scrollbar horizontal
                    (que se dibuja encima del contenido, no reserva su propio espacio
                    en algunos navegadores) tape la última fila real. */}
                <tr aria-hidden className="flex" style={{ width: "100%" }}>
                  <td colSpan={columns.length} style={{ height: 25 }} />
                </tr>
              </tbody>
            </table>
          )}
        </table.Subscribe>
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
