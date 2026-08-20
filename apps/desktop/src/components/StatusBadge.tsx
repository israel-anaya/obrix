import { cn } from "@/lib/utils";

/**
 * Status of a validity period: there is always a badge, it is never inferred
 * from a missing date. Green = still open; gray = already closed when the
 * next one was registered.
 */
export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        active ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/55")}
        aria-hidden
      />
      {active ? "vigente" : "cerrado"}
    </span>
  );
}
