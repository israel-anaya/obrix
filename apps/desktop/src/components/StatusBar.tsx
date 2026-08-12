export function StatusBar({
  proyecto,
  conteo,
  progreso,
}: {
  proyecto: string;
  conteo: string;
  /** Mensaje de una operación en curso (ej. "Creando portafolio…") — reemplaza el contenido normal con una barra indeterminada. */
  progreso?: string | null;
}) {
  if (progreso) {
    return (
      <div className="flex h-6 shrink-0 items-center gap-2 border-t border-border bg-muted/60 px-3 text-xs text-muted-foreground">
        <div className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-border">
          <div className="h-full w-1/2 rounded-full bg-primary barra-progreso-indeterminada" />
        </div>
        <span>{progreso}</span>
      </div>
    );
  }

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-muted/60 px-3 text-xs text-muted-foreground">
      <span>{proyecto}</span>
      <span>{conteo}</span>
    </div>
  );
}
