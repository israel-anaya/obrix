import { Minus, PanelLeft, Settings, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";

export interface MenuAction {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export interface MenuDef {
  id: string;
  label: string;
  actions: (MenuAction | "separator")[];
}

const win = getCurrentWindow();

export function MenuBar({
  menus,
  onOpenSettings,
  sidebarVisible,
  onToggleSidebar,
}: {
  menus: MenuDef[];
  onOpenSettings: () => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center border-b border-border bg-muted/60 text-sm">
      <Menubar className="h-8 rounded-none border-none bg-transparent p-0">
        {menus.map((menu) => (
          <MenubarMenu key={menu.id}>
            <MenubarTrigger className="rounded px-2 py-0.5 text-muted-foreground data-[state=open]:bg-background data-[state=open]:text-foreground">
              {menu.label}
            </MenubarTrigger>
            <MenubarContent>
              {menu.actions.map((action, i) =>
                action === "separator" ? (
                  <MenubarSeparator key={i} />
                ) : (
                  <MenubarItem
                    key={action.label}
                    disabled={action.disabled}
                    onClick={() => action.onClick?.()}
                  >
                    {action.label}
                    {action.shortcut && <MenubarShortcut>{action.shortcut}</MenubarShortcut>}
                  </MenubarItem>
                ),
              )}
            </MenubarContent>
          </MenubarMenu>
        ))}
      </Menubar>

      <button
        title={sidebarVisible ? "Ocultar panel lateral" : "Mostrar panel lateral"}
        onClick={onToggleSidebar}
        className={cn(
          "ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground",
          sidebarVisible && "text-foreground",
        )}
      >
        <PanelLeft size={16} />
      </button>

      <div
        className="h-full flex-1"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (e.detail === 2) {
            void win.toggleMaximize();
            return;
          }
          e.preventDefault();
          void win.startDragging();
        }}
      />

      <button
        title="Configuración general"
        onClick={onOpenSettings}
        className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground"
      >
        <Settings size={16} />
      </button>

      <div className="flex h-full items-stretch">
        <button
          onClick={() => win.minimize()}
          className="flex w-10 items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          className="flex w-10 items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground"
        >
          <Square size={16} />
        </button>
        <button
          onClick={() => win.close()}
          className="flex w-10 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
