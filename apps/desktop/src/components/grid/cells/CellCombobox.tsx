import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CellCombobox({
  options,
  initialValue,
  filterOnOpen = false,
  className,
  onPick,
  onDiscard,
  onTab,
  onEnter,
  onCommitRow,
}: {
  options: readonly string[];
  initialValue: string;
  /** True when opened by typing (replace); F2/click show the full list. */
  filterOnOpen?: boolean;
  className: string;
  onPick: (value: string) => void;
  onDiscard: () => void;
  onTab: (shift: boolean) => void;
  onEnter: (shift: boolean) => void;
  onCommitRow: () => void;
}) {
  const [text, setText] = useState(initialValue);
  const [filtering, setFiltering] = useState(filterOnOpen);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o === initialValue)));
  const discardedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const matches = options.filter((o) => o.toLowerCase().includes(text.trim().toLowerCase()));
  const visible = filtering ? matches : options;
  const last = Math.max(visible.length - 1, 0);

  useLayoutEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector("[data-combo-active]") as HTMLElement | null;
    if (!list || !item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [active, visible.length]);

  // The scroll listener is capturing (to hear the grid container's scroll,
  // which does not bubble), so it fires very often: it is marked passive and
  // coalesced into a rAF, and only re-renders if the input actually moved —
  // `getBoundingClientRect` returns a new object every time.
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      const r = inputRef.current?.getBoundingClientRect() ?? null;
      setRect((prev) =>
        prev && r && prev.top === r.top && prev.bottom === r.bottom && prev.left === r.left && prev.width === r.width
          ? prev
          : r,
      );
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    measure();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, []);

  const canon = (t: string) => options.find((o) => o.toLowerCase() === t.trim().toLowerCase()) ?? null;

  const pick = (value: string) => {
    if (discardedRef.current) return;
    discardedRef.current = true;
    onPick(value);
  };

  const commitFilter = (): boolean => {
    if (discardedRef.current) return false;
    const exact = canon(text);
    if (exact) {
      pick(exact);
      return true;
    }
    const highlighted = visible[active] ?? visible[0];
    if (highlighted && (text.trim() !== "" || !filtering)) {
      pick(highlighted);
      return true;
    }
    if (initialValue && options.includes(initialValue) && text.trim() === "") {
      pick(initialValue);
      return true;
    }
    discardedRef.current = true;
    onDiscard();
    return false;
  };

  const maxList = 192;
  const openUp = rect ? window.innerHeight - rect.bottom < maxList && rect.top > window.innerHeight - rect.bottom : false;

  return (
    <>
      <div className="relative flex h-full min-w-0 items-center">
        <input
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFiltering(true);
            setActive(0);
          }}
          // Same as in `CellEditor`: when it was opened by typing
          // (`filterOnOpen`), the text is the key just pressed — selecting it
          // would let the next key wipe it.
          onFocus={(e) => {
            if (!filterOnOpen) e.currentTarget.select();
            else e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
          }}
          onBlur={() => {
            if (!discardedRef.current) commitFilter();
          }}
          // Igual que en `CellEditor`: dentro del editor manda el menú nativo
          // del navegador, no el del grid.
          onContextMenu={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              discardedRef.current = true;
              onDiscard();
              return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.key === "s" || e.key === "S")) {
              e.preventDefault();
              if (commitFilter()) onCommitRow();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(last, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "PageDown") {
              e.preventDefault();
              setActive((i) => Math.min(last, i + 8));
              return;
            }
            if (e.key === "PageUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 8));
              return;
            }
            if (e.key === "Home") {
              e.preventDefault();
              setActive(0);
              return;
            }
            if (e.key === "End") {
              e.preventDefault();
              setActive(last);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const picked = visible[active] ?? canon(text);
              if (picked) pick(picked);
              else if (!commitFilter()) return;
              onEnter(e.shiftKey);
              return;
            }
            if (e.key === "Tab") {
              e.preventDefault();
              if (commitFilter()) onTab(e.shiftKey);
            }
          }}
          className={cn(className, "pr-5")}
        />
        <ChevronDown size={16} className="pointer-events-none absolute right-0.5 text-muted-foreground" />
      </div>
      {rect &&
        createPortal(
          <ul
            ref={listRef}
            className="fixed z-[400] max-h-48 overflow-auto border border-neutral-300 bg-white py-0.5 text-xs text-neutral-900 shadow-md"
            style={{
              top: openUp ? undefined : rect.bottom,
              bottom: openUp ? window.innerHeight - rect.top : undefined,
              left: rect.left,
              width: Math.max(rect.width, 160),
            }}
          >
            {visible.length === 0 ? (
              <li className="px-2 py-1 text-neutral-500">Sin matches</li>
            ) : (
              visible.map((o, i) => (
                <li key={o}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full px-2 py-1 text-left text-neutral-900 hover:bg-neutral-100",
                      i === active && "bg-neutral-200",
                    )}
                    data-combo-active={i === active ? "" : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
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
