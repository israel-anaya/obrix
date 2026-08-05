import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolbarItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

export function Toolbar<T extends string>({
  items,
  active,
  onSelect,
}: {
  items: ToolbarItem<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-muted/40 px-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-background/80 hover:text-foreground",
              isActive && "bg-background text-foreground shadow-sm",
            )}
          >
            <Icon size={14} strokeWidth={2} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
