import { Bell, ChevronsUpDown, CreditCard, LogOut, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AccountInfo } from "@/lib/types";

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Identidad de la sesión activa, fija en la parte inferior del sidebar —
 * independiente de la sección (Proyectos/Catálogos) para que no desaparezca
 * al cambiar de pestaña.
 * Del menú, solo "Cerrar sesión" está implementado — el resto son opciones
 * de la referencia visual sin funcionalidad detrás todavía.
 */
export function CuentaFooter({
  cuenta,
  onCerrarSesion,
}: {
  cuenta: AccountInfo | null;
  onCerrarSesion: () => void;
}) {
  if (!cuenta) return null;

  return (
    <div className="shrink-0 border-t border-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md p-1 text-left hover:bg-background/80">
          <Avatar>
            <AvatarFallback>{iniciales(cuenta.nombre)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium leading-tight text-foreground">
              {cuenta.nombre}
            </span>
            <span className="truncate text-xs leading-tight text-muted-foreground">
              {cuenta.correo}
            </span>
          </div>
          <ChevronsUpDown size={16} className="shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-2 font-normal">
            <Avatar>
              <AvatarFallback>{iniciales(cuenta.nombre)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium leading-tight text-foreground">
                {cuenta.nombre}
              </span>
              <span className="truncate text-xs leading-tight text-muted-foreground">
                {cuenta.correo}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <UserRound size={16} />
            Cuenta
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <CreditCard size={16} />
            Facturación
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Bell size={16} />
            Notificaciones
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onCerrarSesion}>
            <LogOut size={16} />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
