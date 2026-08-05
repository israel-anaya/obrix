import { ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Concepto } from "@/lib/types";
import { aplanarArbol } from "./tree";

export function ConceptoTree({
  conceptos,
  activeId,
  onOpenCatalogo,
  onOpenConcepto,
}: {
  conceptos: Concepto[];
  activeId: string | null;
  onOpenCatalogo: () => void;
  onOpenConcepto: (id: string) => void;
}) {
  const filas = aplanarArbol(conceptos);

  return (
    <div className="flex flex-col gap-1 p-2">
      <button
        onClick={onOpenCatalogo}
        className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        Conceptos
      </button>
      {filas.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpenConcepto(c.id)}
          style={{ paddingLeft: `${8 + c.profundidad * 14}px` }}
          className={cn(
            "flex items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm text-muted-foreground hover:bg-background/80 hover:text-foreground",
            activeId === c.id && "bg-background text-foreground",
          )}
        >
          <ListTree className="h-3 w-3 shrink-0" strokeWidth={2} />
          <span className="truncate">
            <span className="num text-xs text-muted-foreground">{c.clave}</span> {c.descripcion}
          </span>
        </button>
      ))}
      {filas.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">Sin conceptos todavía.</p>
      )}
    </div>
  );
}
