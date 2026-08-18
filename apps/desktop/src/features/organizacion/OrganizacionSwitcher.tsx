import { useState } from "react";
import { Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";

/**
 * Selector de organización activa, en la barra superior junto al menú de la
 * app — es contexto global (catálogos y proyectos cuelgan de la organización).
 * Cambiar aquí dispara el evento que consumen las vistas suscritas via
 * `useOrganizacionActiva`.
 */
export function OrganizacionSwitcher() {
  const { organizaciones, organizacionActivaId, cambiarOrganizacion } = useOrganizacionActiva();
  const [error, setError] = useState<string | null>(null);

  if (organizaciones.length === 0) return null;

  const activa = organizaciones.find((org) => org.id === organizacionActivaId);
  const etiqueta = activa?.razon_social ?? "Selecciona una organización";

  const handleSeleccionar = (organizacionId: string) => {
    if (organizacionId === organizacionActivaId) return;
    setError(null);
    Promise.resolve(cambiarOrganizacion(organizacionId)).catch((e) => setError(String(e)));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={error ?? etiqueta}
          className="flex h-7 max-w-[220px] min-w-0 items-center gap-1.5 rounded px-1.5 text-left hover:bg-background/80"
        >
          <span className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-primary text-primary-foreground">
            <Building2 size={11} />
          </span>
          <span className="truncate text-[13px] leading-none text-foreground">{etiqueta}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="start">
        <DropdownMenuLabel>Organización</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={organizacionActivaId ?? undefined} onValueChange={handleSeleccionar}>
          {organizaciones.map((org) => (
            <DropdownMenuRadioItem key={org.id} value={org.id}>
              {org.razon_social}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
