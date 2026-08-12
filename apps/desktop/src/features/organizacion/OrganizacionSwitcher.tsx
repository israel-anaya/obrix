import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";

/**
 * Selector de organización activa, fijo en la parte superior del sidebar —
 * es contexto global (catálogos y proyectos cuelgan de la organización), no
 * algo propio de la sección Proyectos o Catálogos. Cambiar aquí dispara el
 * evento que consumen las vistas suscritas via `useOrganizacionActiva`.
 */
export function OrganizacionSwitcher() {
  const { organizaciones, organizacionActivaId, cambiarOrganizacion } = useOrganizacionActiva();

  if (organizaciones.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-2">
      <Building2 size={14} className="shrink-0 text-muted-foreground" />
      <Select value={organizacionActivaId ?? undefined} onValueChange={cambiarOrganizacion}>
        <SelectTrigger
          size="sm"
          className="h-6 w-full border-none bg-transparent px-1 text-sm font-medium shadow-none hover:bg-background/80"
        >
          <SelectValue placeholder="Selecciona una organización" />
        </SelectTrigger>
        <SelectContent>
          {organizaciones.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.razon_social}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
