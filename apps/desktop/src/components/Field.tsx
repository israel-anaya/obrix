import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard class for the control (native input/select/textarea) of a `Field` — compact, to
 * review many values at a glance. Use it together with `Field` in any record panel in the app.
 */
export const FIELD_INPUT_CLASS = "mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-xs";

/** Small label above a native control — the standard form-field style in the app. */
export function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block text-[11px] text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}
