import { useEffect, useMemo, useState } from "react";
import { Globe2, MapPinned } from "lucide-react";
import { listRegiones, listSalariosCategoriaFasar } from "@/lib/tauri";
import type { Region, SalarioCategoriaFasar } from "@/lib/types";
import { formatearFecha } from "@/lib/fecha";
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional";

/**
 * Tabla de solo lectura con el historial completo de vigencias de salario de
 * la categoría seleccionada — pensado como panel inferior junto al grid de
 * categorías FASAR.
 */
export function SalarioHistorialGrid({
  categoriaId,
  nombresPorUsuarioId = {},
}: {
  categoriaId: string | null;
  nombresPorUsuarioId?: Record<string, string>;
}) {
  const [salarios, setSalarios] = useState<SalarioCategoriaFasar[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Sin categoría no hay nada que pedir, así que tampoco hay espera: el estado
  // arranca a `false` y solo se enciende cuando de verdad se sale a buscar.
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    listRegiones().then(setRegiones).catch(() => {});
  }, []);

  useEffect(() => {
    if (!categoriaId) {
      setSalarios([]);
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    listSalariosCategoriaFasar(categoriaId)
      .then((r) => {
        if (!cancelado) setSalarios(r);
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
  }, [categoriaId]);

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);

  const historial = useMemo(
    () =>
      [...salarios].sort((a, b) => {
        const porDesde = b.fecha_vigencia_desde.localeCompare(a.fecha_vigencia_desde);
        if (porDesde !== 0) return porDesde;
        if ((a.fecha_vigencia_hasta === null) !== (b.fecha_vigencia_hasta === null)) {
          return a.fecha_vigencia_hasta === null ? -1 : 1;
        }
        return b.created_at.localeCompare(a.created_at);
      }),
    [salarios],
  );

  if (!categoriaId) {
    return <p className="p-3 text-xs text-muted-foreground">Selecciona una categoría para ver su historial de salarios.</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-3">
      {error && <p className="pb-2 text-xs text-destructive">{error}</p>}
      {cargando ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : salarios.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin historial.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Región</th>
              <th className="py-1 pr-2 text-right font-medium">Base</th>
              <th className="py-1 pr-2 text-right font-medium">FSR</th>
              <th className="py-1 pr-2 text-right font-medium">Salario real</th>
              <th className="py-1 pr-2 font-medium">Usuario</th>
              <th className="py-1 pr-2 text-right font-medium">Desde</th>
              <th className="py-1 text-right font-medium">Hasta</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((s) => {
              const vigente = s.fecha_vigencia_hasta === null;
              return (
              <tr
                key={s.id}
                className={cn(
                  "border-b border-border/50 last:border-none",
                  vigente && "bg-emerald-500/5",
                )}
              >
                <td className="py-1 pr-2">
                  <span className="inline-flex items-center gap-1.5">
                    {s.region_id ? (
                      <MapPinned size={12} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Globe2 size={12} className="shrink-0 text-primary" />
                    )}
                    {s.region_id ? (nombrePorRegionId[s.region_id] ?? s.region_id) : NACIONAL}
                  </span>
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">${s.salario_base_diario}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{s.factor_salario_real}</td>
                <td className="py-1 pr-2 text-right tabular-nums">${s.salario_real_diario}</td>
                <td className="py-1 pr-2">{nombresPorUsuarioId[s.created_by] ?? s.created_by}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatearFecha(s.fecha_vigencia_desde)}</td>
                <td className="py-1 text-right">
                  {vigente ? (
                    <span className="inline-flex items-center justify-end gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      vigente
                    </span>
                  ) : (
                    <span className="tabular-nums text-muted-foreground">
                      {formatearFecha(s.fecha_vigencia_hasta)}
                    </span>
                  )}
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
