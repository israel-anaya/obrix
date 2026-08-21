import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ordenarPor } from "@/lib/ordenar";

interface ConClaveDescripcion {
  id: string;
  clave: string;
  descripcion: string;
}

// Ancho de tarjeta (`w-64` = 256px) + separación (`gap-1.5` = 6px) de
// `FranjaSuperior`: tamaño fijo, así que el virtualizador no necesita medir
// cada tarjeta.
const ANCHO_TARJETA = 256;
const GAP = 6;

// Espera antes de que el auto-repeat empiece a moverse solo (imita el
// KeyboardDelay del SO) y luego repite a este ritmo — igual que `DataGrid`.
const REPEAT_DELAY_MS = 400;
const REPEAT_MS = 40;

// Antes de "confirmar" el cursor (y con eso disparar la carga del panel de
// detalle — comandos Tauri en el `*AnalisisInsumo` correspondiente), espera
// a que el cursor deje de moverse. Sin esto, mantener una flecha apretada
// dispararía una carga por cada tarjeta de paso.
const CONFIRMAR_DEBOUNCE_MS = 200;

type FlechaHorizontal = "ArrowLeft" | "ArrowRight";

/**
 * Selección, búsqueda, virtualización horizontal y navegación con teclado de
 * la franja superior de una vista "Ficha" (maestro-detalle) — compartido por
 * básico auxiliar, cuadrilla y equipo de costo horario. Cada dominio sigue
 * cargando su propia lista (comando Tauri propio); este hook solo administra
 * qué elemento está seleccionado, el filtro de búsqueda y la navegación
 * `←`/`→` (incluida la tira virtualizada de `FranjaSuperior`, que necesita
 * `scrollToIndex` en vez de un `ref.scrollIntoView` — la tarjeta destino
 * puede no estar montada todavía).
 *
 * La selección tiene dos velocidades: el "cursor" se mueve al instante (se
 * usa para el resaltado visual y para `scrollToIndex`) y `seleccionadaId`
 * —la que de verdad dispara la carga del panel de detalle— se confirma
 * `CONFIRMAR_DEBOUNCE_MS` después de que el cursor deja de moverse. Un clic
 * o un cambio programático (alta/edición/eliminación) mueven ambas cosas de
 * inmediato, sin esperar el debounce.
 */
