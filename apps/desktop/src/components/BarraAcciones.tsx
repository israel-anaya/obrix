import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AccionBarra {
  icono: LucideIcon;
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Fila de botones-ícono para el header de una vista de catálogo (agregar,
 * eliminar, y cualquier acción extra que necesite esa vista en particular).
 */
export function BarraAcciones({ acciones }: { acciones: AccionBarra[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {acciones.map((accion, i) => (
        <button
          key={i}
          type="button"
          title={accion.titulo}
          onClick={accion.onClick}
          disabled={accion.disabled}
          className={cn(
            "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
            accion.disabled && "opacity-30",
          )}
        >
          <accion.icono size={14} />
        </button>
      ))}
    </div>
  );
}
