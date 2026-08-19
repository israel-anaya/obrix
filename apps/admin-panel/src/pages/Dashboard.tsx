import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SuscripcionesTab } from "@/pages/SuscripcionesTab";
import { UsuariosTab } from "@/pages/UsuariosTab";

type TabId = "suscripciones" | "usuarios";

export function Dashboard({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tab, setTab] = useState<TabId>("suscripciones");

  async function salir() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <span className="font-semibold">Obrix — Admin</span>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{username}</span>
          <Button variant="outline" size="sm" onClick={salir}>
            Salir
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex gap-1 border-b border-border">
          {(
            [
              ["suscripciones", "Suscripciones"],
              ["usuarios", "Usuarios"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium",
                tab === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "suscripciones" ? <SuscripcionesTab /> : <UsuariosTab />}
      </div>
    </div>
  );
}
