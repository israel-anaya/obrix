import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export const GRUPOS_CATALOGO = ["Costos Directos", "Costos Indirectos", "Clientes"] as const;

export function CatalogosSidebar({
  expandidos,
  onToggle,
}: {
  expandidos: Set<string>;
  onToggle: (grupo: string) => void;
}) {
  return (
    <div className="flex flex-col py-1">
      <div className="px-2 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Catálogos
        </span>
      </div>
      <div className="flex flex-col">
        {GRUPOS_CATALOGO.map((grupo) => {
          const abierto = expandidos.has(grupo);
          return (
            <div key={grupo}>
              <button
                onClick={() => onToggle(grupo)}
                className={cn(
                  "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-sm text-muted-foreground hover:bg-background/80 hover:text-foreground",
                  abierto && "text-foreground",
                )}
              >
                {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Folder size={13} />
                <span className="truncate">{grupo}</span>
              </button>
              {abierto && (
                <p className="ml-6 px-2 py-1 text-xs text-muted-foreground">Sin elementos.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
