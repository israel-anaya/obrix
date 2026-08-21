import { ChevronsDown, ChevronsUp, Plus, RefreshCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_ICONS } from "@/lib/appIcons";
import { formatearFecha } from "@/lib/fecha";
import { cn } from "@/lib/utils";

export interface SegmentoPorcentaje {
  pct: number;
  Icono: LucideIcon;
  color: string;
  bg: string;
  etiqueta: string;
}

export interface GrupoAgregable<Tipo extends string> {
  tipo: Tipo;
  titulo: string;
  Icono: LucideIcon;
  color: string;
  opciones: { id: string; label: string }[];
}

/**
 * Encabezado superior de la tarjeta de análisis, compartido por básico
 * auxiliar, cuadrilla y equipo de costo horario: rótulo del tipo de
 * análisis, columna de identidad (clave/unidad/descripción), columna de
 * costo (región vista + barra de % por grupo) y la fila de acciones —
 * Agregar (con selector de grupo), expandir/colapsar todos los grupos, y
 * Sincronizar regiones.
 */
export function EncabezadoAnalisis<Tipo extends string>({
  tituloAnalisis,
  IconoTitulo,
  colorTitulo,
  clave,
  descripcion,
  simboloUnidad,
  regionVistaId,
  nombreRegionVista,
  segmentos,
  gruposDef,
  onAbrirAgregar,
  onExpandirTodos,
  onColapsarTodos,
  recalculando,
  sincronizadoEn,
  onRecalcular,
  notaRecalcular,
}: {
  tituloAnalisis: string;
  IconoTitulo: LucideIcon;
  colorTitulo: string;
  clave: string;
  descripcion: string;
  simboloUnidad: string;
  regionVistaId: string | null;
  nombreRegionVista: string;
  segmentos: SegmentoPorcentaje[];
  gruposDef: GrupoAgregable<Tipo>[];
  onAbrirAgregar: (tipo: Tipo) => void;
  onExpandirTodos: () => void;
  onColapsarTodos: () => void;
  recalculando: boolean;
  sincronizadoEn: string | null;
  onRecalcular: () => void;
  notaRecalcular: string;
}) {
  return (
    <div className="border-b-2 border-foreground/20 px-4 py-3">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <IconoTitulo size={16} className={colorTitulo} />
        {tituloAnalisis}
      </span>

      <div className="mt-1 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-base font-bold tracking-tight">{clave}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              Unidad: <span className="font-medium text-foreground">{simboloUnidad}</span>
            </span>
          </div>
          <p className="mt-0.5 text-xs text-foreground">{descripcion}</p>
        </div>

        <div aria-hidden className="mt-0.5 self-stretch w-px shrink-0 bg-border" />

        <div className="w-fit shrink-0 text-xs text-muted-foreground">
          <span className="inline-flex h-6 items-center gap-1 font-medium text-foreground">
            <span className="font-normal text-muted-foreground">Costo:</span>
            {regionVistaId ? (
              <APP_ICONS.region_otra.icono size={16} className={APP_ICONS.region_otra.color} />
            ) : (
              <APP_ICONS.region_nacional.icono size={16} className={APP_ICONS.region_nacional.color} />
            )}
            {nombreRegionVista}
          </span>

          <div className="mt-2 flex flex-col gap-1">
            <div
              className="flex h-1.5 w-full min-w-0 overflow-hidden rounded-full bg-muted"
              title={segmentos.map((s) => `${s.etiqueta} ${s.pct.toFixed(0)}%`).join(" / ")}
            >
              {segmentos.map((s) => (
                <div key={s.etiqueta} className={s.bg} style={{ width: `${s.pct}%` }} />
              ))}
            </div>
            <span className="flex flex-wrap items-center gap-2 text-[10px]">
              {segmentos.map((s) => (
                <span key={s.etiqueta} className="flex items-center gap-1">
                  <s.Icono size={16} className={s.color} />
                  {s.pct.toFixed(0)}%
                </span>
              ))}
            </span>
            <div aria-hidden className="mt-1 h-px bg-border" />

            <div className="mt-2 flex items-center justify-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Agregar un insumo al análisis"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                  >
                    <Plus size={16} /> Agregar
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="text-xs" onCloseAutoFocus={(e) => e.preventDefault()}>
                  {gruposDef.map((g) => (
                    <DropdownMenuItem
                      key={g.tipo}
                      disabled={g.opciones.length === 0}
                      onSelect={() => onAbrirAgregar(g.tipo)}
                      className="text-xs"
                    >
                      <g.Icono size={16} className={g.color} />
                      {g.titulo}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div aria-hidden className="h-5 w-px shrink-0 bg-border" />

              <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                <button
                  type="button"
                  title="Expandir todos los grupos"
                  onClick={onExpandirTodos}
                  className="rounded p-1 hover:bg-muted hover:text-foreground"
                >
                  <ChevronsDown size={16} />
                </button>
                <button
                  type="button"
                  title="Colapsar todos los grupos"
                  onClick={onColapsarTodos}
                  className="rounded p-1 hover:bg-muted hover:text-foreground"
                >
                  <ChevronsUp size={16} />
                </button>
              </span>

              <div aria-hidden className="h-5 w-px shrink-0 bg-border" />

              <button
                type="button"
                title={
                  recalculando
                    ? "Recalculando costos de todas las regiones…"
                    : [
                        notaRecalcular,
                        sincronizadoEn ? `Última sincronización: ${formatearFecha(sincronizadoEn)}` : "Aún no se ha sincronizado con los catálogos vigentes.",
                      ].join("\n")
                }
                onClick={onRecalcular}
                disabled={recalculando}
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted",
                  recalculando && "opacity-50",
                  !sincronizadoEn && "border-amber-500/40",
                )}
              >
                <RefreshCcw size={16} className={cn(recalculando && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
