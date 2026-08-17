import { cn } from "@/lib/utils";

/**
 * Estado de una vigencia: siempre hay badge, no se infiere por la ausencia
 * de fecha. Verde = sigue abierto; gris = ya se cerró al registrar el siguiente.
 */
export function BadgeEstadoVigencia({ vigente }: { vigente: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        vigente ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", vigente ? "bg-emerald-500" : "bg-muted-foreground/55")}
        aria-hidden
      />
      {vigente ? "vigente" : "cerrado"}
    </span>
  );
}
