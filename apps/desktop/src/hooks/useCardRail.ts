import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ordenarPor } from "@/lib/ordenar";

interface CardRailItem {
  id: string;
  clave: string;
  descripcion: string;
}

// Card width (`w-64` = 256px) + gap (`gap-1.5` = 6px) in `CardRail`: fixed
// size, so the virtualizer never needs to measure a card.
const CARD_WIDTH = 256;
const GAP = 6;

// Delay before auto-repeat kicks in (mirrors the OS's KeyboardDelay), then
// the rate it repeats at — same as `DataGrid`.
const REPEAT_DELAY_MS = 400;
const REPEAT_MS = 40;

// Before "confirming" the cursor (which triggers the detail panel's load —
// Tauri commands in the matching `*AnalisisInsumo`), wait for the cursor to
// stop moving. Without this, holding an arrow key would trigger one load per
// card it passes through.
const CONFIRM_DEBOUNCE_MS = 200;

type HorizontalArrowKey = "ArrowLeft" | "ArrowRight";

/**
 * Search, selection, horizontal virtualization, and keyboard navigation for
 * a `CardRail` — the "master" list of a master/detail Ficha view. Shared by
 * basico auxiliar, cuadrilla, and equipo de costo horario. Each domain still
 * loads its own list (its own Tauri command); this hook only manages which
 * item is selected, the search filter, and `←`/`→` navigation — including
 * `scrollToIndex` for the virtualized rail (the target card may not be
 * mounted yet).
 *
 * Selection runs at two speeds: the "cursor" moves instantly (used for the
 * highlight and for `scrollToIndex`), while `selectedId` — the one that
 * actually triggers the detail panel's load — is confirmed
 * `CONFIRM_DEBOUNCE_MS` after the cursor stops moving. A click or a
 * programmatic change (create/edit/delete) move both at once, without
 * waiting for the debounce.
 */
export function useCardRail<T extends CardRailItem>({
  items,
  /** Ignores arrow navigation while something modal (e.g. the create/edit Sheet) is open. */
  locked,
}: {
  items: T[];
  locked: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedIdInternal] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = ordenarPor(items, (i) => i.clave);
    if (!q) return sorted;
    return sorted.filter((i) => i.clave.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q));
  }, [items, search]);
  const filteredItemsRef = useRef(filteredItems);
  filteredItemsRef.current = filteredItems;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: filteredItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_WIDTH + GAP,
    overscan: 8,
    getItemKey: (index) => filteredItems[index]?.id ?? index,
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const cursorIdRef = useRef(cursorId);
  cursorIdRef.current = cursorId;

  // The "real" selection (click, create, edit, delete): instant — the cursor
  // follows right along, without going through the keyboard's debounce.
  const setSelectedId = (value: string | null | ((current: string | null) => string | null)) => {
    setSelectedIdInternal((current) => {
      const next = typeof value === "function" ? value(current) : value;
      setCursorId(next);
      return next;
    });
  };

  // Confirms the cursor after `CONFIRM_DEBOUNCE_MS` without moving.
  useEffect(() => {
    if (cursorId === selectedId) return;
    const t = window.setTimeout(() => setSelectedIdInternal(cursorId), CONFIRM_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorId]);

  // Moves the cursor to index `idx` (clamped to the filtered list's bounds)
  // and brings it into view — `scrollToIndex` rather than a ref because the
  // target card may not be mounted (virtualization).
  const moveCursorTo = (idx: number) => {
    const list = filteredItemsRef.current;
    if (list.length === 0) return;
    const clampedIdx = Math.min(Math.max(idx, 0), list.length - 1);
    const target = list[clampedIdx];
    if (!target) return;
    setCursorId(target.id);
    virtualizerRef.current.scrollToIndex(clampedIdx, { align: "auto" });
  };

  const step = (key: HorizontalArrowKey) => {
    const list = filteredItemsRef.current;
    if (list.length === 0) return;
    const currentIdx = list.findIndex((i) => i.id === cursorIdRef.current);
    const delta = key === "ArrowLeft" ? -1 : 1;
    moveCursorTo(currentIdx === -1 ? 0 : currentIdx + delta);
  };

  // Own auto-repeat, same as `DataGrid` (see `apps/desktop/src/components/grid/DataGrid.tsx`):
  // the first real `keydown` moves instantly; the OS's `repeat` echoes are
  // dropped, and this loop (rAF) takes over movement at a controlled pace —
  // so native repeat never outruns the virtualizer's overscan.
  const holdRef = useRef<{ key: HorizontalArrowKey | null; raf: number; startedAt: number; lastMove: number }>({
    key: null,
    raf: 0,
    startedAt: 0,
    lastMove: 0,
  });

  const loopRef = useRef<(t: number) => void>(() => {});
  loopRef.current = (t: number) => {
    const h = holdRef.current;
    if (!h.key) {
      h.raf = 0;
      return;
    }
    h.raf = requestAnimationFrame((now) => loopRef.current(now));
    if (t - h.startedAt < REPEAT_DELAY_MS) return;
    if (t - h.lastMove < REPEAT_MS) return;
    h.lastMove = t;
    step(h.key);
  };

  useEffect(() => {
    const isArrowKey = (key: string): key is HorizontalArrowKey => key === "ArrowLeft" || key === "ArrowRight";

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isArrowKey(e.key)) return;
      if (locked) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (filteredItemsRef.current.length === 0) return;
      e.preventDefault();
      if (e.repeat) return;
      step(e.key);
      const h = holdRef.current;
      h.key = e.key;
      h.startedAt = performance.now();
      h.lastMove = h.startedAt;
      if (!h.raf) h.raf = requestAnimationFrame((now) => loopRef.current(now));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isArrowKey(e.key)) return;
      const h = holdRef.current;
      if (h.key !== e.key) return;
      h.key = null;
      if (h.raf) {
        cancelAnimationFrame(h.raf);
        h.raf = 0;
      }
    };
    const onBlur = () => {
      const h = holdRef.current;
      h.key = null;
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
  }, [locked]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  /** If nothing is selected yet (first load), start on `defaultId` — call after reloading the list. */
  const selectIfEmpty = (defaultId: string | null) => {
    setSelectedId((current) => current ?? defaultId);
  };

  return {
    search,
    setSearch,
    filteredItems,
    selectedId,
    setSelectedId,
    selected,
    cursorId,
    scrollRef,
    virtualizer,
    selectIfEmpty,
  };
}
