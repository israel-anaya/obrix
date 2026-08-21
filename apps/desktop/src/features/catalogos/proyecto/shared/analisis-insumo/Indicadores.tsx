import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatearFecha, diasTranscurridos } from "@/lib/fecha";
import { fmtDelta } from "./formato";

export function ChipDelta({ valor, className }: { valor: number; className?: string }) {
  if (valor === 0) return null;
  return (
    <span
      className={cn(
        "inline-block animate-in fade-in-0 zoom-in-95 font-semibold tabular-nums",
        valor > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
        className,
      )}
    >
      {fmtDelta(valor)}
    </span>
  );
}

/** Hasta 30 días: vigente. Más de 30: ámbar. Más de 90, o el precio/salario ya no coincide: crítico. */
const DIAS_PRECIO_FRESCO = 30;
const DIAS_PRECIO_CRITICO = 90;

export function FechaPrecioFrescura({
  fecha,
  fechaSalarioVigente,
}: {
  fecha: string;
  fechaSalarioVigente?: string | null;
}) {
  const salarioCambio = !!fechaSalarioVigente && fecha.slice(0, 10) !== fechaSalarioVigente.slice(0, 10);
  const dias = diasTranscurridos(fecha);
  const nivel = salarioCambio || (dias != null && dias > DIAS_PRECIO_CRITICO)
    ? "critica"
    : dias != null && dias > DIAS_PRECIO_FRESCO
      ? "desactualizada"
      : "vigente";
  const titulo = salarioCambio
    ? `El salario vigente cambió (${formatearFecha(fechaSalarioVigente)}). Sincroniza para actualizar este costo.`
    : nivel === "critica"
      ? `Precio con más de ${DIAS_PRECIO_CRITICO} días de vigencia`
      : nivel === "desactualizada"
        ? `Precio con más de ${DIAS_PRECIO_FRESCO} días de vigencia`
        : formatearFecha(fecha);

  return (
    <div
      title={titulo}
      className={cn(
        "inline-flex items-center justify-end gap-0.5 leading-tight",
        nivel === "vigente" && "text-[10px] font-normal text-muted-foreground/70",
        nivel === "desactualizada" && "text-[11px] font-medium text-amber-700 dark:text-amber-400",
        nivel === "critica" && "text-[11px] font-semibold text-rose-600 dark:text-rose-400",
      )}
    >
      {nivel === "critica" ? <AlertTriangle size={16} className="shrink-0" /> : null}
      {formatearFecha(fecha)}
    </div>
  );
}

/** Fila separadora que marca el punto de inserción al arrastrar un renglón. */
export function MarcadorInsercion({ colSpan }: { colSpan: number }) {
  return (
    <tr aria-hidden className="pointer-events-none">
      <td colSpan={colSpan} className="relative h-0 p-0">
        <div className="absolute inset-x-0 top-0 z-10 flex -translate-y-1/2 items-center gap-2 px-1">
          <span className="size-2 shrink-0 rounded-full bg-primary ring-2 ring-background" />
          <span className="h-0.5 flex-1 bg-primary" />
          <span className="rounded-sm bg-primary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
            Soltar aquí
          </span>
          <span className="h-0.5 flex-1 bg-primary" />
        </div>
      </td>
    </tr>
  );
}
