import { useEffect, useRef, useState } from "react";
import { Minus, PanelLeft, Settings, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";

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
  const [openId, setOpenId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div
      ref={ref}
      className="flex h-8 shrink-0 items-center border-b border-border bg-muted/60 text-sm"
    >
      <div className="flex items-center gap-0.5 px-1">
        {menus.map((menu) => (
          <div key={menu.id} className="relative">
            <button
              onClick={() => setOpenId((id) => (id === menu.id ? null : menu.id))}
              onMouseEnter={() => setOpenId((id) => (id ? menu.id : id))}
              className={cn(
                "rounded px-2 py-0.5 text-muted-foreground hover:bg-background/80 hover:text-foreground",
                openId === menu.id && "bg-background text-foreground",
              )}
            >
              {menu.label}
            </button>
            {openId === menu.id && (
              <div className="absolute left-0 top-full z-50 min-w-[200px] rounded-md border border-border bg-background py-1 shadow-lg">
                {menu.actions.map((action, i) =>
                  action === "separator" ? (
                    <div key={i} className="my-1 h-px bg-border" />
                  ) : (
                    <button
                      key={action.label}
                      disabled={action.disabled}
                      onClick={() => {
                        action.onClick?.();
                        setOpenId(null);
                      }}
                      className="flex w-full items-center justify-between gap-4 px-3 py-1 text-left text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:bg-transparent"
                    >
                      <span>{action.label}</span>
                      {action.shortcut && (
                        <span className="num text-xs text-muted-foreground">{action.shortcut}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        title={sidebarVisible ? "Ocultar panel lateral" : "Mostrar panel lateral"}
        onClick={onToggleSidebar}
        className={cn(
          "ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground",
          sidebarVisible && "text-foreground",
        )}
      >
        <PanelLeft size={15} />
      </button>

      <div data-tauri-drag-region className="h-full flex-1" />

      <button
        title="Configuración general"
        onClick={onOpenSettings}
        className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground"
      >
        <Settings size={14} />
      </button>

      <div className="flex h-full items-stretch">
        <button
          onClick={() => win.minimize()}
          className="flex w-10 items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          className="flex w-10 items-center justify-center text-muted-foreground hover:bg-background/80 hover:text-foreground"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => win.close()}
          className="flex w-10 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
