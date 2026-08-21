import type { MutableRefObject, ReactNode } from "react";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { ActionBar, ActionBarMenu } from "@/components/ActionBar";
import { SearchInput } from "@/components/SearchInput";
import { cn } from "@/lib/utils";
import { fmt } from "../analisis-insumo/formato";

interface ConClaveDescripcion {
  id: string;
  clave: string;
  descripcion: string;
}

/**
 * Franja superior de una vista "Ficha": barra de acciones (Nuevo/Editar,
 * Recargar/Eliminar) + buscador, y debajo una tira de tarjetas con scroll
 * horizontal — una por elemento, con clave, costo total en pastilla,
 * descripción truncada y un desglose específico de dominio (`renderDesglose`,
 * el único slot no genérico). Compartido por básico auxiliar, cuadrilla y
 * equipo de costo horario.
 */
export function FranjaSuperior<T extends ConClaveDescripcion>({
  items,
  seleccionadaId,
  onSeleccionar,
  itemRefs,
  cargando,
  mensajeVacio,
  busqueda,
  onBusquedaChange,
  tituloNuevo,
  onNuevo,
  tituloEditar,
  onEditar,
  tituloEliminar,
  onEliminar,
  onRecargar,
  costoTotal,
  renderDesglose,
}: {
  items: T[];
  seleccionadaId: string | null;
  onSeleccionar: (id: string) => void;
  itemRefs: MutableRefObject<Map<string, HTMLButtonElement>>;
  cargando: boolean;
  mensajeVacio: string;
  busqueda: string;
  onBusquedaChange: (v: string) => void;
  tituloNuevo: string;
  onNuevo: () => void;
  tituloEditar: string;
  onEditar: () => void;
  tituloEliminar: string;
  onEliminar: () => void;
  onRecargar: () => void;
  costoTotal: (item: T) => string;
  renderDesglose: (item: T) => ReactNode;
}) {
  const haySeleccion = seleccionadaId !== null;

  return (
    <div className="flex flex-col gap-2 border-b border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ActionBar
            actions={[
              { icon: Plus, title: tituloNuevo, onClick: onNuevo },
              { icon: Pencil, title: tituloEditar, onClick: onEditar, disabled: !haySeleccion },
            ]}
          />
          <SearchInput value={busqueda} onChange={onBusquedaChange} />
        </div>
        <ActionBarMenu
          menu={[
            { icon: RefreshCcw, title: "Recargar", onClick: onRecargar },
            { icon: Trash2, title: tituloEliminar, onClick: onEliminar, disabled: !haySeleccion, destructive: true },
          ]}
        />
      </div>

      <div className="min-w-0">
        {cargando && items.length === 0 ? (
          <p className="py-1.5 text-xs text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="py-1.5 text-xs text-muted-foreground">{mensajeVacio}</p>
        ) : (
          <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
            {items.map((item) => {
              const activa = seleccionadaId === item.id;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(item.id, el);
                    else itemRefs.current.delete(item.id);
                  }}
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
          </div>
        )}
      </div>
    </div>
  );
}
