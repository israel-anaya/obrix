import { useState } from "react";
import { Building2, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";

/**
 * Selector de organización activa, fijo en la parte superior del sidebar —
 * es contexto global (catálogos y proyectos cuelgan de la organización), no
 * algo propio de la sección Proyectos o Catálogos. Cambiar aquí dispara el
 * evento que consumen las vistas suscritas via `useOrganizacionActiva`.
 */
export function OrganizacionSwitcher() {
  const { organizaciones, organizacionActivaId, cambiarOrganizacion } = useOrganizacionActiva();
  const [error, setError] = useState<string | null>(null);

  if (organizaciones.length === 0) return null;

  const activa = organizaciones.find((org) => org.id === organizacionActivaId);

  const handleSeleccionar = (organizacionId: string) => {
    if (organizacionId === organizacionActivaId) return;
    setError(null);
    Promise.resolve(cambiarOrganizacion(organizacionId)).catch((e) => setError(String(e)));
  };

  return (
    <div className="shrink-0 border-b border-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-auto w-full justify-start gap-2 rounded-md border-none bg-transparent px-2 py-1.5 text-left shadow-none hover:bg-background/80"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Building2 size={16} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-start">
              <span className="w-full truncate text-sm font-medium leading-tight text-foreground">
                {activa?.razon_social ?? "Selecciona una organización"}
              </span>
              <span className="w-full truncate text-xs leading-tight text-muted-foreground">
                {activa?.rfc ?? ""}
              </span>
            </div>
            <ChevronsUpDown size={16} className="shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)" align="start">
          <DropdownMenuRadioGroup value={organizacionActivaId ?? undefined} onValueChange={handleSeleccionar}>
            {organizaciones.map((org) => (
              <DropdownMenuRadioItem key={org.id} value={org.id}>
                {org.razon_social}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p className="mt-1 px-2 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
