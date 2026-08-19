import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iniciarSesion, registrarCuenta } from "@/lib/auth";
import type { AccountInfo } from "@/lib/types";

export function AuthModal({
  modoInicial,
  onClose,
  onAutenticado,
}: {
  modoInicial: "login" | "registro";
  onClose: () => void;
  onAutenticado: (cuenta: AccountInfo) => void;
}) {
  const [modo, setModo] = useState<"login" | "registro">(modoInicial);
  const [correo, setCorreo] = useState("");
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!correo.includes("@")) {
      setError("Ingresa un correo válido");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (modo === "registro") {
      if (!nombreUsuario.trim()) {
        setError("Ingresa un nombre de usuario");
        return;
      }
      if (password !== confirmarPassword) {
        setError("Las contraseñas no coinciden");
        return;
      }
    }

    setEnviando(true);
    try {
      const cuenta =
        modo === "login"
          ? await iniciarSesion(correo, password)
          : await registrarCuenta(correo, nombreUsuario.trim(), password);
      onAutenticado(cuenta);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {modo === "login" ? "Inicia sesión" : "Crea tu cuenta"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <input
            type="email"
            autoFocus
            placeholder="Correo"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {modo === "registro" && (
            <input
              type="text"
              placeholder="Nombre de usuario"
              value={nombreUsuario}
              onChange={(e) => setNombreUsuario(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {modo === "registro" && (
            <input
              type="password"
              placeholder="Confirmar contraseña"
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}

          <Button type="submit" disabled={enviando} className="mt-2">
            {enviando ? "Un momento…" : modo === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setModo(modo === "login" ? "registro" : "login");
              setError(null);
              setNombreUsuario("");
              setConfirmarPassword("");
            }}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {modo === "login" ? "¿No tienes cuenta? Créala" : "¿Ya tienes cuenta? Inicia sesión"}
          </button>

          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </form>
      </div>
    </div>
  );
}
