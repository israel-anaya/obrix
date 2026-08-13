import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Buscador compacto para vivir junto a `BarraAcciones`, en vez de su propia fila arriba de la tabla. */
export function Buscador({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex h-6 items-center gap-1 rounded-md border border-input px-1.5">
      <Search size={12} className="shrink-0 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar…"
        className="h-5 w-36 border-none px-0 py-0 text-xs shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
