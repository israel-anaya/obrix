import { Package } from "lucide-react";
import type { Insumo, TipoInsumo } from "@/lib/types";

const GRUPOS: { tipo: TipoInsumo; label: string }[] = [
  { tipo: "material", label: "Material" },
  { tipo: "mano_obra", label: "Mano de obra" },
  { tipo: "equipo_herramienta", label: "Equipo/herramienta" },
];

export function InsumoList({
  insumos,
  onOpenCatalogo,
}: {
  insumos: Insumo[];
  onOpenCatalogo: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 p-2">
      <button
        onClick={onOpenCatalogo}
        className="px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        Insumos
      </button>
      {GRUPOS.map((grupo) => {
        const items = insumos.filter((i) => i.tipo === grupo.tipo);
        if (items.length === 0) return null;
        return (
          <div key={grupo.tipo} className="flex flex-col">
            <span className="px-2 py-1 text-xs text-muted-foreground">{grupo.label}</span>
            {items.map((i) => (
              <button
                key={i.id}
                onClick={onOpenCatalogo}
                className="flex items-center gap-1.5 rounded-md py-1 pl-4 pr-2 text-left text-sm text-muted-foreground hover:bg-background/80 hover:text-foreground"
              >
                <Package className="h-3 w-3 shrink-0" strokeWidth={2} />
                <span className="truncate">
                  <span className="num text-xs text-muted-foreground">{i.clave}</span> {i.descripcion}
                </span>
              </button>
            ))}
          </div>
        );
      })}
      {insumos.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">Sin insumos todavía.</p>
      )}
    </div>
  );
}
