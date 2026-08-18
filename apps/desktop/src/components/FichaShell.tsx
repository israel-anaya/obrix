import type { ReactNode } from "react";
import { X } from "lucide-react";
import { formatearFecha } from "@/lib/fecha";
import { cn } from "@/lib/utils";

/**
 * Marco compartido de las fichas de catálogo: encabezado, cuerpo, auditoría
 * y pie con Descartar/Guardar. El contenido de los campos lo pone cada ficha.
 */
export function FichaShell({
  titulo,
  vacio,
  item,
  nombresPorUsuarioId,
  puedeGuardar,
  guardando,
  onCerrar,
  onDescartar,
  onGuardar,
  children,
}: {
  titulo: string;
  vacio: string;
  item: {
    created_at: string;
    created_by: string;
    updated_at: string | null;
    updated_by: string | null;
  } | null;
  nombresPorUsuarioId: Record<string, string>;
  puedeGuardar: boolean;
  guardando: boolean;
  onCerrar: () => void;
  onDescartar: () => void;
  onGuardar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-xs font-semibold text-muted-foreground">{titulo}</h3>
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!item ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{vacio}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
          <div className="flex flex-col gap-3">
            {children}
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
              <span>Creado</span>
              <span className="text-right">{formatearFecha(item.created_at)}</span>
              <span>Creado por</span>
              <span className="truncate text-right">
                {nombresPorUsuarioId[item.created_by] ?? item.created_by}
              </span>
              <span>Actualizado</span>
              <span className="text-right">{item.updated_at ? formatearFecha(item.updated_at) : "—"}</span>
              <span>Actualizado por</span>
              <span className="truncate text-right">
                {item.updated_by ? (nombresPorUsuarioId[item.updated_by] ?? item.updated_by) : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {item && (
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onDescartar}
            disabled={!puedeGuardar || guardando}
            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={onGuardar}
            disabled={!puedeGuardar || guardando}
            className={cn(
              "rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90",
              (!puedeGuardar || guardando) && "opacity-50",
            )}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </div>
  );
}
