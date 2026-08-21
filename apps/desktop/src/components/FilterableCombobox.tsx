import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

/**
 * Combobox with text filtering — an alternative to `<select>` for long
 * catalogs (FASAR categories, tools, …) where typing the key or part of the
 * description is faster than scrolling through the list.
 */
export function FilterableCombobox({
  options,
  placeholder = "Buscar…",
  onSelect,
  onCancel,
  className,
}: {
  options: { id: string; label: string }[];
  placeholder?: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  // Avoids double-closing: Escape/clicking an option already resolves the
  // combobox, so the blur that follows shouldn't trigger `onCancel` again.
  const resolvedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLUListElement>(null);

  // Un `autoFocus` normal pierde la carrera cuando este combobox aparece
  // tras cerrarse un menú (Radix Dropdown/Select devuelve el foco a su
  // trigger después del commit); reforzarlo en un microtask lo gana.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, text]);

  // Virtualized like `CardRail`/`useCardRail` — catalogs (materiales, etc.)
  // can run into the hundreds/thousands, so only the visible rows (+
  // overscan) are mounted. Rows aren't truncated (labels can wrap to more
  // than one line), so sizes are measured dynamically instead of assumed
  // fixed like `CardRail`'s cards.
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 8,
    getItemKey: (index) => filtered[index]?.id ?? index,
  });

  // Arrow-key navigation moves `active` without the browser scrolling the
  // list on its own — the highlighted option can end up outside the
  // scrollable area, and under virtualization it may not even be mounted
  // yet, so `scrollToIndex` (not `scrollIntoView`) brings it into view.
  useEffect(() => {
    virtualizer.scrollToIndex(active, { align: "auto" });
  }, [active, virtualizer]);

  const select = (id: string) => {
    resolvedRef.current = true;
    onSelect(id);
  };

  const cancel = () => {
    resolvedRef.current = true;
    onCancel();
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          virtualizer.scrollToOffset(0);
        }}
        onBlur={() => {
          // Gives time for an option's `onClick` to register before closing.
          setTimeout(() => {
            if (!resolvedRef.current) cancel();
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancel();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(filtered.length - 1, i + 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const option = filtered[active];
            if (option) select(option.id);
          }
        }}
        className={cn("w-full rounded border border-border bg-background px-1.5 py-1 text-xs", className)}
      />
      <ul
        ref={scrollRef}
        className="absolute z-20 mt-0.5 max-h-48 w-full overflow-auto rounded border border-neutral-300 bg-white text-xs text-neutral-900 shadow-md"
      >
        {filtered.length === 0 ? (
          <li className="px-2 py-1 text-neutral-500">Sin resultados</li>
        ) : (
          (() => {
            const virtualItems = virtualizer.getVirtualItems();
            const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
            const paddingBottom =
              virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;
            return (
              <>
                {paddingTop > 0 && <li aria-hidden style={{ height: paddingTop }} />}
                {virtualItems.map((vi) => {
                  const o = filtered[vi.index];
                  if (!o) return null;
                  const isActive = vi.index === active;
                  return (
                    <li key={vi.key} ref={virtualizer.measureElement} data-index={vi.index}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => select(o.id)}
                        onMouseEnter={() => setActive(vi.index)}
                        className={cn("flex w-full px-2 py-1 text-left hover:bg-neutral-100", isActive && "bg-neutral-200")}
                      >
                        {o.label}
                      </button>
                    </li>
                  );
                })}
                {paddingBottom > 0 && <li aria-hidden style={{ height: paddingBottom }} />}
              </>
            );
          })()
        )}
      </ul>
    </div>
  );
}
