import type { LucideIcon } from "lucide-react";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface AccionBarra {
  icono: LucideIcon;
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  /** Resalta la acción como destructiva dentro del desplegable (p. ej. eliminar). */
  destructivo?: boolean;
}

/**
 * Fila de botones-ícono para el header de una vista de catálogo (agregar,
 * editar, y cualquier acción extra que necesite esa vista en particular).
 * `menu` agrupa acciones secundarias (recargar, eliminar...) en un
 * desplegable aparte, para no saturar la barra de botones sueltos.
 */
export function BarraAcciones({ acciones, menu }: { acciones: AccionBarra[]; menu?: AccionBarra[] }) {
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

      {menu && menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Más acciones"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreVertical size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((accion, i) => (
              <DropdownMenuItem
                key={i}
                disabled={accion.disabled}
                variant={accion.destructivo ? "destructive" : "default"}
                onSelect={accion.onClick}
              >
                <accion.icono size={14} />
                {accion.titulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
