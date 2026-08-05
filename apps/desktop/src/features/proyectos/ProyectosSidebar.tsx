import { CalendarRange, ChevronDown, ChevronRight, FilePlus2, Folder, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Proyecto } from "./types";

export function ProyectosSidebar({
  proyectos,
  seleccionado,
  expandidos,
  onSelect,
  onToggleExpand,
  onAgregar,
  onEliminar,
  onOpenHoja,
  onOpenPrograma,
}: {
  proyectos: Proyecto[];
  seleccionado: string | null;
  expandidos: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onAgregar: () => void;
  onEliminar: () => void;
  onOpenHoja: (id: string) => void;
  onOpenPrograma: (id: string) => void;
}) {
  return (
    <div className="flex flex-col py-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Proyectos
        </span>
        <div className="flex items-center gap-0.5">
          <button
            title="Agregar proyecto"
            onClick={onAgregar}
            className="rounded p-1 text-muted-foreground hover:bg-background/80 hover:text-foreground"
          >
            <FilePlus2 size={14} />
          </button>
          <button
            title="Eliminar proyecto seleccionado"
            onClick={onEliminar}
            disabled={!seleccionado}
            className="rounded p-1 text-muted-foreground hover:bg-background/80 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-col">
        {proyectos.map((p) => {
          const abierto = expandidos.has(p.id);
          return (
            <div key={p.id}>
              <button
                onClick={() => {
                  onSelect(p.id);
                  onToggleExpand(p.id);
                }}
                className={cn(
                  "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-background/80 hover:text-foreground",
                  seleccionado === p.id && "bg-background text-foreground",
                )}
              >
                {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Folder size={13} />
                <span className="truncate">{p.nombre}</span>
              </button>
              {abierto && (
                <div className="ml-4 flex flex-col border-l border-border pl-2">
                  <button
                    onClick={() => onOpenHoja(p.id)}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  >
                    <FilePlus2 size={13} />
                    Hoja de presupuesto
                  </button>
                  <button
                    onClick={() => onOpenPrograma(p.id)}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  >
                    <CalendarRange size={13} />
                    Programa de Obra
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {proyectos.length === 0 && (
          <p className="px-2 py-2 text-[13px] text-muted-foreground">
            Sin proyectos. Usa el ícono de + para agregar uno.
          </p>
        )}
      </div>
    </div>
  );
}
