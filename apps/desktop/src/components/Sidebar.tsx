import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

export function Sidebar<T extends string>({
  items,
  active,
  onChange,
}: {
  items: NavItem<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40">
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="h-4 w-4 rounded bg-accent" />
        <span className="text-sm font-semibold">Obrix</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground",
                isActive && "bg-background text-foreground shadow-sm",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
