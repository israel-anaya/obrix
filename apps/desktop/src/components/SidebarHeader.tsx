import { PanelLeft } from "lucide-react";
import { AppMenu, type MenuDef } from "@/components/MenuBar";
import { OrganizacionSwitcher } from "@/features/organizacion/OrganizacionSwitcher";

/**
 * Primera fila del panel lateral: menú de la app (icono), selector de
 * organización y botón para ocultar el panel — el mismo bloque que en Notion
 * vive arriba del sidebar, no en la barra de la ventana.
 */
export function SidebarHeader({
  menus,
  onHideSidebar,
}: {
  menus: MenuDef[];
  onHideSidebar: () => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border px-1.5">
      <AppMenu menus={menus} />
      <OrganizacionSwitcher />
      <button
        type="button"
        title="Ocultar panel lateral"
        onClick={onHideSidebar}
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground"
      >
        <PanelLeft size={16} />
      </button>
    </div>
  );
}
