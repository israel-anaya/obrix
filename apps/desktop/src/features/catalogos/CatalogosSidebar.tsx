import { useState } from "react";
import { ChevronDown, ChevronRight, FilePlus2, FileText, Layers, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ItemCatalogo {
  id: string;
  nombre: string;
}

interface GrupoDef {
  id: string;
  label: string;
  modo: "arbol" | "lista";
  nombreBase: string;
}

const GRUPOS: GrupoDef[] = [
  { id: "costos-directos", label: "Costos Directos", modo: "arbol", nombreBase: "Costo directo" },
  { id: "costos-indirectos", label: "Costos Indirectos", modo: "arbol", nombreBase: "Costo indirecto" },
  { id: "clientes", label: "Clientes", modo: "lista", nombreBase: "Cliente" },
];

export function CatalogosSidebar({ onOpenGrupo }: { onOpenGrupo: (label: string) => void }) {
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(GRUPOS[0].id);
  const [itemsPorGrupo, setItemsPorGrupo] = useState<Record<string, ItemCatalogo[]>>({
    "costos-directos": [],
    "costos-indirectos": [],
    clientes: [],
  });
  const [seleccionPorGrupo, setSeleccionPorGrupo] = useState<Record<string, string | null>>({
    "costos-directos": null,
    "costos-indirectos": null,
    clientes: null,
  });
  const [nodosExpandidos, setNodosExpandidos] = useState<Set<string>>(new Set());

  const agregar = (grupo: GrupoDef) => {
    const items = itemsPorGrupo[grupo.id];
    const nuevo: ItemCatalogo = { id: crypto.randomUUID(), nombre: `${grupo.nombreBase} ${items.length + 1}` };
    setItemsPorGrupo((prev) => ({ ...prev, [grupo.id]: [...prev[grupo.id], nuevo] }));
    setSeleccionPorGrupo((prev) => ({ ...prev, [grupo.id]: nuevo.id }));
  };

  const eliminar = (grupo: GrupoDef) => {
    const seleccionado = seleccionPorGrupo[grupo.id];
    if (!seleccionado) return;
    setItemsPorGrupo((prev) => ({
      ...prev,
      [grupo.id]: prev[grupo.id].filter((i) => i.id !== seleccionado),
    }));
    setSeleccionPorGrupo((prev) => ({ ...prev, [grupo.id]: null }));
  };

  const toggleNodo = (id: string) => {
    setNodosExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col py-1">
      {GRUPOS.map((grupo) => {
        const abierto = grupoAbierto === grupo.id;
        const items = itemsPorGrupo[grupo.id];
        const seleccionado = seleccionPorGrupo[grupo.id];

        return (
          <div key={grupo.id} className="flex flex-col">
            <button
              onClick={() => {
                setGrupoAbierto((prev) => (prev === grupo.id ? null : grupo.id));
                onOpenGrupo(grupo.label);
              }}
              className="flex items-center justify-between px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-background/80 hover:text-foreground"
            >
              <span className="flex items-center gap-1">
                {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="text-[11px] font-semibold uppercase tracking-wide">{grupo.label}</span>
              </span>
              <span className="flex items-center gap-0.5">
                <span
                  role="button"
                  title={`Agregar en ${grupo.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    agregar(grupo);
                  }}
                  className="rounded p-1 hover:bg-background hover:text-foreground"
                >
                  <FilePlus2 size={13} />
                </span>
                <span
                  role="button"
                  title={`Eliminar seleccionado en ${grupo.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    eliminar(grupo);
                  }}
                  className={cn(
                    "rounded p-1 hover:bg-background hover:text-foreground",
                    !seleccionado && "pointer-events-none opacity-30",
                  )}
                >
                  <Trash2 size={13} />
                </span>
              </span>
            </button>

            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-150 ease-out",
                abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="flex h-40 min-h-[64px] max-h-[70vh] flex-col overflow-auto resize-y pb-1">
                  {items.length === 0 && (
                    <p className="px-2 py-1 text-[13px] text-muted-foreground">
                      Sin elementos. Usa + para agregar uno.
                    </p>
                  )}

                  {grupo.modo === "lista" &&
                    items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() =>
                          setSeleccionPorGrupo((prev) => ({ ...prev, [grupo.id]: item.id }))
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-2 py-1 pl-6 text-left text-[13px] text-muted-foreground hover:bg-background/80 hover:text-foreground",
                          seleccionado === item.id && "bg-background text-foreground",
                        )}
                      >
                        <User size={13} />
                        <span className="truncate">{item.nombre}</span>
                      </button>
                    ))}

                  {grupo.modo === "arbol" &&
                    items.map((item) => {
                      const nodoAbierto = nodosExpandidos.has(item.id);
                      return (
                        <div key={item.id}>
                          <button
                            onClick={() => {
                              setSeleccionPorGrupo((prev) => ({ ...prev, [grupo.id]: item.id }));
                              toggleNodo(item.id);
                            }}
                            className={cn(
                              "flex w-full items-center gap-1 rounded-md px-2 py-1 pl-4 text-left text-[13px] text-muted-foreground hover:bg-background/80 hover:text-foreground",
                              seleccionado === item.id && "bg-background text-foreground",
                            )}
                          >
                            {nodoAbierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <Layers size={13} />
                            <span className="truncate">{item.nombre}</span>
                          </button>
                          {nodoAbierto && (
                            <div className="ml-6 flex flex-col border-l border-border pl-2">
                              <div className="flex items-center gap-1.5 px-2 py-1 text-[13px] text-muted-foreground">
                                <FileText size={12} />
                                Detalle 1
                              </div>
                              <div className="flex items-center gap-1.5 px-2 py-1 text-[13px] text-muted-foreground">
                                <FileText size={12} />
                                Detalle 2
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
