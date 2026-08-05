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
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border px-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground",
              isActive && "bg-background text-foreground",
            )}
          >
            <Icon size={15} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
