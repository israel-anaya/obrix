import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Globe, GripVertical, HardHat, MapPinned, Plus, RefreshCcw, Users, Wrench, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FilterableCombobox } from "@/components/FilterableCombobox";
import { PercentageInput } from "@/components/PercentageInput";
import { QuantityInput } from "@/components/QuantityInput";
import { toast } from "@/hooks/use-toast";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createCuadrillaDetalle,
  deleteCuadrillaDetalle,
  listCategoriasFasar,
  listCuadrillaCostoDetalles,
  listCuadrillaCostos,
  listCuadrillaDetalles,
  listHerramientas,
  listRegiones,
  listUnidadesMedida,
  moveCuadrillaDetalle,
  recalculateCuadrillaZonas,
  updateCuadrillaDetalle,
} from "@/lib/tauri";
import { useRowDrag, type RowLabel } from "@/hooks/useRowDrag";
import { ordenarPor } from "@/lib/ordenar";
import { formatearFecha, diasTranscurridos } from "@/lib/fecha";
import type {
  CategoriaFasar,
  Cuadrilla,
  CuadrillaCosto,
  CuadrillaCostoDetalle,
  CuadrillaDetalle,
  DireccionMovimiento,
  Herramienta,
  Region,
  UnidadMedida,
} from "@/lib/types";
import { regionesVisibles } from "@/lib/types";
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional";

function fmt(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Cantidad sin ceros de relleno: "1.000000" se lee mejor como "1". */
function fmtCantidad(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { maximumFractionDigits: 6 });
}

