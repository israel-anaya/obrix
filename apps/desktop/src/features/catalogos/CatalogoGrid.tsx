import { createContext, forwardRef, memo, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { catalogoClipboardActivo, setCatalogoClipboardActivo, type CatalogoClipboard } from "@/features/catalogos/catalogoClipboard";
import { createPortal } from "react-dom";
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
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Check, ChevronDown, Loader2, Search, Star, X } from "lucide-react";
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
  /** Ancho inicial en px — obligatorio; el usuario puede redimensionar a mano. */
  ancho: number;
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

function primerCampo(columnas: CatalogoColumnaDef[]): string | undefined {
  return columnas.find((c) => !c.soloLectura)?.campo ?? columnas[0]?.campo;
}

/** Acepta decimal con coma o punto (`1,5` / `1.5`) y miles al estilo México (`1.234,56`). */
function parsearNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return 0;
  const tieneComa = t.includes(",");
  const tienePunto = t.includes(".");
  let normalizado = t;
  if (tieneComa && tienePunto) {
    normalizado =
      t.lastIndexOf(",") > t.lastIndexOf(".")
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "");
  } else if (tieneComa) {
    normalizado = t.replace(",", ".");
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function valorVacio(columna: CatalogoColumnaDef): string | number | boolean {
  if (columna.booleano) return false;
  if (columna.numero) return 0;
  return "";
}

/** Intenta asociar el mensaje de error del backend a columnas por `campo` o encabezado. */
function camposDesdeMensaje(mensaje: string, columnas: CatalogoColumnaDef[], fila: Fila): string[] {
  const lower = mensaje.toLowerCase();
  const porNombre = columnas
    .filter((c) => !c.soloLectura && (lower.includes(c.campo.toLowerCase()) || lower.includes(c.encabezado.toLowerCase())))
    .map((c) => c.campo);
  if (porNombre.length > 0) return porNombre;
  const pareceRequerido = /vacío|vacio|required|not null|obligatori|empty/i.test(mensaje);
  if (!pareceRequerido) return [];
  return columnas
    .filter((c) => {
      if (c.soloLectura || c.booleano || c.numero) return false;
      const v = fila[c.campo];
      return v === "" || v == null;
    })
    .map((c) => c.campo);
}

function escaparTsv(valor: string): string {
  if (/[\t\n\r"]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

function filaATsv(fila: Fila, columnas: CatalogoColumnaDef[]): string {
  return columnas.map((c) => escaparTsv(valorVisible(fila, c))).join("\t");
}

function parsearTsv(texto: string): string[][] {
  const normalizado = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lineas = normalizado.split("\n");
  if (lineas.at(-1) === "") lineas.pop();
  return lineas
    .map((linea) => linea.split("\t"))
    .filter((linea) => linea.some((c) => c.trim() !== ""));
}

function aplicarLineaAFila(
  fila: Fila,
  linea: string[],
  startIdx: number,
  columnas: CatalogoColumnaDef[],
): { fila: Fila; changed: boolean } {
  let next = { ...fila };
  let changed = false;
  for (let i = 0; i < linea.length; i++) {
    const col = columnas[startIdx + i];
    if (!col) break;
    const parsed = parsearValorPegado(linea[i] ?? "", col, next);
    if (parsed === null || next[col.campo] === parsed) continue;
    next = { ...next, [col.campo]: parsed };
    changed = true;
  }
  return { fila: next, changed };
}

function parsearValorPegado(
  texto: string,
  columna: CatalogoColumnaDef,
  fila: Fila,
): string | number | boolean | null {
  if (columna.soloLectura) return null;
  const crudo = texto.trim();
  if (columna.booleano) {
    const t = crudo.toLowerCase();
    if (["sí", "si", "true", "1", "yes"].includes(t)) return true;
    if (["no", "false", "0"].includes(t)) return false;
    return null;
  }
  if (columna.numero || columna.estrellas) {
    const n = parsearNumero(crudo);
    if (n === null) return null;
    if (columna.estrellas) return Math.min(5, Math.max(0, n));
    return n;
  }
  const opciones = typeof columna.opciones === "function" ? columna.opciones(fila) : columna.opciones;
  if (opciones) {
    return opciones.find((o) => o.toLowerCase() === crudo.toLowerCase()) ?? null;
  }
  if (columna.sufijo && crudo.endsWith(columna.sufijo)) {
    return crudo.slice(0, -columna.sufijo.length);
  }
  return texto;
}

async function escribirClipboard(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/**
 * Si hay un borrador en curso, el padre puede mandar `filasIniciales` nuevas
 * (p. ej. al resolver nombres de usuario) sin pisar lo que el usuario está editando.
 * Durante el guardado se acepta la lista del padre tal cual — el alta persistida
 * suele llegar con otro `_id` que el UUID local.
 */
function fusionarFilas(prev: Fila[], siguientes: Fila[], edicion: EstadoEdicion | null, guardando: boolean): Fila[] {
  if (!edicion || guardando) return siguientes;
  const borrador = prev.find((f) => f._id === edicion.id);
  if (!borrador) return siguientes;
  if (edicion.esNueva || !siguientes.some((f) => f._id === edicion.id)) {
    return [...siguientes, borrador];
  }
  return siguientes.map((f) => (f._id === edicion.id ? borrador : f));
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
 * Columnas `booleano` se muestran como checkbox (el valor sigue siendo
 * `boolean`). El cambio entra al borrador de la fila; persiste con ✓.
 */
const ESTRELLA_VACIA = "text-muted-foreground/30";
const ESTRELLA_LLENA = "fill-amber-400 text-amber-400";
const ALTO_FILA = 26;
/** Espera al primer eco, alineada al KeyboardDelay típico del SO. */
const FLECHA_REPEAT_DELAY_MS = 400;
/** ~25 Hz una vez que el hold arranca — no el flood de `keydown.repeat`. */
const FLECHA_REPEAT_MS = 40;

type Flecha = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function esFlecha(key: string): key is Flecha {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

function renderEstrellas(valor: unknown, onElegir?: (n: number) => void) {
  const numero = Number(valor);
  const redondeado = Number.isFinite(numero) && numero > 0 ? Math.round(numero * 2) / 2 : 0;
  return (
    <div
      className="flex h-full items-center gap-0.5"
      title={Number.isFinite(numero) && numero > 0 ? String(valor) : undefined}
      onClick={onElegir ? (e) => e.stopPropagation() : undefined}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const relleno = Math.min(Math.max(redondeado - i, 0), 1);
        const clase = relleno === 1 ? ESTRELLA_LLENA : ESTRELLA_VACIA;
        const icono =
          relleno > 0 && relleno < 1 ? (
            <span className="relative inline-block" style={{ width: 13, height: 13 }}>
              <Star size={13} className={cn("absolute inset-0", ESTRELLA_VACIA)} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
                <Star size={13} className={ESTRELLA_LLENA} />
              </span>
            </span>
          ) : (
            <Star size={13} className={clase} />
          );
        if (!onElegir) return <span key={i}>{icono}</span>;
        return (
          <button
            key={i}
            type="button"
            title={`${i + 1}`}
            className="rounded-sm p-0 hover:scale-110"
            onClick={(e) => {
              e.stopPropagation();
              onElegir(i + 1);
            }}
          >
            {icono}
          </button>
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
  resaltarSeleccion: boolean;
  guardando: boolean;
  seleccionarCelda: (filaId: string, campo: string) => void;
  abrirCelda: (filaId: string, campo: string, valorInicial?: string) => void;
  confirmarCambioCelda: (filaId: string, campo: string, valor: string | number | boolean) => void;
  cerrarCelda: () => void;
  confirmarEdicion: () => void;
  cancelarEdicion: () => void;
  camposError: ReadonlySet<string>;
  errorGuardado: string | null;
}

type CeldaSel = { filaId: string; campo: string } | null;

interface Store<T> {
  subscribe: (fn: () => void) => () => void;
  get: () => T;
  set: (next: T) => void;
}

function crearStore<T>(inicial: T): Store<T> {
  let valor = inicial;
  const listeners = new Set<() => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    get: () => valor,
    set(next) {
      valor = next;
      listeners.forEach((fn) => fn());
    },
  };
}

function crearStoreSeleccion(): Store<CeldaSel> {
  const store = crearStore<CeldaSel>(null);
  return {
    subscribe: store.subscribe,
    get: store.get,
    set(next) {
      const prev = store.get();
      if (prev?.filaId === next?.filaId && prev?.campo === next?.campo) return;
      store.set(next);
    },
  };
}

type ChromeGrid = {
  edicion: EstadoEdicion | null;
  guardando: boolean;
  camposError: ReadonlySet<string>;
  errorGuardado: string | null;
  resaltarSeleccion: boolean;
};

type GridUi = {
  seleccion: Store<CeldaSel>;
  abierta: Store<CeldaAbierta | null>;
  chrome: Store<ChromeGrid>;
  meta: { current: CatalogoTableMeta };
};

const GridUiContext = createContext<GridUi | null>(null);

function useGridUi(): GridUi {
  const ctx = useContext(GridUiContext);
  if (!ctx) throw new Error("GridUiContext");
  return ctx;
}

function useCeldaSeleccionada(filaId: string, campo: string) {
  const { seleccion } = useGridUi();
  return useSyncExternalStore(seleccion.subscribe, () => {
    const s = seleccion.get();
    return !!s && s.filaId === filaId && s.campo === campo;
  });
}

function useFilaActiva(filaId: string) {
  const { seleccion } = useGridUi();
  return useSyncExternalStore(seleccion.subscribe, () => seleccion.get()?.filaId === filaId);
}

function useCampoActivo(campo: string) {
  const { seleccion } = useGridUi();
  return useSyncExternalStore(seleccion.subscribe, () => seleccion.get()?.campo === campo);
}

function useCeldaAbierta(filaId: string, campo: string) {
  const { abierta } = useGridUi();
  return useSyncExternalStore(abierta.subscribe, () => {
    const a = abierta.get();
    return a?.filaId === filaId && a?.campo === campo ? a : null;
  });
}

function useBloqueada(filaId: string) {
  const { chrome } = useGridUi();
  return useSyncExternalStore(chrome.subscribe, () => {
    const e = chrome.get().edicion;
    return !!e && e.id !== filaId;
  });
}

function useGuardando() {
  const { chrome } = useGridUi();
  return useSyncExternalStore(chrome.subscribe, () => chrome.get().guardando);
}

function useErrorCampo(filaId: string, campo: string) {
  const { chrome } = useGridUi();
  return useSyncExternalStore(chrome.subscribe, () => {
    const c = chrome.get();
    return !!(c.edicion?.id === filaId && c.camposError.has(campo));
  });
}

function useEsBorrador(filaId: string) {
  const { chrome } = useGridUi();
  return useSyncExternalStore(chrome.subscribe, () => chrome.get().edicion?.id === filaId);
}

function useClaseBorrador(filaId: string) {
  const { chrome } = useGridUi();
  return useSyncExternalStore(chrome.subscribe, () => {
    const e = chrome.get().edicion;
    if (e?.id !== filaId) return "";
    return e.esNueva ? "bg-emerald-50 dark:bg-emerald-950/60" : "bg-amber-50 dark:bg-amber-950/60";
  });
}

function useResaltarPunto(filaId: string, filaSeleccionada: boolean) {
  const { chrome } = useGridUi();
  return useSyncExternalStore(chrome.subscribe, () => chrome.get().resaltarSeleccion && filaSeleccionada && chrome.get().edicion?.id !== filaId);
}

const CHROME_VACIO: ChromeGrid = {
  edicion: null,
  guardando: false,
  camposError: new Set(),
  errorGuardado: null,
  resaltarSeleccion: false,
};

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

/** Vista de una celda — checkbox, estrellas, indentado, o el texto formateado. */
function CeldaVista({
  fila,
  columna,
  onToggleBooleano,
  onEstrella,
}: {
  fila: Fila;
  columna: CatalogoColumnaDef;
  onToggleBooleano?: () => void;
  onEstrella?: (n: number) => void;
}) {
  if (columna.estrellas) return renderEstrellas(fila[columna.campo], onEstrella);
  if (columna.booleano) {
    return (
      <div className="flex h-full w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={Boolean(fila[columna.campo])}
          disabled={!onToggleBooleano}
          onChange={() => onToggleBooleano?.()}
          className="cursor-pointer disabled:cursor-default"
        />
      </div>
    );
  }
  const texto = valorVisible(fila, columna);
  const contenido = columna.indentarPor ? (
    <span style={{ paddingLeft: (Number(fila[columna.indentarPor]) || 0) * 16 }}>{texto}</span>
  ) : (
    texto
  );
  return (
    <span
      title={texto || undefined}
      className={cn("block min-w-0 truncate", columna.numero && "w-full text-right tabular-nums")}
    >
      {contenido}
    </span>
  );
}

/**
 * Editor inline de una celda — input de texto/número o `<select>` (booleano u
 * opciones). Commitea en blur/Enter/Tab; Escape descarta sin guardar.
 * Tab/Shift+Tab confirman y abren el editor de la siguiente/anterior columna
 * editable de la misma fila. Enter/Shift+Enter confirman y solo seleccionan
 * esa columna, sin abrir su editor. Nunca salta de fila (el commit es por fila,
 * con ✓/✗). Ctrl+Enter confirma la fila entera.
 */
function ComboboxCelda({
  opciones,
  valorInicial,
  filtrarAlAbrir = false,
  clase,
  onElegir,
  onDescartar,
  onTab,
  onEnter,
  onConfirmarFila,
}: {
  opciones: readonly string[];
  valorInicial: string;
  /** True si se abrió tecleando (reemplazo); F2/clic muestran la lista completa. */
  filtrarAlAbrir?: boolean;
  clase: string;
  onElegir: (valor: string) => void;
  onDescartar: () => void;
  onTab: (shift: boolean) => void;
  onEnter: (shift: boolean) => void;
  onConfirmarFila: () => void;
}) {
  const [texto, setTexto] = useState(valorInicial);
  const [filtrar, setFiltrar] = useState(filtrarAlAbrir);
  const [activo, setActivo] = useState(() => Math.max(0, opciones.findIndex((o) => o === valorInicial)));
  const descartarRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const coincidencias = opciones.filter((o) => o.toLowerCase().includes(texto.trim().toLowerCase()));
  const visibles = filtrar ? coincidencias : opciones;
  const ultimo = Math.max(visibles.length - 1, 0);

  useLayoutEffect(() => {
    const lista = listaRef.current;
    const item = lista?.querySelector("[data-combo-activo]") as HTMLElement | null;
    if (!lista || !item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < lista.scrollTop) lista.scrollTop = top;
    else if (bottom > lista.scrollTop + lista.clientHeight) lista.scrollTop = bottom - lista.clientHeight;
  }, [activo, visibles.length]);

  useLayoutEffect(() => {
    const medir = () => setRect(inputRef.current?.getBoundingClientRect() ?? null);
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, []);

  const canon = (t: string) => opciones.find((o) => o.toLowerCase() === t.trim().toLowerCase()) ?? null;

  const elegir = (valor: string) => {
    if (descartarRef.current) return;
    descartarRef.current = true;
    onElegir(valor);
  };

  const commitFiltro = (): boolean => {
    if (descartarRef.current) return false;
    const exacto = canon(texto);
    if (exacto) {
      elegir(exacto);
      return true;
    }
    const resaltada = visibles[activo] ?? visibles[0];
    if (resaltada && (texto.trim() !== "" || !filtrar)) {
      elegir(resaltada);
      return true;
    }
    if (valorInicial && opciones.includes(valorInicial) && texto.trim() === "") {
      elegir(valorInicial);
      return true;
    }
    descartarRef.current = true;
    onDescartar();
    return false;
  };

  const maxLista = 192;
  const abrirArriba = rect ? window.innerHeight - rect.bottom < maxLista && rect.top > window.innerHeight - rect.bottom : false;

  return (
    <>
      <div className="relative flex h-full min-w-0 items-center">
        <input
          ref={inputRef}
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setFiltrar(true);
            setActivo(0);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            if (!descartarRef.current) commitFiltro();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              descartarRef.current = true;
              onDescartar();
              return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S")) {
              e.preventDefault();
              if (commitFiltro()) onConfirmarFila();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((i) => Math.min(ultimo, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "PageDown") {
              e.preventDefault();
              setActivo((i) => Math.min(ultimo, i + 8));
              return;
            }
            if (e.key === "PageUp") {
              e.preventDefault();
              setActivo((i) => Math.max(0, i - 8));
              return;
            }
            if (e.key === "Home") {
              e.preventDefault();
              setActivo(0);
              return;
            }
            if (e.key === "End") {
              e.preventDefault();
              setActivo(ultimo);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const elegido = visibles[activo] ?? canon(texto);
              if (elegido) elegir(elegido);
              else if (!commitFiltro()) return;
              onEnter(e.shiftKey);
              return;
            }
            if (e.key === "Tab") {
              e.preventDefault();
              if (commitFiltro()) onTab(e.shiftKey);
            }
          }}
          className={cn(clase, "pr-5")}
        />
        <ChevronDown size={12} className="pointer-events-none absolute right-0.5 text-muted-foreground" />
      </div>
      {rect &&
        createPortal(
          <ul
            ref={listaRef}
            className="fixed z-[400] max-h-48 overflow-auto border border-neutral-300 bg-white py-0.5 text-xs text-neutral-900 shadow-md"
            style={{
              top: abrirArriba ? undefined : rect.bottom,
              bottom: abrirArriba ? window.innerHeight - rect.top : undefined,
              left: rect.left,
              width: Math.max(rect.width, 160),
            }}
          >
            {visibles.length === 0 ? (
              <li className="px-2 py-1 text-neutral-500">Sin coincidencias</li>
            ) : (
              visibles.map((o, i) => (
                <li key={o}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full px-2 py-1 text-left text-neutral-900 hover:bg-neutral-100",
                      i === activo && "bg-neutral-200",
                    )}
                    data-combo-activo={i === activo ? "" : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActivo(i)}
                    onClick={() => elegir(o)}
                  >
                    {o}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </>
  );
}

/** Manija de resize: cursor col-resize, guía a todo el alto del grid. */
function aplicarCursorColResize(activo: boolean) {
  const id = "catalogo-cursor-col-resize";
  document.getElementById(id)?.remove();
  if (!activo) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = "*,*::before,*::after{cursor:col-resize!important}";
  document.head.appendChild(style);
}

function ManijaResize({
  resizing,
  onMouseDown,
  onTouchStart,
  contenedorRef,
}: {
  resizing: boolean;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onTouchStart: React.TouchEventHandler<HTMLDivElement>;
  contenedorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [guia, setGuia] = useState<{ left: number; top: number; height: number } | null>(null);
  const visible = hover || resizing;

  useEffect(() => {
    aplicarCursorColResize(resizing);
    const prev = document.body.style.userSelect;
    if (resizing) document.body.style.userSelect = "none";
    return () => {
      aplicarCursorColResize(false);
      document.body.style.userSelect = prev;
    };
  }, [resizing]);

  useLayoutEffect(() => {
    if (!visible) {
      setGuia(null);
      return;
    }
    const medir = () => {
      const handle = handleRef.current;
      const caja = contenedorRef.current;
      if (!handle || !caja) return;
      const h = handle.getBoundingClientRect();
      const c = caja.getBoundingClientRect();
      setGuia({ left: h.right, top: c.top, height: c.height });
    };
    medir();
    const caja = contenedorRef.current;
    const th = handleRef.current?.parentElement;
    const ro = new ResizeObserver(medir);
    if (caja) ro.observe(caja);
    if (th) ro.observe(th);
    window.addEventListener("scroll", medir, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", medir, true);
    };
  }, [visible, resizing, contenedorRef]);

  return (
    <>
      <div
        ref={handleRef}
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown(e);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          onTouchStart(e);
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="absolute right-0 top-0 z-20 h-full w-2.5 touch-none select-none"
        style={{ cursor: "col-resize" }}
      />
      {guia &&
        createPortal(
          <div
            className={cn("pointer-events-none fixed z-[500] w-0.5", resizing ? "bg-primary" : "bg-primary/40")}
            style={{ left: guia.left, top: guia.top, height: guia.height }}
          />,
          document.body,
        )}
    </>
  );
}

function EditorCelda({
  columna,
  fila,
  meta,
  columnas,
  valorForzado,
}: {
  columna: CatalogoColumnaDef;
  fila: Fila;
  meta: CatalogoTableMeta;
  columnas: CatalogoColumnaDef[];
  valorForzado?: string;
}) {
  // Si se pasa `valorForzado` (se abrió escribiendo directamente sobre la
  // celda seleccionada, sin doble click), arranca reemplazando el valor
  // existente — igual que Excel.
  const valorInicial = valorForzado ?? fila[columna.campo];
  const [valor, setValor] = useState<string>(
    valorForzado !== undefined ? valorForzado : String(valorInicial ?? ""),
  );
  // Evita que el blur nativo disparado al desmontar este editor (p. ej. al
  // cerrar con Escape) vuelva a commitear un valor que el usuario descartó.
  const descartarRef = useRef(false);

  const commit = (): boolean => {
    if (descartarRef.current) return false;
    let valorFinal: string | number | boolean = valor;
    if (columna.booleano) valorFinal = valor === "Sí" || valor === "true";
    else if (columna.numero) {
      const n = parsearNumero(valor);
      if (n === null) {
        descartarRef.current = true;
        meta.cerrarCelda();
        return false;
      }
      valorFinal = n;
    }
    meta.confirmarCambioCelda(fila._id, columna.campo, valorFinal);
    return true;
  };

  const navegar = (delta: 1 | -1, abrirEditor: boolean) => {
    const editables = columnas.filter((c) => !c.soloLectura);
    const idxActual = editables.findIndex((c) => c.campo === columna.campo);
    const siguiente = editables[idxActual + delta];
    meta.seleccionarCelda(fila._id, siguiente ? siguiente.campo : columna.campo);
    if (siguiente && abrirEditor) meta.abrirCelda(fila._id, siguiente.campo);
  };

  const moverA = (delta: 1 | -1, abrirEditor: boolean) => {
    commit();
    navegar(delta, abrirEditor);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === "Escape") {
      descartarRef.current = true;
      meta.cerrarCelda();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (commit()) meta.confirmarEdicion();
      return;
    }
    if (e.key === "Enter") {
      // Enter confirma la celda y mueve la selección a la siguiente columna
      // de *esta* fila — no baja de fila, porque el commit es por fila (✓/✗).
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

  const opciones = typeof columna.opciones === "function" ? columna.opciones(fila) : columna.opciones;

  const clase = cn(
    "h-full w-full rounded-none border-none bg-background px-1 text-sm outline-none ring-1 ring-primary",
    columna.numero && "text-right tabular-nums",
  );

  if (opciones) {
    return (
      <ComboboxCelda
        opciones={opciones}
        valorInicial={String(valorInicial ?? "")}
        filtrarAlAbrir={valorForzado !== undefined}
        clase={clase}
        onElegir={(v) => meta.confirmarCambioCelda(fila._id, columna.campo, v)}
        onDescartar={() => meta.cerrarCelda()}
        onTab={(shift) => navegar(shift ? -1 : 1, true)}
        onEnter={(shift) => navegar(shift ? -1 : 1, false)}
        onConfirmarFila={() => meta.confirmarEdicion()}
      />
    );
  }

  return (
    <input
      autoFocus
      type="text"
      inputMode={columna.numero ? "decimal" : undefined}
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
  columnas,
}: {
  columna: CatalogoColumnaDef;
  fila: Fila;
  columnas: CatalogoColumnaDef[];
}) {
  const meta = useGridUi().meta.current;
  const abierta = useCeldaAbierta(fila._id, columna.campo);
  const seleccionada = useCeldaSeleccionada(fila._id, columna.campo);
  const bloqueada = useBloqueada(fila._id);
  const guardando = useGuardando();
  const conError = useErrorCampo(fila._id, columna.campo);
  const clicDirecto = columna.booleano || columna.estrellas;
  if (!columna.soloLectura && abierta && !columna.booleano) {
    return (
      <EditorCelda
        columna={columna}
        fila={fila}
        meta={meta}
        columnas={columnas}
        valorForzado={abierta.valorInicial}
      />
    );
  }
  const puedeMutar = !columna.soloLectura && !guardando && !bloqueada;
  return (
    <div
      className={cn(
        "flex h-full min-h-[22px] min-w-0 items-center px-1 ring-inset",
        columna.soloLectura ? "text-muted-foreground" : "cursor-pointer",
        seleccionada && !conError && "ring-2 ring-primary",
        conError && "ring-2 ring-destructive",
      )}
      title={conError ? (meta.errorGuardado ?? "Revisa este campo") : undefined}
      onClick={() => {
        meta.seleccionarCelda(fila._id, columna.campo);
        if (seleccionada && !columna.soloLectura && !clicDirecto) {
          meta.abrirCelda(fila._id, columna.campo);
        }
      }}
      onDoubleClick={columna.soloLectura || clicDirecto ? undefined : () => meta.abrirCelda(fila._id, columna.campo)}
    >
      <CeldaVista
        fila={fila}
        columna={columna}
        onToggleBooleano={
          columna.booleano && puedeMutar
            ? () => {
                meta.seleccionarCelda(fila._id, columna.campo);
                meta.confirmarCambioCelda(fila._id, columna.campo, !fila[columna.campo]);
              }
            : undefined
        }
        onEstrella={
          columna.estrellas && puedeMutar
            ? (n) => {
                meta.seleccionarCelda(fila._id, columna.campo);
                meta.confirmarCambioCelda(fila._id, columna.campo, n);
              }
            : undefined
        }
      />
    </div>
  );
}

const CeldaCatalogoMemo = memo(CeldaCatalogo);

function IndiceFila({ filaId, indice }: { filaId: string; indice: number }) {
  const activa = useFilaActiva(filaId);
  return (
    <div
      className={cn(
        "flex h-full items-center justify-end px-1 text-[10px] tabular-nums text-muted-foreground",
        activa && "font-medium text-foreground",
      )}
    >
      {indice}
    </div>
  );
}

function AccionesFila({ filaId }: { filaId: string }) {
  const meta = useGridUi().meta.current;
  const esBorrador = useEsBorrador(filaId);
  const guardando = useGuardando();
  const activa = useFilaActiva(filaId);
  const punto = useResaltarPunto(filaId, activa);
  if (esBorrador) {
    return (
      <div className="flex h-full items-center justify-center gap-px">
        <button
          type="button"
          title="Confirmar (Ctrl+Enter)"
          disabled={guardando}
          onClick={(e) => {
            e.stopPropagation();
            meta.confirmarEdicion();
          }}
          className="rounded p-px text-emerald-600 hover:bg-muted disabled:opacity-50"
        >
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
        <button
          type="button"
          title="Cancelar (Esc)"
          disabled={guardando}
          onClick={(e) => {
            e.stopPropagation();
            meta.cancelarEdicion();
          }}
          className="rounded p-px text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </div>
    );
  }
  if (punto) {
    return (
      <div className="flex h-full items-center justify-center" title="Fila seleccionada">
        <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.25)]" />
      </div>
    );
  }
  return null;
}

function FilaVirtual({
  row,
  itemIndex,
  measureElement,
  filaRefs,
  celdaRefs,
  altoEncabezado,
  estiloColumna,
  anclaIzquierda,
  anchoAncladoTotal,
  modoSeleccion,
  onClickFila,
  renderCelda,
}: {
  row: {
    id: string;
    original: Fila;
    getAllCells: () => Array<{ id: string; column: { id: string; getSize: () => number } }>;
    getIsSelected: () => boolean;
  };
  itemIndex: number;
  measureElement: (el: HTMLTableRowElement | null) => void;
  filaRefs: React.RefObject<Map<string, HTMLTableRowElement>>;
  celdaRefs: React.RefObject<Map<string, HTMLTableCellElement>>;
  altoEncabezado: number;
  estiloColumna: (size: number) => React.CSSProperties;
  anclaIzquierda: Map<string, number>;
  anchoAncladoTotal: number;
  modoSeleccion: "multiple" | "unica";
  onClickFila: (e: React.MouseEvent<HTMLTableRowElement>) => void;
  renderCelda: (cell: { id: string; column: { id: string; getSize: () => number } }) => React.ReactNode;
}) {
  const activa = useFilaActiva(row.original._id);
  const claseBorrador = useClaseBorrador(row.original._id);
  const esBorrador = !!claseBorrador;
  const seleccionadaVisual = modoSeleccion === "unica" ? activa : row.getIsSelected();
  const fondo = cn("bg-background", claseBorrador, !esBorrador && seleccionadaVisual && "bg-accent");

  return (
    <tr
      data-index={itemIndex}
      ref={(el) => {
        measureElement(el);
        if (el) filaRefs.current.set(row.original._id, el);
        else filaRefs.current.delete(row.original._id);
      }}
      style={{ scrollMarginTop: altoEncabezado }}
      tabIndex={0}
      onClick={onClickFila}
      className={cn("flex outline-none", claseBorrador, !esBorrador && seleccionadaVisual && "bg-accent", modoSeleccion === "unica" && "cursor-pointer")}
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
            data-column-id={cell.column.id}
            style={{
              ...estiloColumna(cell.column.getSize()),
              ...(anclaLeft !== undefined ? { left: anclaLeft } : { scrollMarginLeft: anchoAncladoTotal }),
            }}
            className={cn(
              "overflow-hidden py-0.5 text-xs",
              "border-b border-r border-border",
              cell.column.id.startsWith("__") && "px-0",
              anclaLeft !== undefined && cn("sticky z-[1]", fondo),
            )}
          >
            {renderCelda(cell)}
          </td>
        );
      })}
    </tr>
  );
}

function ThConMarca({
  columnId,
  className,
  style,
  children,
}: {
  columnId: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const activo = useCampoActivo(columnId);
  return (
    <th style={style} className={cn(className, activo && "text-foreground")}>
      {children}
    </th>
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
     * grid pierde su selección interna si cambia de posición en el árbol, así
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
  const seleccionStore = useRef(crearStoreSeleccion()).current;
  const abiertaStore = useRef(crearStore<CeldaAbierta | null>(null)).current;
  const chromeStore = useRef(crearStore<ChromeGrid>(CHROME_VACIO)).current;
  const metaRef = useRef<CatalogoTableMeta>(null as unknown as CatalogoTableMeta);
  const uiStore = useRef<GridUi>({
    seleccion: seleccionStore,
    abierta: abiertaStore,
    chrome: chromeStore,
    meta: metaRef,
  }).current;
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [busquedaInterna, setBusquedaInterna] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [camposError, setCamposError] = useState<Set<string>>(() => new Set());
  const buscadorControlado = busquedaControlada !== undefined;
  const busqueda = buscadorControlado ? busquedaControlada : busquedaInterna;
  const setBusqueda = buscadorControlado ? onBusquedaChange! : setBusquedaInterna;
  const guardandoRef = useRef(false);
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const edicionRef = useRef(edicion);
  edicionRef.current = edicion;
  const copiarFilaCompletaRef = useRef(false);
  const filaRefs = useRef(new Map<string, HTMLTableRowElement>());
  const celdaRefs = useRef(new Map<string, HTMLTableCellElement>());
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Alto real del `<thead>` (sticky) — para que las filas reserven ese
  // espacio al hacer scroll hacia ellas (`scroll-margin-top`) y no queden
  // tapadas por el encabezado al llegar a la primera fila.
  const [altoEncabezado, setAltoEncabezado] = useState(0);

  useLayoutEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const medir = () => setAltoEncabezado(el.getBoundingClientRect().height);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!filasIniciales) return;
    setFilas((prev) => fusionarFilas(prev, filasIniciales, edicionRef.current, guardandoRef.current));
  }, [filasIniciales]);

  const seleccionarCelda = (filaId: string, campo: string) => {
    if (edicionRef.current && edicionRef.current.id !== filaId) return;
    copiarFilaCompletaRef.current = false;
    seleccionStore.set({ filaId, campo });
  };

  const abrirCelda = (filaId: string, campo: string, valorInicial?: string) => {
    if (edicionRef.current && edicionRef.current.id !== filaId) return;
    if (guardandoRef.current) return;
    abiertaStore.set({ filaId, campo, valorInicial });
  };

  const cerrarCelda = () => abiertaStore.set(null);

  const confirmarCambioCelda = (filaId: string, campo: string, valor: string | number | boolean) => {
    const filaActual = filasRef.current.find((f) => f._id === filaId);
    if (!filaActual || filaActual[campo] === valor) {
      abiertaStore.set(null);
      return;
    }
    const siguientes = filasRef.current.map((f) => (f._id === filaId ? { ...f, [campo]: valor } : f));
    filasRef.current = siguientes;
    setFilas(siguientes);
    abiertaStore.set(null);
    setCamposError((prev) => {
      if (!prev.has(campo)) return prev;
      const next = new Set(prev);
      next.delete(campo);
      return next;
    });
    if (!edicionRef.current) {
      const siguienteEdicion = { id: filaId, esNueva: false, original: filaActual };
      edicionRef.current = siguienteEdicion;
      setEdicion(siguienteEdicion);
    }
  };

  const confirmarEdicion = async () => {
    if (!edicionRef.current || guardandoRef.current) return;
    const actual = edicionRef.current;
    abiertaStore.set(null);
    const filaActual = filasRef.current.find((f) => f._id === actual.id);
    if (!filaActual) {
      setEdicion(null);
      edicionRef.current = null;
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
    const siguientes = filasRef.current.map((f) => (f._id === actual.id ? filaSaneada : f));
    filasRef.current = siguientes;
    setFilas(siguientes);
    guardandoRef.current = true;
    setGuardando(true);
    setErrorGuardado(null);
    setCamposError(new Set());
    try {
      if (actual.esNueva) {
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
      const mensaje = e instanceof Error ? e.message : String(e);
      guardandoRef.current = false;
      setGuardando(false);
      setErrorGuardado(mensaje);
      const marcados = camposDesdeMensaje(mensaje, config.columnas, filaSaneada);
      setCamposError(new Set(marcados.length > 0 ? marcados : [primerCampo(config.columnas)].filter(Boolean) as string[]));
      onErrorGuardado?.(mensaje);
      return;
    }
    guardandoRef.current = false;
    setGuardando(false);
    setErrorGuardado(null);
    setCamposError(new Set());
    edicionRef.current = null;
    setEdicion(null);
    onGuardadoExitoso?.();
  };

  const cancelarEdicion = () => {
    if (!edicionRef.current || guardandoRef.current) return;
    const actual = edicionRef.current;
    abiertaStore.set(null);
    if (actual.esNueva) {
      const siguientes = filasRef.current.filter((f) => f._id !== actual.id);
      filasRef.current = siguientes;
      setFilas(siguientes);
    } else {
      const siguientes = filasRef.current.map((f) => (f._id === actual.id ? actual.original : f));
      filasRef.current = siguientes;
      setFilas(siguientes);
    }
    edicionRef.current = null;
    setEdicion(null);
    setErrorGuardado(null);
    setCamposError(new Set());
    onEdicionCancelada?.();
  };

  const meta: CatalogoTableMeta = {
    edicion,
    resaltarSeleccion,
    guardando,
    seleccionarCelda,
    abrirCelda,
    confirmarCambioCelda,
    cerrarCelda,
    confirmarEdicion: () => void confirmarEdicion(),
    cancelarEdicion,
    camposError,
    errorGuardado,
  };
  metaRef.current = meta;
  useEffect(() => {
    chromeStore.set({ edicion, guardando, camposError, errorGuardado, resaltarSeleccion });
  }, [edicion, guardando, camposError, errorGuardado, resaltarSeleccion]);

  // Compara contra el texto ya formateado de toda la fila (mismo texto que
  // ve el usuario: fecha con `formatearFecha`, "Sí"/"No", sufijo aplicado),
  // no contra los valores crudos — así buscar algo visible siempre lo encuentra.
  // La fila en borrador siempre pasa el filtro: si no, "Agregar" con buscador
  // activo esconde la fila vacía y parece que no pasó nada.
  const filtroGlobal = useMemo<FilterFn<typeof features, Fila>>(
    () => (row, _columnId, filterValue) => {
      if (edicion && row.original._id === edicion.id) return true;
      if (!filterValue) return true;
      const texto = config.columnas
        .map((c) => valorVisible(row.original, c))
        .join(" ")
        .toLowerCase();
      return texto.includes(String(filterValue).toLowerCase());
    },
    [config.columnas, edicion],
  );

  const columns = useMemo(() => {
    const cols: ColumnDef<typeof features, Fila, any>[] = [];
    cols.push(
      columnHelper.display({
        id: "__indice",
        header: "",
        size: 36,
        minSize: 36,
        enableResizing: false,
        cell: (ctx) => <IndiceFila filaId={ctx.row.original._id} indice={ctx.row.index + 1} />,
      }),
    );
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
        size: 54,
        minSize: 54,
        enableResizing: false,
        cell: (ctx) => <AccionesFila filaId={ctx.row.original._id} />,
      }),
    );
    for (const c of config.columnas) {
      cols.push(
        columnHelper.accessor((fila) => fila[c.campo], {
          id: c.campo,
          header: c.encabezado,
          size: c.ancho,
          minSize: 48,
          enableGlobalFilter: true,
          cell: (ctx) => <CeldaCatalogoMemo columna={c} fila={ctx.row.original} columnas={config.columnas} />,
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
  const anchoAncladoTotalRef = useRef(0);
  anchoAncladoTotalRef.current = anchoAncladoTotal;

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
      getColumnCanGlobalFilter: (column) => !String(column.id).startsWith("__"),
      columnResizeMode: "onChange",
      enableColumnResizing: true,
      meta,
    },
    (state) => ({ rowSelection: state.rowSelection, globalFilter: state.globalFilter }),
  );

  const filasVisibles = table.getRowModel().rows;
  const filasVisiblesRef = useRef(filasVisibles);
  filasVisiblesRef.current = filasVisibles;

  const rowVirtualizer = useVirtualizer({
    count: filasVisibles.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ALTO_FILA,
    overscan: 12,
    getItemKey: (index) => filasVisibles[index]?.id ?? index,
    scrollPaddingStart: altoEncabezado,
  });

  const enfocarFila = (index: number, filaId: string) => {
    rowVirtualizer.scrollToIndex(index, { align: "auto" });
    const nodo = filaRefs.current.get(filaId);
    if (nodo) nodo.focus();
    else scrollRef.current?.focus();
  };

  const rowSelectionRef = useRef(rowSelection);
  rowSelectionRef.current = rowSelection;
  const columnasRef = useRef(config.columnas);
  columnasRef.current = config.columnas;

  const moverPorFlecha = (key: Flecha, opts: { alBorde: boolean; enfocar: boolean }) => {
    const columnas = columnasRef.current;
    const filas = filasVisiblesRef.current;
    const sel = seleccionStore.get();

    if (key === "ArrowUp" || key === "ArrowDown") {
      if (edicionRef.current) return;
      const filaActualId = sel?.filaId ?? Object.keys(rowSelectionRef.current)[0];
      const idxActual = filas.findIndex((r) => r.original._id === filaActualId);
      const destino = opts.alBorde
        ? key === "ArrowDown"
          ? filas.length - 1
          : 0
        : idxActual + (key === "ArrowDown" ? 1 : -1);
      const siguiente = filas[destino];
      if (!siguiente) return;
      const campo = sel?.campo ?? primerCampo(columnas);
      if (campo) seleccionStore.set({ filaId: siguiente.original._id, campo });
      if (opts.enfocar) enfocarFila(destino, siguiente.original._id);
      return;
    }

    if (!sel) return;
    if (opts.alBorde) {
      const campo = key === "ArrowLeft" ? columnas[0]?.campo : columnas[columnas.length - 1]?.campo;
      if (campo) seleccionStore.set({ filaId: sel.filaId, campo });
      return;
    }
    const idxActual = columnas.findIndex((c) => c.campo === sel.campo);
    const siguienteCol = columnas[idxActual + (key === "ArrowRight" ? 1 : -1)];
    if (!siguienteCol) return;
    seleccionStore.set({ filaId: sel.filaId, campo: siguienteCol.campo });
  };

  const holdRef = useRef({
    held: new Set<Flecha>(),
    activa: null as Flecha | null,
    raf: 0,
    startedAt: 0,
    lastMove: 0,
    parked: false,
  });
  const moverPorFlechaRef = useRef(moverPorFlecha);
  moverPorFlechaRef.current = moverPorFlecha;
  const loopHoldRef = useRef<(t: number) => void>(() => {});

  const detenerHold = () => {
    const h = holdRef.current;
    h.held.clear();
    h.activa = null;
    h.parked = false;
    if (h.raf) {
      cancelAnimationFrame(h.raf);
      h.raf = 0;
    }
  };

  loopHoldRef.current = (t: number) => {
    const h = holdRef.current;
    if (!h.activa) {
      h.raf = 0;
      return;
    }
    h.raf = requestAnimationFrame((now) => loopHoldRef.current(now));
    if (abiertaStore.get()) return;
    if ((h.activa === "ArrowUp" || h.activa === "ArrowDown") && edicionRef.current) return;
    if (t - h.startedAt < FLECHA_REPEAT_DELAY_MS) return;
    // El foco en la fila de origen se perdería al virtualizarla; el
    // contenedor (tabIndex=0) sí sobrevive todo el hold.
    if (!h.parked) {
      h.parked = true;
      scrollRef.current?.focus({ preventScroll: true });
    }
    if (t - h.lastMove < FLECHA_REPEAT_MS) return;
    h.lastMove = t;
    moverPorFlechaRef.current(h.activa, { alBorde: false, enfocar: false });
  };

  const arrancarHold = (key: Flecha) => {
    const h = holdRef.current;
    h.held.add(key);
    h.activa = key;
    h.startedAt = performance.now();
    h.lastMove = h.startedAt;
    if (!h.raf) {
      h.parked = false;
      h.raf = requestAnimationFrame((now) => loopHoldRef.current(now));
    }
  };

  const onFlechaKeyUp = (key: string) => {
    if (!esFlecha(key)) return;
    const h = holdRef.current;
    if (!h.held.has(key)) return;
    h.held.delete(key);
    if (h.activa === key) {
      const resto = [...h.held];
      h.activa = resto[resto.length - 1] ?? null;
      if (h.activa) {
        h.startedAt = performance.now();
        h.lastMove = h.startedAt;
      }
    }
    if (h.activa) return;
    h.parked = false;
    if (h.raf) {
      cancelAnimationFrame(h.raf);
      h.raf = 0;
    }
    const sel = seleccionStore.get();
    if (!sel) return;
    const nodo = filaRefs.current.get(sel.filaId);
    if (nodo && document.activeElement === nodo) return;
    const idx = filasVisiblesRef.current.findIndex((r) => r.original._id === sel.filaId);
    if (idx >= 0) enfocarFila(idx, sel.filaId);
  };

  const onFlechaKeyUpRef = useRef(onFlechaKeyUp);
  onFlechaKeyUpRef.current = onFlechaKeyUp;
  const detenerHoldRef = useRef(detenerHold);
  detenerHoldRef.current = detenerHold;

  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => onFlechaKeyUpRef.current(e.key);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!holdRef.current.activa || !esFlecha(e.key)) return;
      e.preventDefault();
    };
    const onBlur = () => detenerHoldRef.current();
    const onFocusIn = (e: FocusEvent) => {
      const caja = scrollRef.current;
      if (!caja || !holdRef.current.activa) return;
      if (e.target instanceof Node && caja.contains(e.target)) return;
      detenerHoldRef.current();
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
      detenerHoldRef.current();
    };
  }, []);

  // Mantiene siempre exactamente una fila seleccionada en modo "unica": al
  // montar restaura `seleccionInicialId` o cae en la primera; si la selección se vacía más
  // adelante (p. ej. se borró la fila seleccionada), vuelve a caer en la
  // primera. Un solo efecto evita la carrera de dos efectos leyendo el mismo
  // `rowSelection` (aún no actualizado) en el mismo commit.
  useEffect(() => {
    if (modoSeleccion !== "unica") return;
    if (Object.keys(rowSelection).length > 0) return;
    if (filasVisibles.length === 0) return;
    const objetivo = seleccionInicialId ? filasVisibles.find((r) => r.original._id === seleccionInicialId) : undefined;
    const row = objetivo ?? filasVisibles[0];
    row.toggleSelected(true);
    const sel = seleccionStore.get();
    const campo =
      (sel && config.columnas.some((c) => c.campo === sel.campo)
        ? sel.campo
        : primerCampo(config.columnas));
    if (campo) seleccionStore.set({ filaId: row.original._id, campo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoSeleccion, filas, rowSelection, seleccionInicialId]);

  const onFilaSeleccionadaRef = useRef(onFilaSeleccionada);
  onFilaSeleccionadaRef.current = onFilaSeleccionada;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    if (modoSeleccion !== "unica") return;
    let t = 0;
    let ultimaNotificada: string | null = null;
    const programar = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const filaId = seleccionStore.get()?.filaId;
        if (!filaId) return;
        setRowSelection((prev) => (prev[filaId] ? prev : { [filaId]: true }));
        if (ultimaNotificada === filaId) return;
        ultimaNotificada = filaId;
        const fila = filasRef.current.find((f) => f._id === filaId) ?? null;
        onFilaSeleccionadaRef.current?.(fila);
        onSelectionChangeRef.current?.(true);
      }, 200);
    };
    programar();
    const unsub = seleccionStore.subscribe(programar);
    return () => {
      window.clearTimeout(t);
      unsub();
    };
  }, [modoSeleccion]);

  useEffect(() => {
    if (modoSeleccion === "unica") return;
    onSelectionChange?.(Object.keys(rowSelection).length > 0);
    const fila = table.getSelectedRowModel().rows[0]?.original ?? null;
    const t = window.setTimeout(() => onFilaSeleccionada?.(fila), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection, modoSeleccion]);

  // Con muchos registros, la fila nueva o la que se empieza a editar puede
  // quedar fuera del área visible — hace scroll hasta ella.
  useEffect(() => {
    if (!edicion) return;
    const idx = filasVisibles.findIndex((r) => r.original._id === edicion.id);
    if (idx >= 0) rowVirtualizer.scrollToIndex(idx, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edicion]);

  // Trae la fila al viewport (virtualizador) y, si ya está montada, la columna.
  useEffect(() => {
    const alinearHorizontal = (filaId: string, campo: string) => {
      const celda = celdaRefs.current.get(`${filaId}:${campo}`);
      const caja = scrollRef.current;
      if (!celda || !caja) return false;
      const c = celda.getBoundingClientRect();
      const b = caja.getBoundingClientRect();
      const margen = anchoAncladoTotalRef.current;
      if (c.right > b.right) caja.scrollLeft += c.right - b.right;
      else if (c.left < b.left + margen) caja.scrollLeft -= b.left + margen - c.left;
      return true;
    };
    const aplicar = () => {
      const sel = seleccionStore.get();
      if (!sel) return;
      const idx = filasVisiblesRef.current.findIndex((r) => r.original._id === sel.filaId);
      if (idx >= 0) rowVirtualizer.scrollToIndex(idx, { align: "auto" });
      if (alinearHorizontal(sel.filaId, sel.campo)) return;
      requestAnimationFrame(() => {
        if (seleccionStore.get() !== sel) return;
        alinearHorizontal(sel.filaId, sel.campo);
      });
    };
    aplicar();
    return seleccionStore.subscribe(aplicar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al confirmar (Enter/blur) o cancelar (Escape) la edición de una celda sin
  // saltar a otra (eso lo maneja `moverA` con Tab), el editor se desmonta y el
  // foco se pierde del todo — sin nada enfocado dentro del grid, las flechas
  // dejan de llegarle a `onKeyDownContenedor`. Se regresa el foco a la fila.
  useEffect(() => {
    const alCerrar = () => {
      if (abiertaStore.get()) return;
      const filaId = seleccionStore.get()?.filaId;
      if (!filaId) return;
      const nodo = filaRefs.current.get(filaId);
      if (nodo) nodo.focus();
      else scrollRef.current?.focus();
    };
    return abiertaStore.subscribe(alCerrar);
  }, []);

  const textoACopiar = (): string | null => {
    const celdaSeleccionada = seleccionStore.get();
    const seleccionadas = table.getSelectedRowModel().rows.map((r) => r.original);
    if (copiarFilaCompletaRef.current || (modoSeleccion === "multiple" && seleccionadas.length > 1)) {
      const origen =
        modoSeleccion === "unica"
          ? filasRef.current.filter((f) => f._id === celdaSeleccionada?.filaId)
          : seleccionadas.length > 0
            ? seleccionadas
            : filasRef.current.filter((f) => f._id === celdaSeleccionada?.filaId);
      if (origen.length === 0) return null;
      return origen.map((f) => filaATsv(f, config.columnas)).join("\n");
    }
    if (!celdaSeleccionada) return null;
    const fila = filasRef.current.find((f) => f._id === celdaSeleccionada.filaId);
    const col = config.columnas.find((c) => c.campo === celdaSeleccionada.campo);
    if (!fila || !col) return null;
    return valorVisible(fila, col);
  };

  const copiar = async () => {
    const texto = textoACopiar();
    if (texto == null) return;
    await escribirClipboard(texto);
  };

  const aplicarPegado = (lineas: string[][]) => {
    const celdaSeleccionada = seleccionStore.get();
    const linea = lineas[0];
    if (!linea || linea.length === 0) return;
    const destinoId = celdaSeleccionada?.filaId ?? Object.keys(rowSelection)[0];
    if (!destinoId) return;
    if (edicionRef.current && edicionRef.current.id !== destinoId) return;
    const fila = filasRef.current.find((f) => f._id === destinoId);
    if (!fila) return;
    let startIdx = 0;
    if (linea.length === 1 && celdaSeleccionada) {
      startIdx = config.columnas.findIndex((c) => c.campo === celdaSeleccionada.campo);
      if (startIdx < 0) startIdx = 0;
    }
    const { fila: next, changed } = aplicarLineaAFila(fila, linea, startIdx, config.columnas);
    if (!changed) return;
    const siguientes = filasRef.current.map((f) => (f._id === destinoId ? next : f));
    filasRef.current = siguientes;
    setFilas(siguientes);
    abiertaStore.set(null);
    if (!edicionRef.current) {
      const siguienteEdicion = { id: destinoId, esNueva: false, original: fila };
      edicionRef.current = siguienteEdicion;
      setEdicion(siguienteEdicion);
    }
  };

  const vaciarSeleccionCopiada = () => {
    const celdaSeleccionada = seleccionStore.get();
    if (!celdaSeleccionada) return;
    if (copiarFilaCompletaRef.current) {
      const fila = filasRef.current.find((f) => f._id === celdaSeleccionada.filaId);
      if (!fila) return;
      let next: Fila = { ...fila };
      let changed = false;
      for (const col of config.columnas) {
        if (col.soloLectura) continue;
        const vacio = valorVacio(col);
        if (next[col.campo] !== vacio) {
          next = { ...next, [col.campo]: vacio };
          changed = true;
        }
      }
      if (!changed) return;
      const siguientes = filasRef.current.map((f) => (f._id === celdaSeleccionada.filaId ? next : f));
      filasRef.current = siguientes;
      setFilas(siguientes);
      if (!edicionRef.current) {
        const siguienteEdicion = { id: celdaSeleccionada.filaId, esNueva: false, original: fila };
        edicionRef.current = siguienteEdicion;
        setEdicion(siguienteEdicion);
      }
      return;
    }
    const col = config.columnas.find((c) => c.campo === celdaSeleccionada.campo);
    if (!col || col.soloLectura) return;
    confirmarCambioCelda(celdaSeleccionada.filaId, col.campo, valorVacio(col));
  };

  const cortar = async () => {
    await copiar();
    vaciarSeleccionCopiada();
  };

  const pegar = async () => {
    try {
      const texto = await navigator.clipboard.readText();
      if (texto) aplicarPegado(parsearTsv(texto));
    } catch {
      /* el evento `paste` nativo cubre el caso sin permiso de clipboard */
    }
  };

  const clipboardApiRef = useRef<CatalogoClipboard>({
    copiar: async () => {},
    cortar: async () => {},
    pegar: async () => {},
  });
  clipboardApiRef.current = { copiar, cortar, pegar };

  useEffect(() => {
    const api: CatalogoClipboard = {
      copiar: () => clipboardApiRef.current.copiar(),
      cortar: () => clipboardApiRef.current.cortar(),
      pegar: () => clipboardApiRef.current.pegar(),
    };
    const onFocus = () => setCatalogoClipboardActivo(api);
    const el = scrollRef.current;
    el?.addEventListener("focusin", onFocus);
    return () => {
      el?.removeEventListener("focusin", onFocus);
      if (catalogoClipboardActivo() === api) setCatalogoClipboardActivo(null);
    };
  }, []);

  const onKeyDownContenedor = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const celdaSeleccionada = seleccionStore.get();
    const celdaAbierta = abiertaStore.get();
    const objetivo = e.target as HTMLElement;
    const enEditor = objetivo.tagName === "INPUT" || objetivo.tagName === "SELECT" || objetivo.tagName === "TEXTAREA";

    if (enEditor) {
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

    if (!esFlecha(e.key) && holdRef.current.activa) detenerHold();

    if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S") && edicion) {
      e.preventDefault();
      void confirmarEdicion();
      return;
    }

    // Escape con el editor cerrado cancela el borrador de la fila (mismo que ✗).
    // Con el editor abierto, EditorCelda ya consumió Escape para descartar solo la celda.
    if (e.key === "Escape" && edicion && !celdaAbierta) {
      e.preventDefault();
      cancelarEdicion();
      return;
    }

    if (esFlecha(e.key)) {
      // Primer keydown mueve ya; los ecos del SO (`repeat`) se ignoran — el
      // loop de rAF mueve a ~25 Hz y el keyup corta sin cola residual.
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && edicion) {
        e.preventDefault();
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !celdaSeleccionada) return;
      const alBorde = e.ctrlKey || e.metaKey;
      e.preventDefault();
      if (e.repeat) return;
      moverPorFlecha(e.key, { alBorde, enfocar: e.key === "ArrowUp" || e.key === "ArrowDown" });
      if (!alBorde) arrancarHold(e.key);
      return;
    }

    if (e.key === "PageUp" || e.key === "PageDown") {
      if (edicion) {
        e.preventDefault();
        return;
      }
      const altoFila = ALTO_FILA;
      const altoVista = (scrollRef.current?.clientHeight ?? 400) - altoEncabezado;
      const porPagina = Math.max(1, Math.floor(altoVista / altoFila) - 1);
      const filaActualId = celdaSeleccionada?.filaId ?? Object.keys(rowSelection)[0];
      const idxActual = Math.max(0, filasVisibles.findIndex((r) => r.original._id === filaActualId));
      const destino = Math.min(
        filasVisibles.length - 1,
        Math.max(0, idxActual + (e.key === "PageDown" ? porPagina : -porPagina)),
      );
      const siguiente = filasVisibles[destino];
      if (!siguiente) return;
      e.preventDefault();
      const campo = celdaSeleccionada?.campo ?? primerCampo(config.columnas);
      if (campo) seleccionStore.set({ filaId: siguiente.original._id, campo });
      enfocarFila(destino, siguiente.original._id);
      return;
    }

    if ((e.key === "Home" || e.key === "End") && (celdaSeleccionada || Object.keys(rowSelection).length > 0)) {
      e.preventDefault();
      const alBorde = e.ctrlKey || e.metaKey;
      if (alBorde && !edicion) {
        const row = e.key === "Home" ? filasVisibles[0] : filasVisibles[filasVisibles.length - 1];
        const campo = e.key === "Home" ? config.columnas[0]?.campo : config.columnas[config.columnas.length - 1]?.campo;
        if (row && campo) {
          seleccionStore.set({ filaId: row.original._id, campo });
          enfocarFila(e.key === "Home" ? 0 : filasVisibles.length - 1, row.original._id);
        }
        return;
      }
      const campo = e.key === "Home" ? config.columnas[0]?.campo : config.columnas[config.columnas.length - 1]?.campo;
      const filaId = edicion?.id ?? celdaSeleccionada?.filaId ?? Object.keys(rowSelection)[0];
      if (campo && filaId) seleccionStore.set({ filaId, campo });
      return;
    }

    if (!celdaAbierta && celdaSeleccionada && e.key === "F2") {
      const columna = config.columnas.find((c) => c.campo === celdaSeleccionada.campo);
      if (columna && !columna.soloLectura) {
        e.preventDefault();
        if (columna.booleano) {
          const fila = filasRef.current.find((f) => f._id === celdaSeleccionada.filaId);
          if (fila) confirmarCambioCelda(celdaSeleccionada.filaId, columna.campo, !fila[columna.campo]);
        } else {
          abrirCelda(celdaSeleccionada.filaId, celdaSeleccionada.campo);
        }
      }
      return;
    }

    if (!celdaAbierta && celdaSeleccionada && e.key === " ") {
      const columna = config.columnas.find((c) => c.campo === celdaSeleccionada.campo);
      if (columna && columna.booleano && !columna.soloLectura) {
        e.preventDefault();
        const fila = filasRef.current.find((f) => f._id === celdaSeleccionada.filaId);
        if (fila) confirmarCambioCelda(celdaSeleccionada.filaId, columna.campo, !fila[columna.campo]);
        return;
      }
    }

    // Delete/Backspace vacían la celda seleccionada y entran en borrador de fila
    // — no persisten hasta ✓. Igual que Excel, sin abrir el editor.
    if (!celdaAbierta && celdaSeleccionada && (e.key === "Delete" || e.key === "Backspace")) {
      const columna = config.columnas.find((c) => c.campo === celdaSeleccionada.campo);
      if (columna && !columna.soloLectura) {
        e.preventDefault();
        confirmarCambioCelda(celdaSeleccionada.filaId, columna.campo, valorVacio(columna));
      }
      return;
    }

    // Escribir directamente sobre una celda seleccionada (sin doble click)
    // abre el editor reemplazando el valor — igual que Excel. No aplica a
    // columnas de solo lectura ni a las que se editan con un `<select>`
    // (booleano/opciones), donde "reemplazar tecleando" no tiene sentido.
    if (!celdaAbierta && celdaSeleccionada && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const columna = config.columnas.find((c) => c.campo === celdaSeleccionada.campo);
      if (columna && !columna.soloLectura && !columna.booleano) {
        e.preventDefault();
        abrirCelda(celdaSeleccionada.filaId, celdaSeleccionada.campo, e.key);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    agregarFila: () => {
      if (edicionRef.current) return;
      const nueva = filaVacia(config.columnas);
      const siguientes = [...filasRef.current, nueva];
      filasRef.current = siguientes;
      setFilas(siguientes);
      const siguienteEdicion = { id: nueva._id, esNueva: true, original: nueva };
      edicionRef.current = siguienteEdicion;
      setEdicion(siguienteEdicion);
      setRowSelection({ [nueva._id]: true });
      const campo = primerCampo(config.columnas);
      if (campo) {
        seleccionStore.set({ filaId: nueva._id, campo });
        abiertaStore.set({ filaId: nueva._id, campo });
      }
    },
    eliminarFilaSeleccionada: () => {
      if (modoSeleccion === "unica") {
        const id = seleccionStore.get()?.filaId;
        const fila = id ? filasRef.current.find((f) => f._id === id) : undefined;
        if (fila) setPendienteEliminar([fila]);
        return;
      }
      const seleccionadas = table.getSelectedRowModel().rows.map((r) => r.original);
      if (seleccionadas.length === 0) return;
      setPendienteEliminar(seleccionadas);
    },
  }));

  const confirmarEliminacion = async () => {
    if (!pendienteEliminar) return;
    const ids = pendienteEliminar.map((f) => f._id);
    try {
      if (esPersistido) {
        await onEliminarFilas?.(ids);
      } else {
        const idsSet = new Set(ids);
        setFilas((prev) => prev.filter((f) => !idsSet.has(f._id)));
      }
      setPendienteEliminar(null);
      setRowSelection({});
      onSelectionChange?.(false);
      onFilaSeleccionada?.(null);
    } catch (e) {
      setPendienteEliminar(null);
      onErrorGuardado?.(e instanceof Error ? e.message : String(e));
    }
  };

  const primerCampoTexto = config.columnas.find((c) => !c.numero)?.campo ?? config.columnas[0]?.campo;

  const estiloColumna = (size: number): React.CSSProperties => ({
    flex: `0 0 ${size}px`,
    width: size,
  });

  const enCampo = (target: EventTarget | null) => {
    const t = target as HTMLElement | null;
    return t?.tagName === "INPUT" || t?.tagName === "SELECT" || t?.tagName === "TEXTAREA";
  };

  const filasVirtuales = rowVirtualizer.getVirtualItems();
  const paddingTop = filasVirtuales.length > 0 ? filasVirtuales[0].start : 0;
  const paddingBottom =
    filasVirtuales.length > 0
      ? rowVirtualizer.getTotalSize() - filasVirtuales[filasVirtuales.length - 1].end + 25
      : 0;

  return (
    <GridUiContext.Provider value={uiStore}>
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
      {errorGuardado && (
        <div className="shrink-0 truncate border-b border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive" title={errorGuardado}>
          {errorGuardado}
        </div>
      )}
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDownContenedor}
        onCopy={(e) => {
          if (enCampo(e.target)) return;
          const texto = textoACopiar();
          if (texto == null) return;
          e.preventDefault();
          e.clipboardData.setData("text/plain", texto);
        }}
        onCut={(e) => {
          if (enCampo(e.target)) return;
          const texto = textoACopiar();
          if (texto == null) return;
          e.preventDefault();
          e.clipboardData.setData("text/plain", texto);
          vaciarSeleccionCopiada();
        }}
        onPaste={(e) => {
          if (enCampo(e.target)) return;
          e.preventDefault();
          aplicarPegado(parsearTsv(e.clipboardData.getData("text/plain")));
        }}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        <table.Subscribe selector={(state) => state.columnSizing}>
          {(_columnSizing) => (
            <table.Subscribe selector={(state) => state.columnResizing?.isResizingColumn ?? false}>
              {() => (
            <table
              className="w-full border-collapse border-l border-t border-border text-sm"
              style={{ minWidth: table.getTotalSize(), width: "100%" }}
            >
              <thead ref={theadRef} className="sticky top-0 z-20 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="flex">
                    {headerGroup.headers.map((header) => {
                      const esOrdenable = !header.column.id.startsWith("__");
                      const orden = header.column.getIsSorted();
                      const anclaLeft = anclaIzquierda.get(header.column.id);
                      const def = config.columnas.find((c) => c.campo === header.column.id);
                      return (
                        <ThConMarca
                          key={header.id}
                          columnId={header.column.id}
                          style={{
                            ...estiloColumna(header.getSize()),
                            ...(anclaLeft !== undefined && { left: anclaLeft }),
                          }}
                          className={cn(
                            "relative border-b border-r border-border px-1.5 py-1.5 text-xs font-medium text-muted-foreground",
                            def?.numero ? "text-right" : "text-left",
                            anclaLeft !== undefined && "sticky z-30 bg-muted",
                          )}
                        >
                          {esOrdenable ? (
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={!!edicion}
                              onClick={edicion ? undefined : header.column.getToggleSortingHandler()}
                              className={cn(
                                "flex items-center gap-1 hover:text-foreground disabled:opacity-50",
                                def?.numero && "ml-auto",
                              )}
                            >
                              <table.FlexRender header={header} />
                              {orden === "asc" && <ArrowUp size={11} />}
                              {orden === "desc" && <ArrowDown size={11} />}
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                          {header.column.getCanResize() && (
                            <ManijaResize
                              resizing={header.column.getIsResizing()}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              contenedorRef={scrollRef}
                            />
                          )}
                        </ThConMarca>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {filasVisibles.length === 0 ? (
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
                    {filasVirtuales.map((item) => {
                      const row = filasVisibles[item.index];
                      if (!row) return null;
                      return (
                        <FilaVirtual
                          key={row.id}
                          row={row}
                          itemIndex={item.index}
                          measureElement={rowVirtualizer.measureElement}
                          filaRefs={filaRefs}
                          celdaRefs={celdaRefs}
                          altoEncabezado={altoEncabezado}
                          estiloColumna={estiloColumna}
                          anclaIzquierda={anclaIzquierda}
                          anchoAncladoTotal={anchoAncladoTotal}
                          modoSeleccion={modoSeleccion}
                          renderCelda={(cell) => <table.FlexRender cell={cell as never} />}
                          onClickFila={(e) => {
                            if (edicion && edicion.id !== row.original._id) return;
                            e.currentTarget.focus();
                            const columnId = (e.target as HTMLElement).closest("td")?.dataset.columnId;
                            if (columnId && !columnId.startsWith("__")) return;
                            copiarFilaCompletaRef.current = columnId === "__indice";
                            const campo = primerCampo(config.columnas);
                            if (campo) seleccionStore.set({ filaId: row.original._id, campo });
                          }}
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
              )}
            </table.Subscribe>
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
            <AlertDialogAction onClick={() => void confirmarEliminacion()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </GridUiContext.Provider>
  );
});
