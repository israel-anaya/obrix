import { type ReactNode } from "react";
import { Minus, PanelLeft, Settings, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import appIcon from "@/assets/app-icon.png";
import { cn } from "@/lib/utils";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
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

function renderActions(actions: MenuDef["actions"]) {
  return actions.map((action, i) =>
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
  );
}

export function MenuBar({
  menus,
  onOpenSettings,
  sidebarVisible,
  onToggleSidebar,
  children,
}: {
  menus: MenuDef[];
  onOpenSettings: () => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border bg-muted/60 px-1.5 text-sm">
      <Menubar className="h-auto rounded-none border-none bg-transparent p-0">
        <MenubarMenu>
          <MenubarTrigger
            title="Menú de la aplicación"
            className="flex size-7 items-center justify-center rounded p-0 text-muted-foreground hover:bg-background/80 data-[state=open]:bg-background data-[state=open]:text-foreground"
          >
            <img src={appIcon} alt="Obrix" className="size-[18px] rounded-[3px]" />
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={4}>
            {menus.map((menu) => (
              <MenubarSub key={menu.id}>
                <MenubarSubTrigger>{menu.label}</MenubarSubTrigger>
                <MenubarSubContent>{renderActions(menu.actions)}</MenubarSubContent>
              </MenubarSub>
            ))}
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {children}

      <div className="mx-1.5 h-4 w-px shrink-0 bg-border" />

      <button
        title={sidebarVisible ? "Ocultar panel lateral" : "Mostrar panel lateral"}
        onClick={onToggleSidebar}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground",
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
