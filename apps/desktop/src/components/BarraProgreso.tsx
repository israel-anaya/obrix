export function BarraProgreso({
  actual,
  total,
  mensaje,
}: {
  actual: number;
  total: number | null;
  mensaje: string;
}) {
  const determinado = total !== null && total > 0;
  const pct = determinado ? Math.min(100, Math.round((actual / total) * 100)) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        {determinado ? (
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        ) : (
          <div className="barra-progreso-indeterminada h-full w-1/2 rounded-full bg-primary" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {determinado ? `${mensaje} ${actual} / ${total}` : mensaje}
      </p>
    </div>
  );
}