function fmtPorcentaje(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return `${numero.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function fmtDelta(valor: number): string {
  const abs = fmt(String(Math.abs(valor)));
  if (valor > 0) return `+$${abs}`;
  if (valor < 0) return `−$${abs}`;
  return "$0.00";
}

function ChipDelta({ valor, className }: { valor: number; className?: string }) {
  if (valor === 0) return null;
  return (
    <span
      className={cn(
        "inline-block animate-in fade-in-0 zoom-in-95 font-semibold tabular-nums",
        valor > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
        className,
      )}
    >
      {fmtDelta(valor)}
    </span>
  );
}

/** Hasta 30 días: vigente. Más de 30: ámbar. Más de 90, o el salario vigente ya no coincide: crítico. */
const DIAS_PRECIO_FRESCO = 30;
const DIAS_PRECIO_CRITICO = 90;

function FechaPrecioFrescura({
  fecha,
  fechaSalarioVigente,
}: {
  fecha: string;
  fechaSalarioVigente?: string | null;
}) {
  const salarioCambio =
    !!fechaSalarioVigente && fecha.slice(0, 10) !== fechaSalarioVigente.slice(0, 10);
  const dias = diasTranscurridos(fecha);
  const nivel = salarioCambio || (dias != null && dias > DIAS_PRECIO_CRITICO)
    ? "critica"
    : dias != null && dias > DIAS_PRECIO_FRESCO
      ? "desactualizada"
      : "vigente";
  const titulo = salarioCambio
    ? `El salario vigente cambió (${formatearFecha(fechaSalarioVigente)}). Sincroniza para actualizar este costo.`
    : nivel === "critica"
      ? `Precio con más de ${DIAS_PRECIO_CRITICO} días de vigencia`
      : nivel === "desactualizada"
        ? `Precio con más de ${DIAS_PRECIO_FRESCO} días de vigencia`
        : formatearFecha(fecha);

  return (
    <div
      title={titulo}
      className={cn(
        "inline-flex items-center justify-end gap-0.5 leading-tight",
        nivel === "vigente" && "text-[10px] font-normal text-muted-foreground/70",
        nivel === "desactualizada" && "text-[11px] font-medium text-amber-700 dark:text-amber-400",
        nivel === "critica" && "text-[11px] font-semibold text-rose-600 dark:text-rose-400",
      )}
    >
      {nivel === "critica" ? <AlertTriangle size={16} className="shrink-0" /> : null}
      {formatearFecha(fecha)}
    </div>
  );
}

function MarcadorInsercion() {
  return (
    <tr aria-hidden className="pointer-events-none">
      <td colSpan={8} className="relative h-0 p-0">
        <div className="absolute inset-x-0 top-0 z-10 flex -translate-y-1/2 items-center gap-2 px-1">
          <span className="size-2 shrink-0 rounded-full bg-primary ring-2 ring-background" />
          <span className="h-0.5 flex-1 bg-primary" />
          <span className="rounded-sm bg-primary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
            Soltar aquí
          </span>
          <span className="h-0.5 flex-1 bg-primary" />
        </div>
      </td>
    </tr>
  );
}

/**
 * "Ficha" de una cuadrilla — reproduce la tarjeta de análisis de precio
 * unitario (APU) que cualquier ingeniero de costos mexicano reconoce de
 * memoria: encabezado con clave/descripción/unidad, dos tablas formales
 * (mano de obra, herramienta) con su subtotal, y el costo total como un
 * renglón final destacado. La receta (integrantes/herramienta y cantidades,
 * `cuadrilla_detalle`) es la misma en todas las regiones; los montos del
 * análisis son los de la región elegida en Costo por región (Nacional al
 * abrir). Ese cuadro es cache de receta × tabulador de cada región.
 */
export function CuadrillaFichaApu({
  cuadrilla,
  onCambio,
}: {
  cuadrilla: Cuadrilla;
  onCambio: () => void;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const [detalles, setDetalles] = useState<CuadrillaDetalle[]>([]);
  const [costos, setCostos] = useState<CuadrillaCosto[]>([]);
  const [costoSeleccionadoId, setCostoSeleccionadoId] = useState<string | null>(null);
  const [costoDetalles, setCostoDetalles] = useState<CuadrillaCostoDetalle[]>([]);
  const [costoDetallesPorCostoId, setCostoDetallesPorCostoId] = useState<Record<string, CuadrillaCostoDetalle[]>>({});
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregandoIntegrante, setAgregandoIntegrante] = useState(false);
  const [agregandoHerramienta, setAgregandoHerramienta] = useState(false);
  const [pendingQuitar, setPendingQuitar] = useState<CuadrillaDetalle | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [mostrarFechaPrecio, setMostrarFechaPrecio] = useState(false);
  /** `null` = Nacional. No se persiste: solo elige qué cache ve el análisis. */
  const [regionVistaId, setRegionVistaId] = useState<string | null>(null);
  const [destello, setDestello] = useState<{
    ticket: number;
    total: number;
    filaId: string;
    fila: number;
  } | null>(null);

  useEffect(() => {
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listHerramientas().then(setHerramientas).catch(() => {});
    listRegiones().then(setRegiones).catch(() => {});
    listUnidadesMedida().then(setUnidades).catch(() => {});
  }, [organizacionActivaId]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    setAgregandoIntegrante(false);
    setAgregandoHerramienta(false);
    setDestello(null);
  }, [cuadrilla.id]);

  useEffect(() => {
    if (!destello) return;
    const t = window.setTimeout(() => setDestello(null), 5000);
    return () => window.clearTimeout(t);
  }, [destello]);

  const aplicarCostos = async (costosR: CuadrillaCosto[], vistaId: string | null) => {
    setCostos(costosR);
    const pares = await Promise.all(
      costosR.map(async (c) => {
        const dets = await listCuadrillaCostoDetalles(c.id).catch(() => [] as CuadrillaCostoDetalle[]);
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
    listCuadrillaCostos(id)
      .then((costosR) => aplicarCostos(costosR, vistaId))
      .catch((e) => {
        setError(String(e));
        setCostos([]);
        setCostoDetalles([]);
        setCostoDetallesPorCostoId({});
        return { costosR: [] as CuadrillaCosto[], seleccionadoId: null as string | null, porCosto: {} as Record<string, CuadrillaCostoDetalle[]> };
      });

  useEffect(() => {
    setCargando(true);
    setError(null);
    setCostoSeleccionadoId(null);
    setRegionVistaId(null);
    Promise.all([listCuadrillaDetalles(cuadrilla.id), listCuadrillaCostos(cuadrilla.id)])
      .then(async ([detallesR, costosR]) => {
        setDetalles(detallesR);
        await aplicarCostos(costosR, null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuadrilla.id]);

  const trasMutarReceta = async () => {
    onCambio();
    await listCuadrillaDetalles(cuadrilla.id).then(setDetalles).catch((e) => setError(String(e)));
    await cargarCostos(cuadrilla.id);
  };

  const trasMutarCantidad = async () => {
    onCambio();
    await listCuadrillaDetalles(cuadrilla.id).then(setDetalles).catch((e) => setError(String(e)));
    const { costosR, seleccionadoId, porCosto } = await cargarCostos(cuadrilla.id);
    const r = seleccionadoId ? (porCosto[seleccionadoId] ?? []) : [];
    const costoTotal = costosR.find((c) => c.id === seleccionadoId)?.costo_total ?? "0";
    return { costoDetalles: r, costoTotal };
  };

  const recalcularZonas = async () => {
    setRecalculando(true);
    setError(null);
    try {
      await recalculateCuadrillaZonas(cuadrilla.id);
      await trasMutarCantidad();
    } catch (e) {
      setError(String(e));
    } finally {
      setRecalculando(false);
    }
  };

  const costoSeleccionado = costos.find((c) => c.id === costoSeleccionadoId) ?? null;
  const costoTotalNum = Number(costoSeleccionado?.costo_total) || 0;
  const pctMo = costoTotalNum > 0 ? ((Number(costoSeleccionado?.sub_total_mano_obra) || 0) / costoTotalNum) * 100 : 0;
  const pctHe = costoTotalNum > 0 ? ((Number(costoSeleccionado?.sub_total_herramienta) || 0) / costoTotalNum) * 100 : 0;

  const simboloUnidad = useMemo(
    () => unidades.find((u) => u.id === cuadrilla.unidad_id)?.simbolo ?? cuadrilla.unidad_id,
    [unidades, cuadrilla.unidad_id],
  );

  const opcionPorCategoriaId = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.id, `${c.clave} — ${c.descripcion}`])),
    [categorias],
  );
  const opcionPorHerramientaId = useMemo(
    () => Object.fromEntries(herramientas.map((h) => [h.id, `${h.clave} — ${h.descripcion}`])),
    [herramientas],
  );
  const categoriaPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const herramientaPorId = useMemo(() => Object.fromEntries(herramientas.map((h) => [h.id, h])), [herramientas]);
  const simboloPorUnidadId = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    [unidades],
  );
  const costoDetallePorDetalleId = useMemo(
    () => Object.fromEntries(costoDetalles.map((cd) => [cd.cuadrilla_detalle_id, cd])),
    [costoDetalles],
  );

  const idsUsados = useMemo(() => new Set(detalles.map((d) => d.detalle_insumo_id)), [detalles]);
  const categoriasDisponibles = useMemo(() => categorias.filter((c) => !idsUsados.has(c.id)), [categorias, idsUsados]);
  const herramientasDisponibles = useMemo(
    () => herramientas.filter((h) => !idsUsados.has(h.id)),
    [herramientas, idsUsados],
  );

  const integrantes = useMemo(
    () => detalles.filter((d) => d.tipo === "categoria_fasar").sort((a, b) => a.orden - b.orden),
    [detalles],
  );
  const herramientaDetalles = useMemo(
    () => detalles.filter((d) => d.tipo === "equipo_herramienta").sort((a, b) => a.orden - b.orden),
    [detalles],
  );

  const zonas = useMemo(() => {
    const nacional = costos.find((c) => c.region_id === null) ?? null;
    const regionales = ordenarPor(regionesVisibles(regiones), (r) => r.nombre).map((r) => ({
      key: r.id,
      regionId: r.id as string | null,
      nombre: r.nombre,
      costo: costos.find((c) => c.region_id === r.id) ?? null,
      esNac: false,
    }));
    return [
      { key: "nacional", regionId: null as string | null, nombre: NACIONAL, costo: nacional, esNac: true },
      ...regionales,
    ];
  }, [costos, regiones]);

  const coberturaPorCostoId = useMemo(() => {
    const idsMo = new Set(integrantes.map((d) => d.id));
    return Object.fromEntries(
      Object.entries(costoDetallesPorCostoId).map(([costoId, dets]) => {
        const mo = dets.filter((d) => idsMo.has(d.cuadrilla_detalle_id));
        const sin = mo.filter((d) => !d.fecha_precio).length;
        return [costoId, { total: idsMo.size, sin }];
      }),
    );
  }, [costoDetallesPorCostoId, integrantes]);

  const sincronizadoEn = useMemo(() => {
    const fechas = costos.map((c) => c.sincronizado_en).filter((f): f is string => !!f);
    if (fechas.length === 0) return null;
    return fechas.sort()[fechas.length - 1] ?? null;
  }, [costos]);

  const verRegion = (regionId: string | null) => {
    setRegionVistaId(regionId);
    const elegido = costos.find((c) => (c.region_id ?? null) === regionId) ?? null;
    setCostoSeleccionadoId(elegido?.id ?? null);
    setCostoDetalles(elegido ? (costoDetallesPorCostoId[elegido.id] ?? []) : []);
  };

  const agregarIntegrante = async (id: string) => {
    setAgregandoIntegrante(false);
    if (!id) return;
    setError(null);
    try {
      await createCuadrillaDetalle(cuadrilla.id, { detalle_insumo_id: id, cantidad: "1" });
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  const agregarHerramienta = async (id: string) => {
    setAgregandoHerramienta(false);
    if (!id) return;
    const herramienta = herramientas.find((h) => h.id === id);
    setError(null);
    try {
      await createCuadrillaDetalle(cuadrilla.id, {
        detalle_insumo_id: id,
        cantidad: String(herramienta?.porcentaje_mano_obra ?? 0),
      });
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  const guardarCantidad = async (detalle: CuadrillaDetalle, valorTexto: string) => {
    if (valorTexto.trim() === "") return;
    const numero = Number(valorTexto);
    if (!Number.isFinite(numero) || numero < 0) {
      setError("La cantidad debe ser un número mayor o igual a 0.");
      return;
    }
    const cd = costoDetallePorDetalleId[detalle.id];
    if (!cd) return;
    // Mano de obra (número de integrantes, puede ser fraccionario) a 6
    // decimales; herramienta es un porcentaje 0-100, con 2 basta.
    const decimales = detalle.tipo === "categoria_fasar" ? 6 : 2;
    const redondeada = Number(numero.toFixed(decimales));
    if (redondeada === Number(detalle.cantidad)) return;
    setError(null);
    try {
      const totalAntes = Number(costoSeleccionado?.costo_total) || 0;
      const importeAntes = Number(cd.importe) || 0;
      await updateCuadrillaDetalle(detalle.id, {
        detalle_insumo_id: detalle.detalle_insumo_id,
        cantidad: String(redondeada),
      });
      const nuevos = await trasMutarCantidad();
      const importeDespues = Number(nuevos.costoDetalles.find((n) => n.cuadrilla_detalle_id === detalle.id)?.importe) || 0;
      const deltaTotal = centavos(Number(nuevos.costoTotal) - totalAntes);
      const deltaFila = centavos(importeDespues - importeAntes);
      if (deltaTotal !== 0 || deltaFila !== 0) {
        setDestello({ ticket: Date.now(), total: deltaTotal, filaId: detalle.id, fila: deltaFila });
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const reordenar = async (filas: CuadrillaDetalle[], id: string, indiceDestino: number) => {
    const fromIndex = filas.findIndex((d) => d.id === id);
    if (fromIndex < 0 || fromIndex === indiceDestino) return;
    const direccion: DireccionMovimiento = indiceDestino < fromIndex ? "arriba" : "abajo";
    const pasos = Math.abs(indiceDestino - fromIndex);
    setError(null);
    try {
      for (let i = 0; i < pasos; i++) {
        await moveCuadrillaDetalle(id, direccion);
      }
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  const nombreDetalle = (detalle: CuadrillaDetalle) =>
    detalle.tipo === "categoria_fasar"
      ? (opcionPorCategoriaId[detalle.detalle_insumo_id] ?? detalle.detalle_insumo_id)
      : (opcionPorHerramientaId[detalle.detalle_insumo_id] ?? detalle.detalle_insumo_id);

  const etiquetaDetalle = (lista: CuadrillaDetalle[], id: string): RowLabel | null => {
    const detalle = lista.find((d) => d.id === id);
    if (!detalle) return null;
    const costo = costoDetallePorDetalleId[detalle.id]?.costo;
    if (detalle.tipo === "categoria_fasar") {
      const categoria = categoriaPorId[detalle.detalle_insumo_id];
      return {
        title: nombreDetalle(detalle),
        quantity: fmtCantidad(detalle.cantidad),
        unit: simboloPorUnidadId[categoria?.unidad_id ?? ""] ?? "",
        cost: costo ? `$${fmt(costo)}` : undefined,
      };
    }
    const herramienta = herramientaPorId[detalle.detalle_insumo_id];
    return {
      title: nombreDetalle(detalle),
      quantity: fmtPorcentaje(detalle.cantidad),
      unit: simboloPorUnidadId[herramienta?.unidad_id ?? ""] ?? "",
      cost: costo ? `$${fmt(costo)}` : undefined,
    };
  };

  const dragIntegrantes = useRowDrag({
    ids: integrantes.map((d) => d.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(integrantes, id, dest),
    label: (id) => etiquetaDetalle(integrantes, id),
  });
  const dragHerramienta = useRowDrag({
    ids: herramientaDetalles.map((d) => d.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(herramientaDetalles, id, dest),
    label: (id) => etiquetaDetalle(herramientaDetalles, id),
  });

  const confirmarQuitar = async () => {
    if (!pendingQuitar) return;
    setError(null);
    try {
      await deleteCuadrillaDetalle(pendingQuitar.id);
      setPendingQuitar(null);
      await trasMutarReceta();
    } catch (e) {
      setPendingQuitar(null);
      setError(String(e));
    }
  };

  return (
    <div className="w-full">
      <div className="rounded-lg border-2 border-foreground/20 bg-card shadow-sm">
        {/* Mismo indicador de carga indeterminado que usa DataGrid, para
            avisar tanto al cargar el detalle como al recalcular. */}
        {(cargando || recalculando) && (
          <div aria-hidden className="h-[3px] overflow-hidden rounded-t-lg bg-primary/25">
            <div className="indeterminate-progress-bar h-full w-1/3 rounded-full bg-primary" />
          </div>
        )}
        {/* Encabezado del análisis */}
        <div className="border-b-2 border-foreground/20 px-4 py-3">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Users size={16} className="text-emerald-500" />
            Análisis de cuadrilla
          </span>

          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="font-mono text-base font-bold tracking-tight">{cuadrilla.clave}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              Unidad: <span className="font-medium text-foreground">{simboloUnidad}</span>
              <span aria-hidden className="px-1.5 text-border">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                {regionVistaId ? (
                  <MapPinned size={12} className="text-teal-600 dark:text-teal-400" />
                ) : (
                  <Globe size={12} className="text-primary" />
                )}
                {zonas.find((z) => z.regionId === regionVistaId)?.nombre ?? NACIONAL}
              </span>
            </span>
          </div>
          <p className="mt-0.5 text-xs text-foreground">{cuadrilla.descripcion}</p>
          <div className="mt-2 flex items-center gap-3">
            <div
              className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
              title={`MO ${pctMo.toFixed(0)}% / Herramienta ${pctHe.toFixed(0)}%`}
            >
              <div className="bg-blue-500" style={{ width: `${pctMo}%` }} />
              <div className="bg-amber-500" style={{ width: `${pctHe}%` }} />
            </div>
            <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <HardHat size={16} className="text-blue-500" />
                {pctMo.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1">
                <Wrench size={16} className="text-amber-500" />
                {pctHe.toFixed(0)}%
              </span>
            </span>
          </div>
        </div>

        <div className="p-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-foreground/30 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="w-6 py-1" />
                <th className="w-20 py-1 pr-2 font-semibold">Código</th>
                <th className="py-1 pr-2 font-semibold">Descripción</th>
                <th className="w-16 py-1 pr-2 font-semibold">Unidad</th>
                <th className="w-20 py-1 pr-2 text-right font-semibold">Cantidad</th>
                <th className="w-24 py-1 pr-2 text-right font-semibold">
                  <span className="inline-flex items-center justify-end gap-1">
                    Costo
                    <button
                      type="button"
                      aria-pressed={mostrarFechaPrecio}
                      title="Mostrar/ocultar fecha de precios"
                      onClick={() => setMostrarFechaPrecio((v) => !v)}
                      className={cn(
                        "rounded p-0.5 normal-case tracking-normal",
                        mostrarFechaPrecio
                          ? "text-primary"
                          : "text-muted-foreground/70 hover:text-foreground",
                      )}
                    >
                      <CalendarDays
                        size={16}
                        className={mostrarFechaPrecio ? "fill-current" : undefined}
                      />
                    </button>
                  </span>
                </th>
                <th className="w-24 py-1 text-right font-semibold">Importe</th>
                <th className="w-8" />
              </tr>
            </thead>

            {/* MANO DE OBRA */}
            <tbody>
              <tr>
                <td colSpan={8} className="pt-2 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <HardHat size={16} className="text-blue-500" />
                    Mano de obra
                  </span>
                </td>
              </tr>
              {integrantes.length === 0 && !agregandoIntegrante && (
                <tr>
                  <td colSpan={8} className="py-1.5 text-muted-foreground">
                    Sin integrantes todavía.
                  </td>
                </tr>
              )}
              {integrantes.map((d, i) => {
                const cd = costoDetallePorDetalleId[d.id];
                return (
                  <Fragment key={d.id}>
                    {dragIntegrantes.gap === i && <MarcadorInsercion />}
                    <tr
                      className={cn(
                        "group border-b border-border/50 hover:bg-muted/30",
                        dragIntegrantes.rowClass(d.id),
                      )}
                      {...dragIntegrantes.rowProps(d.id)}
                    >
                    <td className="py-1 pr-1">
                      <span
                        title="Arrastra para reordenar"
                        className="inline-flex cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                        {...dragIntegrantes.handleProps(d.id)}
                      >
                        <GripVertical size={16} />
                      </span>
                    </td>
                    <td className="py-1 pr-2 font-mono text-muted-foreground">
                      {categoriaPorId[d.detalle_insumo_id]?.clave ?? d.detalle_insumo_id}
                    </td>
                    <td className="py-1 pr-2">{categoriaPorId[d.detalle_insumo_id]?.descripcion ?? ""}</td>
                    <td className="py-1 pr-2 text-muted-foreground">
                      {simboloPorUnidadId[categoriaPorId[d.detalle_insumo_id]?.unidad_id ?? ""] ?? ""}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <QuantityInput
                        value={d.cantidad}
                        onCommit={(v) => void guardarCantidad(d, v)}
                        decimals={6}
                        className="w-24 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
                      />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
                      <div>${fmt(cd?.costo ?? "0")}</div>
                      {mostrarFechaPrecio && cd?.fecha_precio ? (
                        <FechaPrecioFrescura
                          fecha={cd.fecha_precio}
                          fechaSalarioVigente={
                            categoriaPorId[d.detalle_insumo_id]?.salario_vigente?.fecha_vigencia_desde
                          }
                        />
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "py-1 text-right font-medium tabular-nums transition-colors duration-700",
                        destello?.filaId === d.id && destello.fila > 0 && "bg-emerald-500/20",
                        destello?.filaId === d.id && destello.fila < 0 && "bg-rose-500/20",
                      )}
                    >
                      <span className="inline-flex items-baseline justify-end gap-1">
                        {destello?.filaId === d.id && (
                          <ChipDelta key={destello.ticket} valor={destello.fila} className="text-[10px]" />
                        )}
                        ${fmt(cd?.importe ?? "0")}
                      </span>
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        title="Quitar"
                        onClick={() => setPendingQuitar(d)}
                        className="rounded p-0.5 text-destructive opacity-0 pointer-events-none transition-opacity hover:bg-destructive/10 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                  {dragIntegrantes.gap === integrantes.length && i === integrantes.length - 1 && (
                    <MarcadorInsercion />
                  )}
                  </Fragment>
                );
              })}
              <tr>
                  <td colSpan={8} className="pt-1.5">
                    {agregandoIntegrante ? (
                      <FilterableCombobox
                        options={categoriasDisponibles.map((c) => ({
                          id: c.id,
                          label: `${c.clave} — ${c.descripcion}`,
                        }))}
                        onSelect={(id) => void agregarIntegrante(id)}
                        onCancel={() => setAgregandoIntegrante(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAgregandoIntegrante(true)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                      >
                        <Plus size={16} /> Agregar renglón
                      </button>
                    )}
                  </td>
                </tr>
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={6} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal mano de obra
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(costoSeleccionado?.sub_total_mano_obra ?? "0")}</td>
                <td />
              </tr>
            </tbody>

            {/* HERRAMIENTA */}
            <tbody>
              <tr>
                <td colSpan={8} className="pt-3 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Wrench size={16} className="text-amber-500" />
                    Herramienta
                  </span>
                </td>
              </tr>
              {herramientaDetalles.length === 0 && !agregandoHerramienta && (
                <tr>
                  <td colSpan={8} className="py-1.5 text-muted-foreground">
                    Sin herramienta todavía.
                  </td>
                </tr>
              )}
              {herramientaDetalles.map((d, i) => {
                const cd = costoDetallePorDetalleId[d.id];
                return (
                  <Fragment key={d.id}>
                    {dragHerramienta.gap === i && <MarcadorInsercion />}
                    <tr
                      className={cn(
                        "group border-b border-border/50 hover:bg-muted/30",
                        dragHerramienta.rowClass(d.id),
                      )}
                      {...dragHerramienta.rowProps(d.id)}
                    >
                    <td className="py-1 pr-1">
                      <span
                        title="Arrastra para reordenar"
                        className="inline-flex cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                        {...dragHerramienta.handleProps(d.id)}
                      >
                        <GripVertical size={16} />
                      </span>
                    </td>
                    <td className="py-1 pr-2 font-mono text-muted-foreground">
                      {herramientaPorId[d.detalle_insumo_id]?.clave ?? d.detalle_insumo_id}
                    </td>
                    <td className="py-1 pr-2">{herramientaPorId[d.detalle_insumo_id]?.descripcion ?? ""}</td>
                    <td className="py-1 pr-2 text-muted-foreground">
                      {simboloPorUnidadId[herramientaPorId[d.detalle_insumo_id]?.unidad_id ?? ""] ?? ""}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <PercentageInput
                        value={d.cantidad}
                        onCommit={(v) => void guardarCantidad(d, v)}
                        decimals={2}
                        className="w-16 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
                      />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">${fmt(cd?.costo ?? "0")}</td>
                    <td
                      className={cn(
                        "py-1 text-right font-medium tabular-nums transition-colors duration-700",
                        destello?.filaId === d.id && destello.fila > 0 && "bg-emerald-500/20",
                        destello?.filaId === d.id && destello.fila < 0 && "bg-rose-500/20",
                      )}
                    >
                      <span className="inline-flex items-baseline justify-end gap-1">
                        {destello?.filaId === d.id && (
                          <ChipDelta key={destello.ticket} valor={destello.fila} className="text-[10px]" />
                        )}
                        ${fmt(cd?.importe ?? "0")}
                      </span>
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        title="Quitar"
                        onClick={() => setPendingQuitar(d)}
                        className="rounded p-0.5 text-destructive opacity-0 pointer-events-none transition-opacity hover:bg-destructive/10 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                  {dragHerramienta.gap === herramientaDetalles.length &&
                    i === herramientaDetalles.length - 1 && <MarcadorInsercion />}
                  </Fragment>
                );
              })}
              <tr>
                  <td colSpan={8} className="pt-1.5">
                    {agregandoHerramienta ? (
                      <FilterableCombobox
                        options={herramientasDisponibles.map((h) => ({
                          id: h.id,
                          label: `${h.clave} — ${h.descripcion}${
                            h.porcentaje_mano_obra !== null ? ` (${h.porcentaje_mano_obra}%)` : ""
                          }`,
                        }))}
                        onSelect={(id) => void agregarHerramienta(id)}
                        onCancel={() => setAgregandoHerramienta(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAgregandoHerramienta(true)}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                      >
                        <Plus size={16} /> Agregar renglón
                      </button>
                    )}
                  </td>
                </tr>
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={6} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal herramienta
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(costoSeleccionado?.sub_total_herramienta ?? "0")}</td>
                <td />
              </tr>
            </tbody>
          </table>

          {cargando && detalles.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">Cargando…</p>}
        </div>

        {/* Costo total */}
        <div
          className={cn(
            "flex items-center justify-between rounded-b-lg border-t-2 border-foreground/20 px-4 py-2.5 transition-colors duration-700",
            destello && destello.total > 0 && "bg-emerald-500/20",
            destello && destello.total < 0 && "bg-rose-500/20",
            (!destello || destello.total === 0) && "bg-muted/40",
          )}
        >
          <span className="text-xs font-semibold uppercase tracking-widest">Costo directo</span>
          <span className="flex items-baseline gap-2">
            {destello && (
              <ChipDelta key={destello.ticket} valor={destello.total} className="text-sm" />
            )}
            <span className="text-xl font-bold tabular-nums">${fmt(costoSeleccionado?.costo_total ?? "0")}</span>
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border-2 border-foreground/20 bg-card shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Costo por región
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Calculado desde el Tabulador de Salario vigente. Clic en una región para ver su costo en el análisis.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              title={
                recalculando
                  ? "Recalculando costos de todas las regiones…"
                  : [
                      "Recalcular todas las regiones con los salarios y la herramienta vigentes.",
                      sincronizadoEn
                        ? `Última sincronización: ${formatearFecha(sincronizadoEn)}`
                        : "Aún no se ha sincronizado con los tabuladores vigentes.",
                    ].join("\n")
              }
              onClick={() => void recalcularZonas()}
              disabled={recalculando}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted",
                recalculando && "opacity-50",
              )}
            >
              <RefreshCcw size={16} className={cn(recalculando && "animate-spin")} />
              {recalculando ? "Sincronizando…" : "Sincronizar"}
            </button>
            {sincronizadoEn ? (
              <span className="text-right text-[9px] leading-tight text-muted-foreground tabular-nums">
                {formatearFecha(sincronizadoEn)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle size={16} className="shrink-0" />
                Sin sincronizar
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto px-4 py-3">
          <table className="w-max min-w-full table-fixed border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-30 w-[5.5rem] min-w-[5.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
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
                    onClick={() => verRegion(z.regionId)}
                  >
                    {z.esNac ? (
                      <Globe size={16} className="mx-auto text-primary" aria-label="Nacional" />
                    ) : (
                      <MapPinned size={16} className="mx-auto text-teal-600 dark:text-teal-400" />
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
                    onClick={() => verRegion(z.regionId)}
                  >
                    <span className="line-clamp-2 break-words">{z.nombre}</span>
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="sticky left-0 z-10 w-[5.5rem] min-w-[5.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left font-normal text-muted-foreground">
                  Mano de obra
                </th>
                {zonas.map((z) => {
                  const cob = z.costo ? coberturaPorCostoId[z.costo.id] : undefined;
                  const incompleta = !z.costo || (cob?.sin ?? 0) > 0;
                  const monto = incompleta ? "—" : `$${fmt(z.costo?.sub_total_mano_obra ?? "0")}`;
                  const activa = (z.regionId ?? null) === regionVistaId;
                  return (
                    <td
                      key={z.key}
                      className={cn(
                        "w-14 max-w-14 cursor-pointer overflow-hidden border-b border-r border-border px-1 py-1.5 text-right hover:bg-muted/60",
                        activa && "bg-primary/10",
                      )}
                      onClick={() => verRegion(z.regionId)}
                    >
                      <span className="num block truncate" title={incompleta ? undefined : monto}>
                        {monto}
                      </span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 w-[5.5rem] min-w-[5.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left font-normal text-muted-foreground">
                  Herramienta
                </th>
                {zonas.map((z) => {
                  const cob = z.costo ? coberturaPorCostoId[z.costo.id] : undefined;
                  const incompleta = !z.costo || (cob?.sin ?? 0) > 0;
                  const monto = incompleta ? "—" : `$${fmt(z.costo?.sub_total_herramienta ?? "0")}`;
                  const activa = (z.regionId ?? null) === regionVistaId;
                  return (
                    <td
                      key={z.key}
                      className={cn(
                        "w-14 max-w-14 cursor-pointer overflow-hidden border-b border-r border-border px-1 py-1.5 text-right hover:bg-muted/60",
                        activa && "bg-primary/10",
                      )}
                      onClick={() => verRegion(z.regionId)}
                    >
                      <span className="num block truncate" title={incompleta ? undefined : monto}>
                        {monto}
                      </span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 w-[5.5rem] min-w-[5.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left font-semibold">
                  Costo Total
                </th>
                {zonas.map((z) => {
                  const cob = z.costo ? coberturaPorCostoId[z.costo.id] : undefined;
                  const sin = cob?.sin ?? (integrantes.length > 0 && !z.costo ? integrantes.length : 0);
                  const total = cob?.total ?? integrantes.length;
                  const monto = z.costo ? `$${fmt(z.costo.costo_total)}` : undefined;
                  const activa = (z.regionId ?? null) === regionVistaId;
                  return (
                    <td
                      key={z.key}
                      className={cn(
                        "w-14 max-w-14 cursor-pointer overflow-hidden border-b border-r border-border px-1 py-1.5 text-right hover:bg-muted/60",
                        activa && "bg-primary/10",
                      )}
                      onClick={() => verRegion(z.regionId)}
                    >
                      {!z.costo || sin > 0 ? (
                        total > 0 ? (
                          <span
                            title="sin precio"
                            className="inline-flex items-center justify-end text-amber-800 dark:text-amber-300"
                          >
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
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {regionVistaId ? (
              <MapPinned size={12} className="shrink-0 text-teal-600 dark:text-teal-400" />
            ) : (
              <Globe size={12} className="shrink-0 text-primary" />
            )}
            El análisis usa los salarios de {zonas.find((z) => (z.regionId ?? null) === regionVistaId)?.nombre ?? NACIONAL}.
          </p>
        </div>
      </div>

      {dragIntegrantes.preview}
      {dragHerramienta.preview}

      <AlertDialog open={pendingQuitar !== null} onOpenChange={(open) => !open && setPendingQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este renglón de la cuadrilla?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingQuitar && `Se quitará "${nombreDetalle(pendingQuitar)}" de todas las regiones. Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => void confirmarQuitar()}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
