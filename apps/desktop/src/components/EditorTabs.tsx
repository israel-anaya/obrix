import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditorTabInfo {
  id: string;
  title: string;
  closable: boolean;
  icon?: LucideIcon;
}

const SCROLL_STEP = 160;

export function EditorTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  actions,
  renderTabExtra,
}: {
  tabs: EditorTabInfo[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  actions?: ReactNode;
  /** Contenido extra (p.ej. iconos de sub-vista) dentro de una pestaña — solo se pide para la pestaña activa. */
  renderTabExtra?: (tab: EditorTabInfo) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    el.addEventListener("scroll", updateScrollState);
    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("scroll", updateScrollState);
    };
  }, [tabs.length]);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div className="flex items-stretch border-b border-border bg-muted/20">
      {(canScrollLeft || canScrollRight) && (
        <div className="flex shrink-0 items-center border-r border-border">
          <button
            onClick={() => scrollBy(-SCROLL_STEP)}
            disabled={!canScrollLeft}
            className="flex items-center px-1 py-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="Desplazar pestañas a la izquierda"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => scrollBy(SCROLL_STEP)}
            disabled={!canScrollRight}
            className="flex items-center px-1 py-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="Desplazar pestañas a la derecha"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
      <div ref={scrollRef} className="no-scrollbar flex min-w-0 flex-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "group flex cursor-pointer items-center gap-2 border-r border-border px-3 py-2 text-sm text-muted-foreground",
                isActive && "bg-background text-foreground",
              )}
            >
              {tab.icon && <tab.icon size={13} className="shrink-0" />}
              <span className="truncate">{tab.title}</span>
              {isActive && renderTabExtra?.(tab)}
              {tab.closable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.id);
                  }}
                  className="rounded opacity-0 hover:bg-border group-hover:opacity-100"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border px-1.5">{actions}</div>
      )}
    </div>
  );
}
