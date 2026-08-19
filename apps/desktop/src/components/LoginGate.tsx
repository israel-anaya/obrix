import { useState } from "react";
import { LogIn } from "lucide-react";

export function LoginGate({
  onIniciarSesion,
  onRegistrarCuenta,
  error,
}: {
  onIniciarSesion: (correo: string, password: string) => Promise<void>;
  onRegistrarCuenta: (correo: string, password: string) => Promise<void>;
  error?: string | null;
}) {
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  // Validación propia en vez de `required`/`minLength` nativos: el globo de
  // validación del navegador se renderiza en blanco dentro del WebView de
  // Tauri, así que el error queda invisible para el usuario.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);

    if (!correo.includes("@")) {
      setErrorLocal("Ingresa un correo válido");
      return;
    }
    if (password.length < 6) {
      setErrorLocal("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setEnviando(true);
    try {
      if (modo === "login") {
        await onIniciarSesion(correo, password);
      } else {
        await onRegistrarCuenta(correo, password);
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form onSubmit={submit} noValidate className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold text-foreground">Obrix</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {modo === "login" ? "Inicia sesión para continuar." : "Crea una cuenta para continuar."}
        </p>

        <div className="mb-3 flex flex-col gap-2 text-left">
          <input
            type="email"
            autoFocus
            placeholder="Correo"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <LogIn size={16} className="shrink-0 text-muted-foreground" />
          {enviando
            ? "Un momento..."
            : modo === "login"
              ? "Iniciar sesión"
              : "Crear cuenta"}
        </button>

        <button
          type="button"
          onClick={() => {
            setModo(modo === "login" ? "registro" : "login");
            setErrorLocal(null);
          }}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground"
        >
          {modo === "login" ? "¿No tienes cuenta? Créala" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>

        {(errorLocal ?? error) && (
          <p className="mt-3 text-xs text-destructive">{errorLocal ?? error}</p>
        )}
      </form>
    </div>
  );
}
