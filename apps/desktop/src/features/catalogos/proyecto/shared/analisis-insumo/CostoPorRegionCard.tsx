import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { APP_ICONS } from "@/lib/appIcons";
import { cn } from "@/lib/utils";
import { fmt } from "./formato";
import type { Zona } from "./useRegionCosts";

interface FilaCostoPorRegion<Costo> {
  etiqueta: string;
  extraer: (costo: Costo | null) => string | undefined;
}

/**
 * Bloque "Costo por región": tabla sticky con una columna por zona (Nacional
 * + regiones visibles), un renglón por subtotal y el renglón de Costo Total
 * destacado. Clic en una columna cambia la región que ve el análisis de
 * arriba. Compartido por básico auxiliar, cuadrilla y equipo de costo
 * horario — solo cambian sus `rows` (subtotales) y el total de renglones de
 * receta usado para la cobertura de precios.
 */
export function CostoPorRegionCard<Costo extends { id: string; costo_total: string }>({
  colapsable = false,
  descripcion,
  rows,
  zonas,
  regionVistaId,
  onVerRegion,
  coberturaPorCostoId,
  totalFilas,
}: {
  colapsable?: boolean;
  descripcion?: string;
  rows: FilaCostoPorRegion<Costo>[];
  zonas: Zona<Costo>[];
  regionVistaId: string | null;
  onVerRegion: (regionId: string | null) => void;
  coberturaPorCostoId: Record<string, { total: number; sin: number }>;
  totalFilas: number;
}) {
  const [expandido, setExpandido] = useState(!colapsable);
  const anchoConcepto = descripcion ? "w-[5.5rem] min-w-[5.5rem]" : "w-[7.5rem] min-w-[7.5rem]";

  return (
    <div className="mt-3 rounded-lg border-2 border-foreground/20 bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        {colapsable ? (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            {expandido ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
            Costo por región
          </button>
        ) : (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Costo por región</p>
            {descripcion ? <p className="mt-0.5 text-[11px] text-muted-foreground">{descripcion}</p> : null}
          </div>
        )}
      </div>
      <div className="overflow-x-auto px-4 py-3">
        <table className="w-max min-w-full table-fixed border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className={cn(
                  "sticky left-0 top-0 z-30 border-b border-r border-border bg-background px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                  anchoConcepto,
                )}
              >
                Concepto
              </th>
              {zonas.map((z) => {
                const activa = (z.regionId ?? null) === regionVistaId;
                return (
                  <th
                    key={`${z.key}-grupo`}
                    className={cn(
                      "h-7 w-14 max-w-14 cursor-pointer border-b border-r border-border text-center hover:bg-muted/60",
                      activa ? "bg-primary/10" : "bg-background",
                    )}
                    title={`Ver análisis en ${z.nombre}`}
                    aria-pressed={activa}
                    onClick={() => onVerRegion(z.regionId)}
                  >
                    {z.esNac ? (
                      <APP_ICONS.region_nacional.icono size={16} className={cn("mx-auto", APP_ICONS.region_nacional.color)} aria-label="Nacional" />
                    ) : (
                      <APP_ICONS.region_otra.icono size={16} className={cn("mx-auto", APP_ICONS.region_otra.color)} />
                    )}
                  </th>
                );
              })}
            </tr>
            <tr>
              {zonas.map((z) => {
                const activa = (z.regionId ?? null) === regionVistaId;
                return (
                  <th
                    key={`${z.key}-nombre`}
                    className={cn(
                      "w-14 max-w-14 cursor-pointer border-b border-r border-border px-1 py-1 text-center text-[11px] font-semibold leading-tight hover:bg-muted/60",
                      activa ? "bg-primary/10 text-foreground" : "bg-background text-muted-foreground",
                    )}
                    title={`Ver análisis en ${z.nombre}`}
                    onClick={() => onVerRegion(z.regionId)}
                  >
                    <span className="line-clamp-2 break-words">{z.nombre}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {expandido &&
              rows.map((fila) => (
                <tr key={fila.etiqueta}>
                  <th
                    className={cn(
                      "sticky left-0 z-10 border-b border-r border-border bg-background px-2 py-1.5 text-left font-normal text-muted-foreground",
                      anchoConcepto,
                    )}
                  >
                    {fila.etiqueta}
                  </th>
                  {zonas.map((z) => {
                    const cob = z.costo ? coberturaPorCostoId[z.costo.id] : undefined;
                    const incompleta = !z.costo || (cob?.sin ?? 0) > 0;
                    const monto = incompleta ? "—" : `$${fmt(fila.extraer(z.costo) ?? "0")}`;
                    const activa = (z.regionId ?? null) === regionVistaId;
                    return (
                      <td
                        key={z.key}
                        className={cn(
                          "w-14 max-w-14 cursor-pointer overflow-hidden border-b border-r border-border px-1 py-1.5 text-right hover:bg-muted/60",
                          activa && "bg-primary/10",
                        )}
                        onClick={() => onVerRegion(z.regionId)}
                      >
                        <span className="num block truncate" title={incompleta ? undefined : monto}>
                          {monto}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            <tr>
              <th
                className={cn(
                  "sticky left-0 z-10 border-b border-r border-border bg-background px-2 py-1.5 text-left font-semibold",
                  anchoConcepto,
                )}
              >
                Costo Total
              </th>
              {zonas.map((z) => {
                const cob = z.costo ? coberturaPorCostoId[z.costo.id] : undefined;
                const sin = cob?.sin ?? (totalFilas > 0 && !z.costo ? totalFilas : 0);
                const total = cob?.total ?? totalFilas;
                const monto = z.costo ? `$${fmt(z.costo.costo_total)}` : undefined;
                const activa = (z.regionId ?? null) === regionVistaId;
                return (
                  <td
                    key={z.key}
                    className={cn(
                      "w-14 max-w-14 cursor-pointer overflow-hidden border-b border-r border-border px-1 py-1.5 text-right hover:bg-muted/60",
                      activa && "bg-primary/10",
                    )}
                    onClick={() => onVerRegion(z.regionId)}
                  >
                    {!z.costo || sin > 0 ? (
                      total > 0 ? (
                        <span title="sin precio" className="inline-flex items-center justify-end text-amber-800 dark:text-amber-300">
                          <AlertTriangle size={12} className="shrink-0" />
                        </span>
                      ) : (
                        "—"
                      )
                    ) : (
                      <span className="num block truncate font-semibold text-primary" title={monto}>
                        {monto}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
