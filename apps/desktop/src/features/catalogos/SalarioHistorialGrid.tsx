import { useEffect, useMemo, useState } from "react";
import { CatalogoGrid, type CatalogoGridConfig, type Fila } from "@/features/catalogos/CatalogoGrid";
import { listRegiones, listSalariosCategoriaFasar, listUsuarios } from "@/lib/tauri";
import type { Region, SalarioCategoriaFasar } from "@/lib/types";

const NACIONAL = "Nacional";

const CONFIG: CatalogoGridConfig = {
  titulo: "Histórico de salarios",
  columnas: [
    { campo: "region", encabezado: "Región", ancho: 160, soloLectura: true },
    { campo: "salario_base_diario", encabezado: "Base", ancho: 110, soloLectura: true, numero: true },
    { campo: "factor_salario_real", encabezado: "FSR", ancho: 110, soloLectura: true, numero: true },
    { campo: "salario_real_diario", encabezado: "Salario real", ancho: 130, soloLectura: true, numero: true },
    { campo: "usuario", encabezado: "Usuario", ancho: 220, soloLectura: true },
    { campo: "desde", encabezado: "Desde", ancho: 110, soloLectura: true, fecha: true },
    { campo: "hasta", encabezado: "Hasta", ancho: 110, soloLectura: true, fecha: true },
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

  const filas: Fila[] = useMemo(
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
        <CatalogoGrid config={CONFIG} filasIniciales={filas} />
      </div>
    </div>
  );
}
