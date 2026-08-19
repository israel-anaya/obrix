import type { ComponentType } from "react";
import { Info, Palette, Server, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

function SeccionBoton({
  id,
  label,
  icon: Icon,
  activa,
  onSelect,
  badge,
}: {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  activa: string;
  onSelect: (id: string) => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-background/80 hover:text-foreground",
        activa === id && "bg-background text-foreground",
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

export function ConfiguracionSidebar({
  activa,
  onSelect,
}: {
  activa: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-0.5 overflow-auto px-1 py-1">
      <SeccionBoton id="general" label="General" icon={Settings} activa={activa} onSelect={onSelect} />
      <SeccionBoton id="apariencia" label="Apariencia" icon={Palette} activa={activa} onSelect={onSelect} />
      <SeccionBoton id="acerca-de" label="Acerca de" icon={Info} activa={activa} onSelect={onSelect} />

      <div className="mt-3 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Colaboración
      </div>
      <SeccionBoton id="servidor" label="Servidor" icon={Server} activa={activa} onSelect={onSelect} badge="próx." />
    </div>
  );
}
