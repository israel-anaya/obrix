import { useEffect, useMemo, useState } from "react";
import { DataGrid, type DataGridConfig, type Row } from "@/components/grid/DataGrid";
import { listRegiones, listSalariosCategoriaFasar, listUsuarios } from "@/lib/tauri";
import type { Region, SalarioCategoriaFasar } from "@/lib/types";

const NACIONAL = "Nacional";

const CONFIG: DataGridConfig = {
  title: "Histórico de salarios",
  columns: [
    { field: "region", header: "Región", width: 160, readOnly: true },
    { field: "salario_base_diario", header: "Base", width: 110, readOnly: true, numeric: true },
    { field: "factor_salario_real", header: "FSR", width: 110, readOnly: true, numeric: true },
    { field: "salario_real_diario", header: "Salario real", width: 130, readOnly: true, numeric: true },
    { field: "usuario", header: "Usuario", width: 220, readOnly: true },
    { field: "desde", header: "Desde", width: 110, readOnly: true, date: true },
    { field: "hasta", header: "Hasta", width: 110, readOnly: true, date: true },
  ],
};

/**
 * Grid de solo lectura con el historial completo de vigencias de salario de
 * la categoría seleccionada — pensado como panel inferior junto al grid de
 * categorías FASAR, vista "tabla completa" alternativa al resumen que ya
 * ofrece `SalarioCategoriaFasarPanel`.
 */
export function SalarioHistorialGrid({ categoriaId }: { categoriaId: string | null }) {
  const [salarios, setSalarios] = useState<SalarioCategoriaFasar[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

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
    listSalariosCategoriaFasar(categoriaId)
      .then((r) => {
        if (!cancelado) setSalarios(r);
      })
      .catch((e) => {
        if (!cancelado) setError(String(e));
      });
    return () => {
      cancelado = true;
    };
  }, [categoriaId]);

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);

  const filas: Row[] = useMemo(
    () =>
      salarios.map((s) => ({
        _id: s.id,
        region: s.region_id ? (nombrePorRegionId[s.region_id] ?? s.region_id) : NACIONAL,
        salario_base_diario: `$${s.salario_base_diario}`,
        factor_salario_real: s.factor_salario_real,
        salario_real_diario: `$${s.salario_real_diario}`,
        usuario: nombresPorUsuarioId[s.created_by] ?? s.created_by,
        desde: s.fecha_vigencia_desde,
        hasta: s.fecha_vigencia_hasta ?? "",
      })),
    [salarios, nombrePorRegionId, nombresPorUsuarioId],
  );

  if (!categoriaId) {
    return <p className="p-3 text-xs text-muted-foreground">Selecciona una categoría para ver su historial de salarios.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        <DataGrid config={CONFIG} initialRows={filas} />
      </div>
    </div>
  );
}
