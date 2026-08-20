import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, History, MapPinned } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listPreciosMaterial, listRegiones } from "@/lib/tauri";
import type { PrecioMaterial, Region } from "@/lib/types";
import { formatearFecha } from "@/lib/fecha";
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional";

/**
 * Tabla de solo lectura con el historial completo de vigencias de precio del
 * material seleccionado — pensado como panel inferior junto al grid de
 * materiales, mismo patrón que `SalarioHistorialGrid`.
 */
export function PrecioHistorialGrid({
  materialId,
  nombresPorUsuarioId = {},
  revision = 0,
  focoTicket = 0,
}: {
  materialId: string | null;
  nombresPorUsuarioId?: Record<string, string>;
  /** Sube cuando el padre recarga, para refrescar tras registrar un precio. */
  revision?: number;
  /** Sube al pedir foco desde el resumen del panel lateral. */
  focoTicket?: number;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const rootRef = useRef<HTMLDivElement>(null);
  const [resaltado, setResaltado] = useState(false);
  const [precios, setPrecios] = useState<PrecioMaterial[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!focoTicket) return;
    const mostrar = window.setTimeout(() => {
      const el = rootRef.current;
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setResaltado(true);
    }, 50);
    const ocultar = window.setTimeout(() => setResaltado(false), 1450);
    return () => {
      clearTimeout(mostrar);
      clearTimeout(ocultar);
    };
  }, [focoTicket]);

  useEffect(() => {
    listRegiones().then(setRegiones).catch(() => {});
  }, [organizacionActivaId]);

  useEffect(() => {
    if (!materialId) {
      setPrecios([]);
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    listPreciosMaterial(materialId)
      .then((r) => {
        if (!cancelado) setPrecios(r);
      })
      .catch((e) => {
        if (!cancelado) setError(String(e));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [materialId, revision]);

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);

  const historial = useMemo(
    () =>
      [...precios].sort((a, b) => {
        const porDesde = b.fecha_vigencia_desde.localeCompare(a.fecha_vigencia_desde);
        if (porDesde !== 0) return porDesde;
        if ((a.fecha_vigencia_hasta === null) !== (b.fecha_vigencia_hasta === null)) {
          return a.fecha_vigencia_hasta === null ? -1 : 1;
        }
        return b.created_at.localeCompare(a.created_at);
      }),
    [precios],
  );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn(
        "flex h-full flex-col overflow-auto p-3 outline-none transition-shadow duration-700",
        resaltado && "ring-2 ring-inset ring-primary/40",
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <History size={16} className="shrink-0 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Histórico completo de precios
        </h3>
      </div>
      {!materialId ? (
        <p className="text-xs text-muted-foreground">Selecciona un material para ver su historial de precios.</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : cargando ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : precios.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin historial.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Región</th>
              <th className="py-1 pr-2 text-right font-medium">Precio</th>
              <th className="py-1 pr-2 font-medium">Moneda</th>
              <th className="py-1 pr-2 font-medium">Usuario</th>
              <th className="py-1 pr-2 text-right font-medium">Desde</th>
              <th className="py-1 pr-2 text-right font-medium">Hasta</th>
              <th className="py-1 text-right font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((p) => {
              const vigente = p.fecha_vigencia_hasta === null;
              return (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-border/50 last:border-none",
                    vigente && "bg-emerald-500/5",
                  )}
                >
                  <td className="py-1 pr-2">
                    <span className="inline-flex items-center gap-1.5">
                      {p.region_id ? (
                        <MapPinned size={16} className="shrink-0 text-teal-600 dark:text-teal-400" />
                      ) : (
                        <Globe size={16} className="shrink-0 text-primary" />
                      )}
                      {p.region_id ? (nombrePorRegionId[p.region_id] ?? p.region_id) : NACIONAL}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">${p.precio}</td>
                  <td className="py-1 pr-2">{p.moneda}</td>
                  <td className="py-1 pr-2">{nombresPorUsuarioId[p.created_by] ?? p.created_by}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatearFecha(p.fecha_vigencia_desde)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
                    {vigente ? "—" : formatearFecha(p.fecha_vigencia_hasta)}
                  </td>
                  <td className="py-1 text-right">
                    <StatusBadge active={vigente} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