export function useAnalisisMaestroDetalle<T extends ConClaveDescripcion>({
  items,
  /** Ignora la navegación con flechas mientras algo modal (p. ej. el Sheet de alta/edición) está abierto. */
  bloqueada,
}: {
  items: T[];
  bloqueada: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadaId, setSeleccionadaIdInterno] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = ordenarPor(items, (i) => i.clave);
    if (!q) return lista;
    return lista.filter((i) => i.clave.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q));
  }, [items, busqueda]);
  const itemsFiltradosRef = useRef(itemsFiltrados);
  itemsFiltradosRef.current = itemsFiltrados;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: itemsFiltrados.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ANCHO_TARJETA + GAP,
    overscan: 8,
    getItemKey: (index) => itemsFiltrados[index]?.id ?? index,
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const cursorIdRef = useRef(cursorId);
  cursorIdRef.current = cursorId;

  // Selección "de verdad" (clic, alta, edición, eliminación): instantánea —
  // el cursor la sigue al toque, sin pasar por el debounce del teclado.
  const setSeleccionadaId = (valor: string | null | ((actual: string | null) => string | null)) => {
    setSeleccionadaIdInterno((actual) => {
      const siguiente = typeof valor === "function" ? valor(actual) : valor;
      setCursorId(siguiente);
      return siguiente;
    });
  };

  // Confirma el cursor tras `CONFIRMAR_DEBOUNCE_MS` sin moverse.
  useEffect(() => {
    if (cursorId === seleccionadaId) return;
    const t = window.setTimeout(() => setSeleccionadaIdInterno(cursorId), CONFIRMAR_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorId]);

  // Mueve el cursor al índice `idx` (recortado a los límites de la lista
  // filtrada) y lo trae a la vista — `scrollToIndex` en vez de un ref porque
  // la tarjeta destino puede no estar montada (virtualización).
  const moverCursorA = (idx: number) => {
    const lista = itemsFiltradosRef.current;
    if (lista.length === 0) return;
    const idxRecortado = Math.min(Math.max(idx, 0), lista.length - 1);
    const objetivo = lista[idxRecortado];
    if (!objetivo) return;
    setCursorId(objetivo.id);
    virtualizerRef.current.scrollToIndex(idxRecortado, { align: "auto" });
  };

  const paso = (flecha: FlechaHorizontal) => {
    const lista = itemsFiltradosRef.current;
    if (lista.length === 0) return;
    const idxActual = lista.findIndex((i) => i.id === cursorIdRef.current);
    const delta = flecha === "ArrowLeft" ? -1 : 1;
    moverCursorA(idxActual === -1 ? 0 : idxActual + delta);
  };

  // Auto-repeat propio, igual que `DataGrid` (ver `apps/desktop/src/components/grid/DataGrid.tsx`):
  // el primer `keydown` real mueve al instante; los ecos `repeat` del SO se
  // descartan y este bucle (rAF) retoma el movimiento a un ritmo controlado
  // — así el repeat nativo nunca salta más rápido de lo que el overscan del
  // virtualizador puede seguir.
  const holdRef = useRef<{ flecha: FlechaHorizontal | null; raf: number; startedAt: number; lastMove: number }>({
    flecha: null,
    raf: 0,
    startedAt: 0,
    lastMove: 0,
  });

  const loopRef = useRef<(t: number) => void>(() => {});
  loopRef.current = (t: number) => {
    const h = holdRef.current;
    if (!h.flecha) {
      h.raf = 0;
      return;
    }
    h.raf = requestAnimationFrame((now) => loopRef.current(now));
    if (t - h.startedAt < REPEAT_DELAY_MS) return;
    if (t - h.lastMove < REPEAT_MS) return;
    h.lastMove = t;
    paso(h.flecha);
  };

  useEffect(() => {
    const esFlecha = (key: string): key is FlechaHorizontal => key === "ArrowLeft" || key === "ArrowRight";

    const onKeyDown = (e: KeyboardEvent) => {
      if (!esFlecha(e.key)) return;
      if (bloqueada) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (itemsFiltradosRef.current.length === 0) return;
      e.preventDefault();
      if (e.repeat) return;
      paso(e.key);
      const h = holdRef.current;
      h.flecha = e.key;
      h.startedAt = performance.now();
      h.lastMove = h.startedAt;
      if (!h.raf) h.raf = requestAnimationFrame((now) => loopRef.current(now));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!esFlecha(e.key)) return;
      const h = holdRef.current;
      if (h.flecha !== e.key) return;
      h.flecha = null;
      if (h.raf) {
        cancelAnimationFrame(h.raf);
        h.raf = 0;
      }
    };
    const onBlur = () => {
      const h = holdRef.current;
      h.flecha = null;
      if (h.raf) {
        cancelAnimationFrame(h.raf);
        h.raf = 0;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      onBlur();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueada]);

  const seleccionada = items.find((i) => i.id === seleccionadaId) ?? null;

  /** Si nada está seleccionado (primera carga), arranca en `idPorDefecto` — llamar tras recargar la lista. */
  const seleccionarSiVacia = (idPorDefecto: string | null) => {
    setSeleccionadaId((actual) => actual ?? idPorDefecto);
  };

  return {
    busqueda,
    setBusqueda,
    itemsFiltrados,
    seleccionadaId,
    setSeleccionadaId,
    seleccionada,
    cursorId,
    scrollRef,
    virtualizer,
    seleccionarSiVacia,
  };
}
