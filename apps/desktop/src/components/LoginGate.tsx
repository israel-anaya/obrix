import { LogIn } from "lucide-react";

export function LoginGate({
  onIniciarSesion,
  error,
}: {
  onIniciarSesion: () => void;
  error?: string | null;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold text-foreground">Obrix</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Inicia sesión para crear o abrir un portafolio.
        </p>
        <button
          type="button"
          onClick={onIniciarSesion}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
        >
          <LogIn size={16} className="shrink-0 text-muted-foreground" />
          Iniciar sesión
        </button>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
