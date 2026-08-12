import type { ComponentType } from "react";
import { FolderOpen, FolderPlus, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Proyecto } from "@/features/proyectos/types";

interface AccionInicio {
  label: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  onClick?: () => void;
  disabled?: boolean;
}

export function StartScreen({
  proyectos,
  onCrearPortafolio,
  onAbrirPortafolio,
  onAbrirProyecto,
  error,
}: {
  proyectos: Proyecto[];
  onCrearPortafolio: () => void;
  onAbrirPortafolio: () => void;
  onAbrirProyecto: (id: string) => void;
  error?: string | null;
}) {
  const acciones: AccionInicio[] = [
    { label: "Crear portafolio", icon: FolderPlus, onClick: onCrearPortafolio },
    { label: "Abrir portafolio", icon: FolderOpen, onClick: onAbrirPortafolio },
    { label: "Conectarse a servidor", icon: Server, disabled: true },
  ];

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <h1 className="mb-6 text-xl font-semibold text-foreground">Obrix</h1>

        <div className="grid grid-cols-2 gap-3">
          {acciones.map((accion) => (
            <button
              key={accion.label}
              type="button"
              onClick={accion.onClick}
              disabled={accion.disabled}
              title={accion.disabled ? "Próximamente" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-muted/40",
                accion.label === "Conectarse a servidor" && "col-span-2",
              )}
            >
              <accion.icon size={16} className="shrink-0 text-muted-foreground" />
              {accion.label}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-8">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Recientes</span>
          </div>
          {proyectos.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Sin portafolios recientes.</p>
          ) : (
            <div className="flex flex-col">
              {proyectos.map((proyecto) => (
                <button
                  key={proyecto.id}
                  type="button"
                  onClick={() => onAbrirProyecto(proyecto.id)}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <span className="truncate">{proyecto.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
