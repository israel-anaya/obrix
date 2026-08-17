import type { ComponentType } from "react";
import { FilePlus2, Package, Users } from "lucide-react";

interface AtajoEditor {
  label: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  onClick: () => void;
}

export function EditorEmptyState({
  nombre,
  path,
  error,
  onNuevoProyecto,
  onAbrirMateriales,
  onAbrirCuadrillas,
}: {
  nombre: string;
  path: string;
  error?: string | null;
  onNuevoProyecto: () => void;
  onAbrirMateriales: () => void;
  onAbrirCuadrillas: () => void;
}) {
  const atajos: AtajoEditor[] = [
    { label: "Nuevo proyecto", icon: FilePlus2, onClick: onNuevoProyecto },
    { label: "Materiales", icon: Package, onClick: onAbrirMateriales },
    { label: "Cuadrillas", icon: Users, onClick: onAbrirCuadrillas },
  ];

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="truncate text-lg font-semibold text-foreground" title={path}>
          {nombre}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Abre un proyecto o un catálogo desde la barra lateral
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {atajos.map((atajo) => (
            <button
              key={atajo.label}
              type="button"
              onClick={atajo.onClick}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <atajo.icon size={16} className="shrink-0" />
              {atajo.label}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
