import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Buscador compacto para vivir junto a `BarraAcciones`, en vez de su propia
 * fila arriba de la tabla — también lo usa `DataGrid` para el suyo interno,
 * de ahí que el borde del contenedor y el ancho del input sean parametrizables:
 * cada quien encaja distinto en su barra.
 */
export function SearchInput({
  value,
  onChange,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("flex h-6 items-center gap-1 rounded-md border border-input px-1.5", className)}>
      <Search size={12} className="shrink-0 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar…"
        className={cn("h-5 w-36 border-none px-0 py-0 text-xs shadow-none focus-visible:ring-0", inputClassName)}
      />
      {value && (
        <button
          type="button"
          title="Limpiar búsqueda"
          onClick={() => onChange("")}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
