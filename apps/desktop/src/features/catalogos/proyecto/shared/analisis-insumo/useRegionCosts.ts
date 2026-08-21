import { useEffect, useMemo, useState } from "react";
import { ordenarPor } from "@/lib/ordenar";
import type { Region } from "@/lib/types";
import { regionesVisibles } from "@/lib/types";

const NACIONAL = "Nacional";

interface CostoBase {
  id: string;
  region_id: string | null;
  costo_total: string;
  sincronizado_en: string | null;
}

interface CostoDetalleBase {
  fecha_precio: string | null;
}

export interface Zona<Costo> {
  key: string;
  regionId: string | null;
  nombre: string;
  costo: Costo | null;
  esNac: boolean;
}

interface UseRegionCostsParams<Costo extends CostoBase, CostoDetalle extends CostoDetalleBase> {
  entityId: string;
  regiones: Region[];
  listCostos: (id: string) => Promise<Costo[]>;
  listCostoDetalles: (costoId: string) => Promise<CostoDetalle[]>;
  /** FK del detalle de costo hacia la fila de receta a la que pertenece. */
  detalleRowId: (cd: CostoDetalle) => string;
  /** Filas de la receta que deben tener precio, para calcular cobertura por región. */
  filasCobertura: { id: string }[];
  onError: (e: unknown) => void;
}

/**
 * Encapsula el patrón de "costo nacional + costo por región" (cache de
 * receta × tabulador vigente por zona) compartido por básico auxiliar,
 * cuadrilla y equipo de costo horario: cargar los costos de una entidad,
 * elegir cuál se ve en el análisis (Nacional por defecto), y calcular la
 * cobertura de precios de cada región para el bloque "Costo por región".
 */
export function useRegionCosts<Costo extends CostoBase, CostoDetalle extends CostoDetalleBase>({
  entityId,
  regiones,
  listCostos,
  listCostoDetalles,
  detalleRowId,
  filasCobertura,
  onError,
}: UseRegionCostsParams<Costo, CostoDetalle>) {
  const [costos, setCostos] = useState<Costo[]>([]);
  const [costoSeleccionadoId, setCostoSeleccionadoId] = useState<string | null>(null);
  const [costoDetalles, setCostoDetalles] = useState<CostoDetalle[]>([]);
  const [costoDetallesPorCostoId, setCostoDetallesPorCostoId] = useState<Record<string, CostoDetalle[]>>({});
  const [regionVistaId, setRegionVistaId] = useState<string | null>(null);

  useEffect(() => {
    setCostoSeleccionadoId(null);
    setRegionVistaId(null);
  }, [entityId]);

  const aplicarCostos = async (costosR: Costo[], vistaId: string | null) => {
    setCostos(costosR);
    const pares = await Promise.all(
      costosR.map(async (c) => {
        const dets = await listCostoDetalles(c.id).catch(() => [] as CostoDetalle[]);
        return [c.id, dets] as const;
      }),
    );
    const porCosto = Object.fromEntries(pares);
    setCostoDetallesPorCostoId(porCosto);
    const nacionalId = costosR.find((c) => c.region_id === null)?.id ?? costosR[0]?.id ?? null;
    const elegido = costosR.find((c) => (c.region_id ?? null) === vistaId) ?? null;
    const seleccionadoId = elegido?.id ?? (vistaId === null ? nacionalId : null);
    setCostoSeleccionadoId(seleccionadoId);
    setCostoDetalles(seleccionadoId ? (porCosto[seleccionadoId] ?? []) : []);
    return { costosR, seleccionadoId, porCosto };
  };

  const cargarCostos = (id: string, vistaId: string | null = regionVistaId) =>
    listCostos(id)
      .then((costosR) => aplicarCostos(costosR, vistaId))
      .catch((e) => {
        onError(e);
        setCostos([]);
        setCostoDetalles([]);
        setCostoDetallesPorCostoId({});
        return { costosR: [] as Costo[], seleccionadoId: null as string | null, porCosto: {} as Record<string, CostoDetalle[]> };
      });

  const verRegion = (regionId: string | null) => {
    setRegionVistaId(regionId);
    const elegido = costos.find((c) => (c.region_id ?? null) === regionId) ?? null;
    setCostoSeleccionadoId(elegido?.id ?? null);
    setCostoDetalles(elegido ? (costoDetallesPorCostoId[elegido.id] ?? []) : []);
  };

  const costoSeleccionado = costos.find((c) => c.id === costoSeleccionadoId) ?? null;

  const zonas = useMemo<Zona<Costo>[]>(() => {
    const nacional = costos.find((c) => c.region_id === null) ?? null;
    const regionales = ordenarPor(regionesVisibles(regiones), (r) => r.nombre).map((r) => ({
      key: r.id,
      regionId: r.id as string | null,
      nombre: r.nombre,
      costo: costos.find((c) => c.region_id === r.id) ?? null,
      esNac: false,
    }));
    return [{ key: "nacional", regionId: null as string | null, nombre: NACIONAL, costo: nacional, esNac: true }, ...regionales];
  }, [costos, regiones]);

  const coberturaPorCostoId = useMemo(() => {
    const idsFilas = new Set(filasCobertura.map((f) => f.id));
    return Object.fromEntries(
      Object.entries(costoDetallesPorCostoId).map(([costoId, dets]) => {
        const deReceta = dets.filter((d) => idsFilas.has(detalleRowId(d)));
        const sin = deReceta.filter((d) => !d.fecha_precio).length;
        return [costoId, { total: idsFilas.size, sin }];
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costoDetallesPorCostoId, filasCobertura]);

  const sincronizadoEn = useMemo(() => {
    const fechas = costos.map((c) => c.sincronizado_en).filter((f): f is string => !!f);
    if (fechas.length === 0) return null;
    return fechas.sort()[fechas.length - 1] ?? null;
  }, [costos]);

  return {
    costos,
    costoDetalles,
    costoDetallesPorCostoId,
    costoSeleccionadoId,
    costoSeleccionado,
    regionVistaId,
    zonas,
    coberturaPorCostoId,
    sincronizadoEn,
    cargarCostos,
    verRegion,
  };
}
