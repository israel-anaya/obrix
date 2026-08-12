import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Clase estándar para el control (input/select/textarea nativo) de un `Campo` — compacta, para
 * revisar muchos valores de un vistazo. Úsala junto con `Campo` en cualquier ficha de la app.
 */
export const CAMPO_INPUT_CLASE = "mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-xs";

/** Etiqueta chica sobre un control nativo — el estilo estándar de campo de formulario en la app. */
export function Campo({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block text-[11px] text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}
