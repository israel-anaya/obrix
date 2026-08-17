import { ArrowDown, ArrowUp, History } from "lucide-react";

/**
 * El panel lateral no duplica el histórico: este encabezado abre o cierra
 * la tabla inferior (flecha abajo = abrir, flecha arriba = cerrar).
 */
export function EnlaceHistorialCompleto({
  onClick,
  abierto = false,
}: {
  onClick: () => void;
  abierto?: boolean;
}) {
  const Flecha = abierto ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      title={abierto ? "Ocultar histórico completo" : "Ver histórico completo"}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      <History size={16} strokeWidth={2.5} className="shrink-0" aria-hidden />
      Resumen del histórico
      <Flecha size={16} strokeWidth={2.5} className="shrink-0" aria-hidden />
    </button>
  );
}
