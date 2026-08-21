import { type ReactNode, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/formato";

interface ConClaveDescripcion {
  id: string;
  clave: string;
  descripcion: string;
}

/**
 * Tira de tarjetas con scroll horizontal — una por elemento, con clave, costo
 * total en pastilla, descripción truncada y un desglose específico de
 * dominio (`renderDesglose`, el único slot no genérico). Es la lista
 * "maestra" de una vista tipo Ficha; el header (acciones, buscador) lo arma
 * cada llamador por fuera, igual que hace cada `*Seccion.tsx` con su grid.
 * Compartido por básico auxiliar, cuadrilla y equipo de costo horario.
 *
 * `scrollRef`/`virtualizer` vienen de `useAnalisisMaestroDetalle` — ese hook
 * es quien necesita `scrollToIndex` para la navegación con teclado, así que
 * es dueño del virtualizador; este componente solo lo consume para pintar.
 * `cursorId` (no `seleccionadaId`) es lo que se resalta: se mueve al
 * instante con el teclado, sin esperar el debounce que confirma la
 * selección real (ver el hook).
 */
export function FranjaSuperior<T extends ConClaveDescripcion>({
  items,
  cursorId,
  onSeleccionar,
  scrollRef,
  virtualizer,
  cargando,
  mensajeVacio,
  costoTotal,
  renderDesglose,
}: {
  items: T[];
  cursorId: string | null;
  onSeleccionar: (id: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  cargando: boolean;
  mensajeVacio: string;
  costoTotal: (item: T) => string;
  renderDesglose: (item: T) => ReactNode;
}) {
  return (
    <div className="min-w-0 border-b border-border p-2">
      {cargando && items.length === 0 ? (
        <p className="py-1.5 text-xs text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="py-1.5 text-xs text-muted-foreground">{mensajeVacio}</p>
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
                  const activa = cursorId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={activa ? "true" : undefined}
                      onClick={() => onSeleccionar(item.id)}
                      className={cn(
                        "relative flex w-64 shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left outline-none hover:bg-muted/50",
                        activa ? "border-primary bg-primary/10" : "border-border",
                      )}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="font-mono text-[15px] font-semibold tabular-nums tracking-tight text-foreground">
                          {item.clave}
                        </span>
                        <span className="shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                          ${fmt(costoTotal(item))}
                        </span>
                      </div>
                      <span className="line-clamp-2 w-full font-mono text-xs font-normal text-muted-foreground">{item.descripcion}</span>
                      {renderDesglose(item)}
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
