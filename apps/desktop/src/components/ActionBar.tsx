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

/** Marks a gap between action groups in the bar (e.g. add/ficha vs. import/export). */
export const ACTION_BAR_SEPARATOR = "separator" as const;

export type ActionBarItem = BarAction | typeof ACTION_BAR_SEPARATOR;

/**
 * Row of icon buttons for a catalog view's header (add, edit, and any extra
 * action that view needs). Lives at the left edge of the header, next to the
 * search box — `ActionBarMenu` is the separate "more actions" dropdown that
 * stays pinned to the right edge instead.
 */
export function ActionBar({ actions }: { actions: ActionBarItem[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {actions.map((action, i) =>
        action === ACTION_BAR_SEPARATOR ? (
          <div key={i} className="mx-1 h-4 w-px bg-border" />
        ) : (
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
        ),
      )}
    </div>
  );
}

/** Overflow dropdown for secondary actions (reload, delete...), pinned to the right of the header. */
export function ActionBarMenu({ menu }: { menu?: BarAction[] }) {
  if (!menu || menu.length === 0) return null;
  return (
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
  );
}
