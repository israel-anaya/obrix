import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, CalendarDays, Globe2, GripVertical, HardHat, MapPinned, Plus, RefreshCcw, Trash2, Users, Wrench, X } from "lucide-react";
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
import { ComboboxFiltrable } from "@/components/ComboboxFiltrable";
import { PercentageInput } from "@/components/PercentageInput";
import { QuantityInput } from "@/components/QuantityInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  createCuadrillaCostoRegional,
  createCuadrillaDetalle,
  deleteCuadrillaCosto,
  deleteCuadrillaDetalle,
  listCategoriasFasar,
  listCuadrillaCostoDetalles,
  listCuadrillaCostos,
  listCuadrillaDetalles,
  listHerramientas,
  listRegiones,
  listUnidadesMedida,
  moveCuadrillaDetalle,
  recalculateCuadrillaCosto,
  updateCuadrillaCostoDetalle,
} from "@/lib/tauri";
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
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional";

function fmt(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const MITAD_FILA = 0.5;

/**
 * Reordenar renglones de la ficha arrastrando el handle (⋮⋮). HTML5 nativo,
 * el mismo enfoque que `useColumnDrag` en el grid: el navegador pinta la
 * imagen del drag y no hay `mousemove` compitiendo con los inputs de cantidad.
 * El handle es el único `draggable`; la fila solo recibe drop.
 */
function useFilaDrag({
  ids,
  onMove,
  enabled,
}: {
  ids: string[];
  onMove: (id: string, indiceDestino: number) => void;
  enabled: boolean;
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [soltarEn, setSoltarEn] = useState<{ id: string; antes: boolean } | null>(null);
  const soltarEnRef = useRef(soltarEn);
  soltarEnRef.current = soltarEn;
  const arrastrandoRef = useRef<string | null>(null);

  const limpiar = useCallback(() => {
    arrastrandoRef.current = null;
    setArrastrando(null);
    setSoltarEn(null);
  }, []);

  const handleProps = useCallback(
    (id: string) =>
      enabled
        ? {
            draggable: true as const,
            onDragStart: (e: DragEvent) => {
              arrastrandoRef.current = id;
              setArrastrando(id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
            },
            onDragEnd: limpiar,
          }
        : {},
    [enabled, limpiar],
  );

  const mitadSuperior = (e: DragEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    return e.clientY - box.top < box.height * MITAD_FILA;
  };

  const filaProps = useCallback(
    (id: string) =>
      enabled
        ? {
            onDragOver: (e: DragEvent) => {
              if (arrastrandoRef.current === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const antes = mitadSuperior(e);
              const actual = soltarEnRef.current;
              if (!actual || actual.id !== id || actual.antes !== antes) {
                setSoltarEn({ id, antes });
              }
            },
            onDrop: (e: DragEvent) => {
              const from = arrastrandoRef.current;
              if (from === null) return limpiar();
              e.preventDefault();
              const to = ids.indexOf(id);
              const fromIndex = ids.indexOf(from);
              if (to < 0 || fromIndex < 0) return limpiar();
              let dest = mitadSuperior(e) ? to : to + 1;
              if (fromIndex < dest) dest -= 1;
              limpiar();
              if (dest !== fromIndex) onMove(from, dest);
            },
          }
        : {},
    [enabled, ids, onMove, limpiar],
  );

  const filaClass = useCallback(
    (id: string): string | false => {
      if (arrastrando === id) return "opacity-40";
      return false;
    },
    [arrastrando],
  );

  // Índice del hueco visual (0 = antes del primero, `ids.length` = después del
  // último). `null` si no hay drag o si soltar ahí no movería la fila.
  const hueco = useMemo(() => {
    if (!soltarEn || !arrastrando) return null;
    const to = ids.indexOf(soltarEn.id);
    const from = ids.indexOf(arrastrando);
    if (to < 0 || from < 0) return null;
    const dest = soltarEn.antes ? to : to + 1;
    if (dest === from || dest === from + 1) return null;
    return dest;
  }, [soltarEn, arrastrando, ids]);

  return useMemo(
    () => ({ handleProps, filaProps, filaClass, hueco }),
    [handleProps, filaProps, filaClass, hueco],
  );
}

function MarcadorInsercion() {
  return (
    <tr aria-hidden className="pointer-events-none">
      <td colSpan={7} className="relative h-0 p-0">
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
 * memoria: encabezado con clave/descripción/unidad + selector de región, dos
 * tablas formales (mano de obra, herramienta) con su subtotal, y el costo
 * total como un renglón final destacado. La receta (integrantes/herramienta,
 * `cuadrilla_detalle`) es la misma en todas las regiones; los montos que se
 * ven (cantidad/costo/importe/subtotales) son los de la **valuación
 * seleccionada** (`cuadrilla_costo`) — agregar/quitar/mover renglones solo
 * está disponible en Nacional, que es donde nace la cantidad inicial de un
 * renglón nuevo (ver diccionario de datos). Enfoque alterno a
 * `CuadrillaDetallePanel` (grid): mismos comandos de Tauri por debajo.
 *
 * Agregar/editar/eliminar la cuadrilla en sí (no su composición) vive en la
 * barra de acciones de `CuadrillasFicha`, junto al buscador — este
 * componente solo la muestra y administra su composición/valuaciones.
 */
export function CuadrillaFichaApu({
  cuadrilla,
  onCambio,
}: {
  cuadrilla: Cuadrilla;
  onCambio: () => void;
}) {
  const [detalles, setDetalles] = useState<CuadrillaDetalle[]>([]);
  const [costos, setCostos] = useState<CuadrillaCosto[]>([]);
  const [costoSeleccionadoId, setCostoSeleccionadoId] = useState<string | null>(null);
  const [costoDetalles, setCostoDetalles] = useState<CuadrillaCostoDetalle[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregandoIntegrante, setAgregandoIntegrante] = useState(false);
  const [agregandoHerramienta, setAgregandoHerramienta] = useState(false);
  const [creandoRegion, setCreandoRegion] = useState(false);
  const [confirmandoEliminarValuacion, setConfirmandoEliminarValuacion] = useState(false);
  const [pendingQuitar, setPendingQuitar] = useState<CuadrillaDetalle | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [mostrarFechaPrecio, setMostrarFechaPrecio] = useState(false);
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
  }, []);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    setAgregandoIntegrante(false);
    setAgregandoHerramienta(false);
    setCreandoRegion(false);
    setDestello(null);
  }, [cuadrilla.id]);

  useEffect(() => {
    setDestello(null);
  }, [costoSeleccionadoId]);

  useEffect(() => {
    if (!destello) return;
    const t = window.setTimeout(() => setDestello(null), 5000);
    return () => window.clearTimeout(t);
  }, [destello]);

  const cargarDetalles = (id: string) =>
    listCuadrillaDetalles(id)
      .then(setDetalles)
      .catch((e) => setError(String(e)));

  const cargarCostos = (id: string) =>
    listCuadrillaCostos(id)
      .then((r) => {
        setCostos(r);
        return r;
      })
      .catch((e) => {
        setError(String(e));
        return [] as CuadrillaCosto[];
      });

  useEffect(() => {
    setCargando(true);
    setError(null);
    setCostoSeleccionadoId(null);
    Promise.all([listCuadrillaDetalles(cuadrilla.id), listCuadrillaCostos(cuadrilla.id)])
      .then(([detallesR, costosR]) => {
        setDetalles(detallesR);
        setCostos(costosR);
        setCostoSeleccionadoId(costosR.find((c) => c.region_id === null)?.id ?? costosR[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuadrilla.id]);

  useEffect(() => {
    if (!costoSeleccionadoId) {
      setCostoDetalles([]);
      return;
    }
    listCuadrillaCostoDetalles(costoSeleccionadoId)
      .then(setCostoDetalles)
      .catch((e) => setError(String(e)));
  }, [costoSeleccionadoId]);

  const trasMutarReceta = async () => {
    onCambio();
    await cargarDetalles(cuadrilla.id);
    await cargarCostos(cuadrilla.id);
    if (costoSeleccionadoId) await listCuadrillaCostoDetalles(costoSeleccionadoId).then(setCostoDetalles).catch(() => {});
  };

  const trasMutarCantidad = async () => {
    onCambio();
    await cargarCostos(cuadrilla.id);
    if (!costoSeleccionadoId) {
      setCostoDetalles([]);
      return [] as CuadrillaCostoDetalle[];
    }
    try {
      const r = await listCuadrillaCostoDetalles(costoSeleccionadoId);
      setCostoDetalles(r);
      return r;
    } catch (e) {
      setError(String(e));
      return [] as CuadrillaCostoDetalle[];
    }
  };

  const recalcular = async () => {
    if (!costoSeleccionadoId) return;
    setRecalculando(true);
    setError(null);
    try {
      await recalculateCuadrillaCosto(costoSeleccionadoId);
      await trasMutarCantidad();
    } catch (e) {
      setError(String(e));
    } finally {
      setRecalculando(false);
    }
  };

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);
  const costoSeleccionado = costos.find((c) => c.id === costoSeleccionadoId) ?? null;
  const esNacional = costoSeleccionado ? costoSeleccionado.region_id === null : true;
  const regionesSinValuacion = useMemo(
    () => regiones.filter((r) => !costos.some((c) => c.region_id === r.id)),
    [regiones, costos],
  );

  const crearValuacionRegional = async (regionId: string) => {
    setCreandoRegion(false);
    if (!regionId) return;
    setError(null);
    try {
      const creada = await createCuadrillaCostoRegional(cuadrilla.id, regionId);
      await cargarCostos(cuadrilla.id);
      setCostoSeleccionadoId(creada.id);
    } catch (e) {
      setError(String(e));
    }
  };

  const confirmarEliminarValuacionRegional = async () => {
    setConfirmandoEliminarValuacion(false);
    if (!costoSeleccionado || costoSeleccionado.region_id === null) return;
    setError(null);
    try {
      await deleteCuadrillaCosto(costoSeleccionado.id);
      const restantes = await cargarCostos(cuadrilla.id);
      setCostoSeleccionadoId(restantes.find((c) => c.region_id === null)?.id ?? null);
    } catch (e) {
      setError(String(e));
    }
  };

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

  const agregarIntegrante = async (id: string) => {
    setAgregandoIntegrante(false);
    if (!id) return;
    setError(null);
    try {
      await createCuadrillaDetalle(cuadrilla.id, { detalle_insumo_id: id, cantidad_nacional: "1" });
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
        cantidad_nacional: String(herramienta?.porcentaje_mano_obra ?? 0),
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
    if (redondeada === Number(cd.cantidad)) return;
    setError(null);
    try {
      const totalAntes = Number(costoSeleccionado?.costo_total) || 0;
      const importeAntes = Number(cd.importe) || 0;
      const actualizado = await updateCuadrillaCostoDetalle(cd.id, { cantidad: String(redondeada) });
      const nuevos = await trasMutarCantidad();
      const importeDespues = Number(nuevos.find((n) => n.id === cd.id)?.importe) || 0;
      const deltaTotal = centavos(Number(actualizado.costo_total) - totalAntes);
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

  const dragIntegrantes = useFilaDrag({
    ids: integrantes.map((d) => d.id),
    enabled: esNacional,
    onMove: (id, dest) => void reordenar(integrantes, id, dest),
  });
  const dragHerramienta = useFilaDrag({
    ids: herramientaDetalles.map((d) => d.id),
    enabled: esNacional,
    onMove: (id, dest) => void reordenar(herramientaDetalles, id, dest),
  });

  const nombreDetalle = (detalle: CuadrillaDetalle) =>
    detalle.tipo === "categoria_fasar"
      ? (opcionPorCategoriaId[detalle.detalle_insumo_id] ?? detalle.detalle_insumo_id)
      : (opcionPorHerramientaId[detalle.detalle_insumo_id] ?? detalle.detalle_insumo_id);

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
            <div className="barra-progreso-indeterminada h-full w-1/3 rounded-full bg-primary" />
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
            </span>
          </div>
          <p className="mt-0.5 text-xs text-foreground">{cuadrilla.descripcion}</p>

          <Separator className="my-2" />

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
                esNacional ? "bg-primary/10 text-primary" : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
              )}
              title={esNacional ? "Valuación nacional" : "Valuación regional"}
            >
              {esNacional ? <Globe2 size={16} /> : <MapPinned size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-h-6 items-center gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Zona de precios
                </p>
                {!esNacional && (
                  <button
                    type="button"
                    title="Eliminar valuación regional"
                    onClick={() => setConfirmandoEliminarValuacion(true)}
                    className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                {!creandoRegion ? (
                  regionesSinValuacion.length > 0 && (
                    <button
                      type="button"
                      title="Crear valuación regional"
                      onClick={() => setCreandoRegion(true)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus size={16} />
                    </button>
                  )
                ) : (
                  <ComboboxFiltrable
                    opciones={ordenarPor(regionesSinValuacion, (r) => r.nombre).map((r) => ({ id: r.id, etiqueta: r.nombre }))}
                    placeholder="Buscar región…"
                    onElegir={(id) => void crearValuacionRegional(id)}
                    onCancelar={() => setCreandoRegion(false)}
                    className="w-40"
                  />
                )}
              </div>
              <Select value={costoSeleccionadoId ?? ""} onValueChange={(v) => setCostoSeleccionadoId(v || null)}>
                <SelectTrigger
                  size="sm"
                  className="h-7 w-full max-w-[260px] border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {costos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1.5">
                        {c.region_id ? <MapPinned size={16} /> : <Globe2 size={16} />}
                        {c.region_id ? (nombrePorRegionId[c.region_id] ?? c.region_id) : NACIONAL}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                title={
                  recalculando
                    ? "Recalculando costos…"
                    : [
                        "Recalcular costos de esta zona de precios con los salarios y la herramienta vigentes.",
                        costoSeleccionado?.sincronizado_en
                          ? `Última sincronización: ${formatearFecha(costoSeleccionado.sincronizado_en)}`
                          : "Aún no se ha sincronizado con los insumos vigentes.",
                      ].join("\n")
                }
                onClick={() => void recalcular()}
                disabled={recalculando}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted",
                  recalculando && "opacity-50",
                )}
              >
                <RefreshCcw size={16} className={cn(recalculando && "animate-spin")} />
                {recalculando ? "Sincronizando…" : "Sincronizar"}
              </button>
              {costoSeleccionado?.sincronizado_en ? (
                <span className="max-w-[8.5rem] text-right text-[9px] leading-tight text-muted-foreground tabular-nums">
                  {formatearFecha(costoSeleccionado.sincronizado_en)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={16} className="shrink-0" />
                  Sin sincronizar
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-foreground/30 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
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
                <th className="w-14" />
              </tr>
            </thead>

            {/* MANO DE OBRA */}
            <tbody>
              <tr>
                <td colSpan={7} className="pt-2 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <HardHat size={16} className="text-blue-500" />
                    Mano de obra
                  </span>
                </td>
              </tr>
              {integrantes.length === 0 && !agregandoIntegrante && (
                <tr>
                  <td colSpan={7} className="py-1.5 text-muted-foreground">
                    Sin integrantes todavía.
                  </td>
                </tr>
              )}
              {integrantes.map((d, i) => {
                const cd = costoDetallePorDetalleId[d.id];
                return (
                  <Fragment key={d.id}>
                    {dragIntegrantes.hueco === i && <MarcadorInsercion />}
                    <tr
                      className={cn("border-b border-border/50 hover:bg-muted/30", dragIntegrantes.filaClass(d.id))}
                      {...dragIntegrantes.filaProps(d.id)}
                    >
                    <td className="py-1 pr-2 font-mono text-muted-foreground">
                      {categoriaPorId[d.detalle_insumo_id]?.clave ?? d.detalle_insumo_id}
                    </td>
                    <td className="py-1 pr-2">{categoriaPorId[d.detalle_insumo_id]?.descripcion ?? ""}</td>
                    <td className="py-1 pr-2 text-muted-foreground">
                      {simboloPorUnidadId[categoriaPorId[d.detalle_insumo_id]?.unidad_id ?? ""] ?? ""}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <QuantityInput
                        value={cd?.cantidad ?? "0"}
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
                            esNacional
                              ? categoriaPorId[d.detalle_insumo_id]?.salario_vigente?.fecha_vigencia_desde
                              : null
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
                      {esNacional && (
                        <div className="flex items-center justify-end gap-0.5">
                          <span
                            title="Arrastra para reordenar"
                            className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                            {...dragIntegrantes.handleProps(d.id)}
                          >
                            <GripVertical size={16} />
                          </span>
                          <Separator orientation="vertical" />
                          <button
                            type="button"
                            title="Quitar"
                            onClick={() => setPendingQuitar(d)}
                            className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {dragIntegrantes.hueco === integrantes.length && i === integrantes.length - 1 && (
                    <MarcadorInsercion />
                  )}
                  </Fragment>
                );
              })}
              {esNacional && (
                <tr>
                  <td colSpan={7} className="pt-1.5">
                    {agregandoIntegrante ? (
                      <ComboboxFiltrable
                        opciones={categoriasDisponibles.map((c) => ({
                          id: c.id,
                          etiqueta: `${c.clave} — ${c.descripcion}`,
                        }))}
                        onElegir={(id) => void agregarIntegrante(id)}
                        onCancelar={() => setAgregandoIntegrante(false)}
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
              )}
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={5} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal mano de obra
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(costoSeleccionado?.sub_total_mano_obra ?? "0")}</td>
                <td />
              </tr>
            </tbody>

            {/* HERRAMIENTA */}
            <tbody>
              <tr>
                <td colSpan={7} className="pt-3 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Wrench size={16} className="text-amber-500" />
                    Herramienta
                  </span>
                </td>
              </tr>
              {herramientaDetalles.length === 0 && !agregandoHerramienta && (
                <tr>
                  <td colSpan={7} className="py-1.5 text-muted-foreground">
                    Sin herramienta todavía.
                  </td>
                </tr>
              )}
              {herramientaDetalles.map((d, i) => {
                const cd = costoDetallePorDetalleId[d.id];
                return (
                  <Fragment key={d.id}>
                    {dragHerramienta.hueco === i && <MarcadorInsercion />}
                    <tr
                      className={cn("border-b border-border/50 hover:bg-muted/30", dragHerramienta.filaClass(d.id))}
                      {...dragHerramienta.filaProps(d.id)}
                    >
                    <td className="py-1 pr-2 font-mono text-muted-foreground">
                      {herramientaPorId[d.detalle_insumo_id]?.clave ?? d.detalle_insumo_id}
                    </td>
                    <td className="py-1 pr-2">{herramientaPorId[d.detalle_insumo_id]?.descripcion ?? ""}</td>
                    <td className="py-1 pr-2 text-muted-foreground">
                      {simboloPorUnidadId[herramientaPorId[d.detalle_insumo_id]?.unidad_id ?? ""] ?? ""}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <PercentageInput
                        value={cd?.cantidad ?? "0"}
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
                      {esNacional && (
                        <div className="flex items-center justify-end gap-0.5">
                          <span
                            title="Arrastra para reordenar"
                            className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                            {...dragHerramienta.handleProps(d.id)}
                          >
                            <GripVertical size={16} />
                          </span>
                          <Separator orientation="vertical" />
                          <button
                            type="button"
                            title="Quitar"
                            onClick={() => setPendingQuitar(d)}
                            className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {dragHerramienta.hueco === herramientaDetalles.length &&
                    i === herramientaDetalles.length - 1 && <MarcadorInsercion />}
                  </Fragment>
                );
              })}
              {esNacional && (
                <tr>
                  <td colSpan={7} className="pt-1.5">
                    {agregandoHerramienta ? (
                      <ComboboxFiltrable
                        opciones={herramientasDisponibles.map((h) => ({
                          id: h.id,
                          etiqueta: `${h.clave} — ${h.descripcion}${
                            h.porcentaje_mano_obra !== null ? ` (${h.porcentaje_mano_obra}%)` : ""
                          }`,
                        }))}
                        onElegir={(id) => void agregarHerramienta(id)}
                        onCancelar={() => setAgregandoHerramienta(false)}
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
              )}
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={5} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
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

      {!esNacional && (
        <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
          Agregar, quitar o mover integrantes solo está disponible en Nacional — aquí solo se edita la cantidad.
        </p>
      )}

      <AlertDialog open={confirmandoEliminarValuacion} onOpenChange={setConfirmandoEliminarValuacion}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta valuación regional?</AlertDialogTitle>
            <AlertDialogDescription>
              {costoSeleccionado?.region_id &&
                `Se eliminará la valuación de "${nombrePorRegionId[costoSeleccionado.region_id] ?? costoSeleccionado.region_id}". Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => void confirmarEliminarValuacionRegional()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
