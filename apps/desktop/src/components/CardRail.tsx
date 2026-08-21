import { type ReactNode, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/formato";

interface CardRailItem {
  id: string;
  // `clave`/`descripcion`: real domain field names (Spanish), shared by
  // every catalog entity this renders — not renamed here.
  clave: string;
  descripcion: string;
}

/**
 * Horizontally scrolling, virtualized strip of cards — one per item, with a
 * key, total cost pill, truncated description, and a domain-specific
 * breakdown (`renderBreakdown`, the only non-generic slot). Used as the
 * "master" list of a master/detail Ficha view; the header (actions, search)
 * is built by each caller, the same way every `*Seccion.tsx` builds its own
 * around `DataGrid`.
 *
 * `scrollRef`/`virtualizer` come from `useCardRail` — that hook needs
 * `scrollToIndex` for keyboard navigation, so it owns the virtualizer; this
 * component only consumes it to paint. `cursorId` (not `selectedId`) is what
 * gets highlighted: it moves instantly with the keyboard, without waiting
 * for the debounce that confirms the real selection (see the hook).
 */
export function CardRail<T extends CardRailItem>({
  items,
  cursorId,
  onSelect,
  scrollRef,
  virtualizer,
  loading,
  emptyMessage,
  totalCost,
  renderBreakdown,
}: {
  items: T[];
  cursorId: string | null;
  onSelect: (id: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  loading: boolean;
  emptyMessage: string;
  totalCost: (item: T) => string;
  renderBreakdown: (item: T) => ReactNode;
}) {
  return (
    <div className="min-w-0 border-b border-border p-2">
      {loading && items.length === 0 ? (
        <p className="py-1.5 text-xs text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="py-1.5 text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div ref={scrollRef} className="overflow-x-auto pb-1">
          {(() => {
            const virtualItems = virtualizer.getVirtualItems();
            const paddingLeft = virtualItems.length > 0 ? virtualItems[0].start : 0;
            const paddingRight =
              virtualItems.length > 0
                ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
                : 0;
            return (
              <div className="flex items-stretch gap-1.5">
                {paddingLeft > 0 && <div aria-hidden className="shrink-0" style={{ width: paddingLeft }} />}
                {virtualItems.map((virtualItem) => {
                  const item = items[virtualItem.index];
                  if (!item) return null;
                  const active = cursorId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onSelect(item.id)}
                      className={cn(
                        "relative flex w-64 shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left outline-none hover:bg-muted/50",
                        active ? "border-primary bg-primary/10" : "border-border",
                      )}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="font-mono text-[15px] font-semibold tabular-nums tracking-tight text-foreground">
                          {item.clave}
                        </span>
                        <span className="shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                          ${fmt(totalCost(item))}
                        </span>
                      </div>
                      <span className="line-clamp-2 w-full font-mono text-xs font-normal text-muted-foreground">{item.descripcion}</span>
                      {renderBreakdown(item)}
                    </button>
                  );
                })}
                {paddingRight > 0 && <div aria-hidden className="shrink-0" style={{ width: paddingRight }} />}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
