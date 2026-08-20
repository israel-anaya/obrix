import type { LucideIcon } from "lucide-react";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface BarAction {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** Highlights the action as destructive inside the dropdown (e.g. delete). */
  destructive?: boolean;
}

/**
 * Row of icon buttons for a catalog view's header (add, edit, and any extra
 * action that view needs). `menu` groups secondary actions (reload,
 * delete...) into a separate dropdown, to avoid crowding the loose-button bar.
 */
export function ActionBar({ actions, menu }: { actions: BarAction[]; menu?: BarAction[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {actions.map((action, i) => (
        <button
          key={i}
          type="button"
          title={action.title}
          onClick={action.onClick}
          disabled={action.disabled}
          className={cn(
            "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
            action.disabled && "opacity-30",
          )}
        >
          <action.icon size={16} />
        </button>
      ))}

      {menu && menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Más acciones"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreVertical size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((action, i) => (
              <DropdownMenuItem
                key={i}
                disabled={action.disabled}
                variant={action.destructive ? "destructive" : "default"}
                onSelect={action.onClick}
              >
                <action.icon size={16} />
                {action.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
