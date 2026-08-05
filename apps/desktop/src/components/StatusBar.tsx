export function StatusBar({
  proyecto,
  conteo,
}: {
  proyecto: string;
  conteo: string;
}) {
  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-muted/60 px-3 text-xs text-muted-foreground">
      <span>{proyecto}</span>
      <span>{conteo}</span>
    </div>
  );
}
