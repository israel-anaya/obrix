import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Activity<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

export function ActivityBar<T extends string>({
  activities,
  active,
  onSelect,
}: {
  activities: Activity<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/60 py-2">
      {activities.map((a) => {
        const Icon = a.icon;
        const isActive = a.id === active;
        return (
          <button
            key={a.id}
            title={a.label}
            onClick={() => onSelect(a.id)}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground",
              isActive && "text-foreground",
            )}
          >
            {isActive && (
              <span className="absolute left-0 top-1 h-7 w-0.5 rounded-full bg-accent" />
            )}
            <Icon size={18} strokeWidth={2} />
          </button>
        );
      })}
    </nav>
  );
}
