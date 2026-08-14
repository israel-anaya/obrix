import { useEffect, useMemo, useState } from "react";
import { listRegiones, listSalariosCategoriaFasar, listUsuarios } from "@/lib/tauri";
import type { Region, SalarioCategoriaFasar } from "@/lib/types";
import { formatearFecha } from "@/lib/fecha";

const NACIONAL = "Nacional";

/**
 * Tabla de solo lectura con el historial completo de vigencias de salario de
 * la categoría seleccionada — pensado como panel inferior junto al grid de
 * categorías FASAR.
 */
export function SalarioHistorialGrid({ categoriaId }: { categoriaId: string | null }) {
  const [salarios, setSalarios] = useState<SalarioCategoriaFasar[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Sin categoría no hay nada que pedir, así que tampoco hay espera: el estado
  // arranca a `false` y solo se enciende cuando de verdad se sale a buscar.
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    listRegiones().then(setRegiones).catch(() => {});
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
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
            {salarios.map((s) => (
              <tr key={s.id} className="border-b border-border/50 last:border-none">
                <td className="py-1 pr-2">{s.region_id ? (nombrePorRegionId[s.region_id] ?? s.region_id) : NACIONAL}</td>
                <td className="py-1 pr-2 text-right tabular-nums">${s.salario_base_diario}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{s.factor_salario_real}</td>
                <td className="py-1 pr-2 text-right tabular-nums">${s.salario_real_diario}</td>
                <td className="py-1 pr-2">{nombresPorUsuarioId[s.created_by] ?? s.created_by}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{formatearFecha(s.fecha_vigencia_desde)}</td>
                <td className="py-1 text-right tabular-nums text-muted-foreground">
                  {s.fecha_vigencia_hasta ? formatearFecha(s.fecha_vigencia_hasta) : "vigente"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
