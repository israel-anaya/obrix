import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  Plus,
  RefreshCcw,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { QuantityInput } from "@/components/QuantityInput";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createBasicoAuxiliarComponente,
  deleteBasicoAuxiliarComponente,
  listBasicoAuxiliarComponentes,
  listBasicoAuxiliarCostoDetalles,
  listBasicoAuxiliarCostos,
  listBasicosAuxiliares,
  listCategoriasFasar,
  listCuadrillas,
  listEquiposCostoHorario,
  listMateriales,
  listRegiones,
  moveBasicoAuxiliarComponente,
  recalculateBasicoAuxiliarZonas,
  updateBasicoAuxiliarCostoDetalleCantidad,
  updateBasicoAuxiliarCostoDetalleRendimiento,
} from "@/lib/tauri";
import { useRowDrag, type RowLabel } from "@/hooks/useRowDrag";
import { ordenarPor } from "@/lib/ordenar";
import { formatearFecha, diasTranscurridos } from "@/lib/fecha";
import type {
  BasicoAuxiliar,
  BasicoAuxiliarComponente,
  BasicoAuxiliarCosto,
  BasicoAuxiliarCostoDetalle,
  CategoriaFasar,
  Cuadrilla,
  DireccionMovimiento,
  EquipoCostoHorario,
  Material,
  Region,
  TipoBasicoAuxiliarComponente,
  UnidadMedida,
} from "@/lib/types";
import { regionesVisibles } from "@/lib/types";
import { cn } from "@/lib/utils";
import { listUnidadesMedida } from "@/lib/tauri";
import { APP_ICONS } from "@/lib/appIcons";

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

/** Hasta 30 días: vigente. Más de 30: ámbar. Más de 90, o el precio ya no coincide: crítico. */
const DIAS_PRECIO_FRESCO = 30;
const DIAS_PRECIO_CRITICO = 90;

function FechaPrecioFrescura({ fecha }: { fecha: string }) {
  const dias = diasTranscurridos(fecha);
  const nivel = dias != null && dias > DIAS_PRECIO_CRITICO
    ? "critica"
    : dias != null && dias > DIAS_PRECIO_FRESCO
      ? "desactualizada"
      : "vigente";
  const titulo =
    nivel === "critica"
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
      <td colSpan={9} className="relative h-0 p-0">
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

interface FilaGrupo {
  id: string;
  clave: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  rendimiento: string;
  costo: string;
  importe: string;
  fechaPrecio: string | null;
}

/** Una de las cuatro secciones de la receta (material/mano de obra/equipo/básico auxiliar). */
function GrupoTabla({
  titulo,
  Icono,
  color,
  filas,
  agregando,
  onCerrarAgregar,
  opciones,
  onAgregar,
  onQuitar,
  onCommitCantidad,
  onCommitRendimiento,
  mostrarFechaPrecio,
  destello,
  drag,
  colapsado,
  onToggleColapsado,
  subtotal,
}: {
  titulo: string;
  Icono: LucideIcon;
  color: string;
  filas: FilaGrupo[];
  agregando: boolean;
  onCerrarAgregar: () => void;
  opciones: { id: string; label: string }[];
  onAgregar: (id: string) => void;
  onQuitar: (fila: FilaGrupo) => void;
  onCommitCantidad: (id: string, valor: string) => void;
  onCommitRendimiento: (id: string, valor: string) => void;
  mostrarFechaPrecio: boolean;
  destello: { ticket: number; total: number; filaId: string; fila: number } | null;
  drag: ReturnType<typeof useRowDrag>;
  colapsado: boolean;
  onToggleColapsado: () => void;
  subtotal: string;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={9} className="pt-3 pb-1 first:pt-2">
          <button
            type="button"
            onClick={onToggleColapsado}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            {colapsado ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
            <Icono size={16} className={color} />
            {titulo}
            {colapsado && filas.length > 0 && (
              <span className="normal-case tracking-normal text-muted-foreground/70">({filas.length})</span>
            )}
          </button>
        </td>
      </tr>
      {colapsado ? null : (
        <>
      {filas.length === 0 && !agregando && (
        <tr>
          <td colSpan={9} className="py-1.5 text-muted-foreground">
            Sin renglones todavía.
          </td>
        </tr>
      )}
      {filas.map((f, i) => (
        <Fragment key={f.id}>
          {drag.gap === i && <MarcadorInsercion />}
          <tr className={cn("group border-b border-border/50 hover:bg-muted/30", drag.rowClass(f.id))} {...drag.rowProps(f.id)}>
            <td className="py-1 pr-1">
              <span
                title="Arrastra para reordenar"
                className="inline-flex cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                {...drag.handleProps(f.id)}
              >
                <GripVertical size={16} />
              </span>
            </td>
            <td className="py-1 pr-2 font-mono text-muted-foreground">{f.clave}</td>
            <td className="py-1 px-2">{f.descripcion}</td>
            <td className="py-1 px-2 text-left text-muted-foreground">{f.unidad}</td>
            <td className="py-1 pr-2 text-right">
              <QuantityInput
                value={f.rendimiento}
                onCommit={(v) => onCommitRendimiento(f.id, v)}
                decimals={6}
                className="w-24 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
              />
            </td>
            <td className="py-1 pr-2 text-right">
              <QuantityInput
                value={f.cantidad}
                onCommit={(v) => onCommitCantidad(f.id, v)}
                decimals={6}
                className="w-24 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
              />
            </td>
            <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
              <div>${fmt(f.costo)}</div>
              {mostrarFechaPrecio && f.fechaPrecio ? <FechaPrecioFrescura fecha={f.fechaPrecio} /> : null}
            </td>
            <td
              className={cn(
                "w-28 py-1 pr-2 text-right font-medium tabular-nums transition-colors duration-700",
                destello?.filaId === f.id && destello.fila > 0 && "bg-emerald-500/20",
                destello?.filaId === f.id && destello.fila < 0 && "bg-rose-500/20",
              )}
            >
              <span className="inline-flex items-baseline justify-end gap-1">
                {destello?.filaId === f.id && <ChipDelta key={destello.ticket} valor={destello.fila} className="text-[10px]" />}
                ${fmt(f.importe)}
              </span>
            </td>
            <td className="py-1 text-right">
              <button
                type="button"
                title="Quitar"
                onClick={() => onQuitar(f)}
                className="rounded p-0.5 text-destructive opacity-0 pointer-events-none transition-opacity hover:bg-destructive/10 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
              >
                <X size={16} />
              </button>
            </td>
          </tr>
          {drag.gap === filas.length && i === filas.length - 1 && <MarcadorInsercion />}
        </Fragment>
      ))}
      {agregando && (
        <tr>
          <td colSpan={9} className="pt-1.5">
            <FilterableCombobox
              options={opciones}
              onSelect={(id) => {
                onCerrarAgregar();
                if (id) onAgregar(id);
              }}
              onCancel={onCerrarAgregar}
            />
          </td>
        </tr>
      )}
        </>
      )}
      {filas.length > 0 && (
        <tr className="border-t-2 border-foreground/20">
          <td colSpan={7} className="py-1.5 pr-3 text-right">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Subtotal {titulo.toLowerCase()}
            </span>
          </td>
          <td className="w-28 py-1.5 pr-2 text-right font-semibold tabular-nums">${fmt(subtotal)}</td>
          <td />
        </tr>
      )}
    </tbody>
  );
}

/**
 * "Ficha" de un básico auxiliar — reproduce la tarjeta de análisis de precio
 * unitario (APU): encabezado con clave/descripción/unidad, cuatro tablas
 * formales según el tipo del componente (material, mano de obra, equipo y
 * herramienta, otros básicos auxiliares) con su subtotal, y el costo total
 * como un renglón final destacado. La receta (`basico_auxiliar_componente`)
 * es la misma en todas las regiones; la cantidad de cada renglón sí puede
 * variar por zona (vive en `basico_auxiliar_costo_detalle`) — al capturarla
 * aquí solo se cambia el rendimiento de la región elegida en Costo por
 * región (Nacional al abrir).
 */
export function BasicoAuxiliarFichaApu({
  auxiliar,
  onCambio,
}: {
  auxiliar: BasicoAuxiliar;
  onCambio: () => void;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const [componentes, setComponentes] = useState<BasicoAuxiliarComponente[]>([]);
  const [costos, setCostos] = useState<BasicoAuxiliarCosto[]>([]);
  const [costoSeleccionadoId, setCostoSeleccionadoId] = useState<string | null>(null);
  const [costoDetalles, setCostoDetalles] = useState<BasicoAuxiliarCostoDetalle[]>([]);
  const [costoDetallesPorCostoId, setCostoDetallesPorCostoId] = useState<Record<string, BasicoAuxiliarCostoDetalle[]>>({});
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [equipos, setEquipos] = useState<EquipoCostoHorario[]>([]);
  const [auxiliaresTodos, setAuxiliaresTodos] = useState<BasicoAuxiliar[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregandoTipo, setAgregandoTipo] = useState<TipoBasicoAuxiliarComponente | null>(null);
  const [pendingQuitar, setPendingQuitar] = useState<BasicoAuxiliarComponente | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [mostrarFechaPrecio, setMostrarFechaPrecio] = useState(false);
  /** `null` = Nacional. No se persiste: solo elige qué cache ve el análisis. */
  const [regionVistaId, setRegionVistaId] = useState<string | null>(null);
  const [destello, setDestello] = useState<{ ticket: number; total: number; filaId: string; fila: number } | null>(null);
  const [gruposColapsados, setGruposColapsados] = useState<Set<TipoBasicoAuxiliarComponente>>(new Set());
  const [costoRegionExpandido, setCostoRegionExpandido] = useState(false);

  useEffect(() => {
    listMateriales().then(setMateriales).catch(() => {});
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listCuadrillas().then(setCuadrillas).catch(() => {});
    listEquiposCostoHorario().then(setEquipos).catch(() => {});
    listBasicosAuxiliares().then(setAuxiliaresTodos).catch(() => {});
    listRegiones().then(setRegiones).catch(() => {});
    listUnidadesMedida().then(setUnidades).catch(() => {});
  }, [organizacionActivaId]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    setAgregandoTipo(null);
    setDestello(null);
  }, [auxiliar.id]);

  useEffect(() => {
    if (!destello) return;
    const t = window.setTimeout(() => setDestello(null), 5000);
    return () => window.clearTimeout(t);
  }, [destello]);

  const aplicarCostos = async (costosR: BasicoAuxiliarCosto[], vistaId: string | null) => {
    setCostos(costosR);
    const pares = await Promise.all(
      costosR.map(async (c) => {
        const dets = await listBasicoAuxiliarCostoDetalles(c.id).catch(() => [] as BasicoAuxiliarCostoDetalle[]);
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
    listBasicoAuxiliarCostos(id)
      .then((costosR) => aplicarCostos(costosR, vistaId))
      .catch((e) => {
        setError(String(e));
        setCostos([]);
        setCostoDetalles([]);
        setCostoDetallesPorCostoId({});
        return { costosR: [] as BasicoAuxiliarCosto[], seleccionadoId: null as string | null, porCosto: {} as Record<string, BasicoAuxiliarCostoDetalle[]> };
      });

  useEffect(() => {
    setCargando(true);
    setError(null);
    setCostoSeleccionadoId(null);
    setRegionVistaId(null);
    Promise.all([listBasicoAuxiliarComponentes(auxiliar.id), listBasicoAuxiliarCostos(auxiliar.id)])
      .then(async ([componentesR, costosR]) => {
        setComponentes(componentesR);
        const tiposConFilas = new Set(componentesR.map((c) => c.tipo));
        const todosLosTipos: TipoBasicoAuxiliarComponente[] = ["material", "mano_obra", "equipo_herramienta", "basico_auxiliar"];
        setGruposColapsados(new Set(todosLosTipos.filter((t) => !tiposConFilas.has(t))));
        await aplicarCostos(costosR, null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auxiliar.id]);

  const trasMutarReceta = async () => {
    onCambio();
    await listBasicoAuxiliarComponentes(auxiliar.id).then(setComponentes).catch((e) => setError(String(e)));
    await cargarCostos(auxiliar.id);
  };

  const recalcularZonas = async () => {
    setRecalculando(true);
    setError(null);
    try {
      await recalculateBasicoAuxiliarZonas(auxiliar.id);
      onCambio();
      await cargarCostos(auxiliar.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setRecalculando(false);
    }
  };

  const costoSeleccionado = costos.find((c) => c.id === costoSeleccionadoId) ?? null;
  const costoTotalNum = Number(costoSeleccionado?.costo_total) || 0;
  const pctDe = (v?: string) => (costoTotalNum > 0 ? ((Number(v) || 0) / costoTotalNum) * 100 : 0);
  const pctMaterial = pctDe(costoSeleccionado?.sub_total_material);
  const pctManoObra = pctDe(costoSeleccionado?.sub_total_mano_obra);
  const pctEquipo = pctDe(costoSeleccionado?.sub_total_equipo);
  const pctAuxiliar = pctDe(costoSeleccionado?.sub_total_basico_auxiliar);

  const simboloUnidad = useMemo(
    () => unidades.find((u) => u.id === auxiliar.unidad_id)?.simbolo ?? auxiliar.unidad_id,
    [unidades, auxiliar.unidad_id],
  );
  const simboloPorUnidadId = useMemo(() => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])), [unidades]);

  const infoPorId = useMemo(() => {
    const mapa: Record<string, { clave: string; descripcion: string; unidad_id: string }> = {};
    for (const m of materiales) mapa[m.id] = m;
    for (const c of categorias) mapa[c.id] = c;
    for (const c of cuadrillas) mapa[c.id] = c;
    for (const e of equipos) mapa[e.id] = e;
    for (const a of auxiliaresTodos) mapa[a.id] = a;
    return mapa;
  }, [materiales, categorias, cuadrillas, equipos, auxiliaresTodos]);

  const idsUsados = useMemo(() => {
    const set = new Set(componentes.map((c) => c.componente_insumo_id));
    set.add(auxiliar.id);
    return set;
  }, [componentes, auxiliar.id]);

  const opciones = (lista: { id: string; clave: string; descripcion: string }[]) =>
    ordenarPor(
      lista.filter((x) => !idsUsados.has(x.id)),
      (x) => x.clave,
    ).map((x) => ({ id: x.id, label: `${x.clave} — ${x.descripcion}` }));

  const opcionesMaterial = useMemo(() => opciones(materiales), [materiales, idsUsados]);
  const opcionesManoObra = useMemo(
    () =>
      ordenarPor(
        cuadrillas.filter((c) => !idsUsados.has(c.id)),
        (c) => c.clave,
      ).map((c) => ({ id: c.id, label: `${c.clave} — ${c.descripcion}` })),
    [cuadrillas, idsUsados],
  );
  const opcionesEquipo = useMemo(() => opciones(equipos), [equipos, idsUsados]);
  const opcionesAuxiliar = useMemo(
    () => opciones(auxiliaresTodos.filter((a) => a.id !== auxiliar.id)),
    [auxiliaresTodos, auxiliar.id, idsUsados],
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
    return [{ key: "nacional", regionId: null as string | null, nombre: NACIONAL, costo: nacional, esNac: true }, ...regionales];
  }, [costos, regiones]);

  const coberturaPorCostoId = useMemo(() => {
    return Object.fromEntries(
      Object.entries(costoDetallesPorCostoId).map(([costoId, dets]) => {
        const sin = dets.filter((d) => !d.fecha_precio).length;
        return [costoId, { total: componentes.length, sin }];
      }),
    );
  }, [costoDetallesPorCostoId, componentes]);

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

  const agregarComponente = async (id: string) => {
    setError(null);
    try {
      await createBasicoAuxiliarComponente(auxiliar.id, { componente_insumo_id: id, cantidad: "1" });
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  const costoDetallePorComponenteId = useMemo(
    () => Object.fromEntries(costoDetalles.map((cd) => [cd.basico_auxiliar_componente_id, cd])),
    [costoDetalles],
  );

  /** Tras guardar `cantidad` o `rendimiento` (inversos, ver el modelo de
   * datos) — mismo remoto que devuelve el `basico_auxiliar_costo`
   * recalculado, mismo refresco de estado y mismo destello de delta. */
  const aplicarActualizacionDetalle = async (
    componenteId: string,
    cdAntes: BasicoAuxiliarCostoDetalle,
    costoActualizado: BasicoAuxiliarCosto,
  ) => {
    const totalAntes = Number(costoSeleccionado?.costo_total) || 0;
    const importeAntes = Number(cdAntes.importe) || 0;
    const nuevosDetalles = await listBasicoAuxiliarCostoDetalles(costoActualizado.id);
    setCostos((prev) => prev.map((c) => (c.id === costoActualizado.id ? costoActualizado : c)));
    setCostoDetalles(nuevosDetalles);
    setCostoDetallesPorCostoId((prev) => ({ ...prev, [costoActualizado.id]: nuevosDetalles }));
    onCambio();
    const importeDespues =
      Number(nuevosDetalles.find((d) => d.basico_auxiliar_componente_id === componenteId)?.importe) || 0;
    const deltaTotal = centavos(Number(costoActualizado.costo_total) - totalAntes);
    const deltaFila = centavos(importeDespues - importeAntes);
    if (deltaTotal !== 0 || deltaFila !== 0) {
      setDestello({ ticket: Date.now(), total: deltaTotal, filaId: componenteId, fila: deltaFila });
    }
  };

  const guardarCantidad = async (componenteId: string, valorTexto: string) => {
    if (valorTexto.trim() === "") return;
    const numero = Number(valorTexto);
    if (!Number.isFinite(numero) || numero < 0) {
      setError("La cantidad debe ser un número mayor o igual a 0.");
      return;
    }
    const cd = costoDetallePorComponenteId[componenteId];
    if (!cd) return;
    const redondeada = Number(numero.toFixed(6));
    if (redondeada === Number(cd.cantidad)) return;
    setError(null);
    try {
      const costoActualizado = await updateBasicoAuxiliarCostoDetalleCantidad(cd.id, String(redondeada));
      await aplicarActualizacionDetalle(componenteId, cd, costoActualizado);
    } catch (e) {
      setError(String(e));
    }
  };

  const guardarRendimiento = async (componenteId: string, valorTexto: string) => {
    if (valorTexto.trim() === "") return;
    const numero = Number(valorTexto);
    if (!Number.isFinite(numero) || numero < 0) {
      setError("El rendimiento debe ser un número mayor o igual a 0.");
      return;
    }
    const cd = costoDetallePorComponenteId[componenteId];
    if (!cd) return;
    const redondeada = Number(numero.toFixed(6));
    if (redondeada === Number(cd.rendimiento)) return;
    setError(null);
    try {
      const costoActualizado = await updateBasicoAuxiliarCostoDetalleRendimiento(cd.id, String(redondeada));
      await aplicarActualizacionDetalle(componenteId, cd, costoActualizado);
    } catch (e) {
      setError(String(e));
    }
  };

  const reordenar = async (filas: BasicoAuxiliarComponente[], id: string, indiceDestino: number) => {
    const fromIndex = filas.findIndex((c) => c.id === id);
    if (fromIndex < 0 || fromIndex === indiceDestino) return;
    const direccion: DireccionMovimiento = indiceDestino < fromIndex ? "arriba" : "abajo";
    const pasos = Math.abs(indiceDestino - fromIndex);
    setError(null);
    try {
      for (let i = 0; i < pasos; i++) {
        await moveBasicoAuxiliarComponente(id, direccion);
      }
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  const nombreComponente = (c: BasicoAuxiliarComponente) => {
    const info = infoPorId[c.componente_insumo_id];
    return info ? `${info.clave} — ${info.descripcion}` : c.componente_insumo_id;
  };

  const aFila = (c: BasicoAuxiliarComponente): FilaGrupo => {
    const info = infoPorId[c.componente_insumo_id];
    const cd = costoDetallePorComponenteId[c.id];
    return {
      id: c.id,
      clave: info?.clave ?? c.componente_insumo_id,
      descripcion: info?.descripcion ?? "",
      unidad: simboloPorUnidadId[info?.unidad_id ?? ""] ?? "",
      cantidad: cd?.cantidad ?? "0",
      rendimiento: cd?.rendimiento ?? "0",
      costo: cd?.costo ?? "0",
      importe: cd?.importe ?? "0",
      fechaPrecio: cd?.fecha_precio ?? null,
    };
  };

  const etiquetaFila = (lista: BasicoAuxiliarComponente[], id: string): RowLabel | null => {
    const c = lista.find((x) => x.id === id);
    if (!c) return null;
    const fila = aFila(c);
    return { title: `${fila.clave} — ${fila.descripcion}`, quantity: fmtCantidad(fila.cantidad), unit: fila.unidad, cost: fila.costo !== "0" ? `$${fmt(fila.costo)}` : undefined };
  };

  const gruposDef: { tipo: TipoBasicoAuxiliarComponente; titulo: string; Icono: LucideIcon; color: string; opciones: { id: string; label: string }[]; subtotal: string }[] = [
    { tipo: "material", titulo: APP_ICONS.grupo_material.titulo, Icono: APP_ICONS.grupo_material.icono, color: APP_ICONS.grupo_material.color, opciones: opcionesMaterial, subtotal: costoSeleccionado?.sub_total_material ?? "0" },
    { tipo: "mano_obra", titulo: APP_ICONS.grupo_mano_obra.titulo, Icono: APP_ICONS.grupo_mano_obra.icono, color: APP_ICONS.grupo_mano_obra.color, opciones: opcionesManoObra, subtotal: costoSeleccionado?.sub_total_mano_obra ?? "0" },
    { tipo: "equipo_herramienta", titulo: APP_ICONS.grupo_equipo_herramienta.titulo, Icono: APP_ICONS.grupo_equipo_herramienta.icono, color: APP_ICONS.grupo_equipo_herramienta.color, opciones: opcionesEquipo, subtotal: costoSeleccionado?.sub_total_equipo ?? "0" },
    { tipo: "basico_auxiliar", titulo: APP_ICONS.grupo_basico_auxiliar.titulo, Icono: APP_ICONS.grupo_basico_auxiliar.icono, color: APP_ICONS.grupo_basico_auxiliar.color, opciones: opcionesAuxiliar, subtotal: costoSeleccionado?.sub_total_basico_auxiliar ?? "0" },
  ];

  const componentesPorTipo = useMemo(() => {
    const mapa: Record<TipoBasicoAuxiliarComponente, BasicoAuxiliarComponente[]> = {
      material: [],
      mano_obra: [],
      equipo_herramienta: [],
      basico_auxiliar: [],
    };
    for (const c of componentes) mapa[c.tipo].push(c);
    for (const tipo of Object.keys(mapa) as TipoBasicoAuxiliarComponente[]) {
      mapa[tipo].sort((a, b) => a.orden - b.orden);
    }
    return mapa;
  }, [componentes]);

  // Un `useRowDrag` por grupo — número fijo de grupos, así que llamarlos
  // incondicionalmente en el mismo orden en cada render no rompe las reglas
  // de hooks.
  const dragMaterial = useRowDrag({
    ids: componentesPorTipo.material.map((c) => c.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(componentesPorTipo.material, id, dest),
    label: (id) => etiquetaFila(componentesPorTipo.material, id),
  });
  const dragManoObra = useRowDrag({
    ids: componentesPorTipo.mano_obra.map((c) => c.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(componentesPorTipo.mano_obra, id, dest),
    label: (id) => etiquetaFila(componentesPorTipo.mano_obra, id),
  });
  const dragEquipo = useRowDrag({
    ids: componentesPorTipo.equipo_herramienta.map((c) => c.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(componentesPorTipo.equipo_herramienta, id, dest),
    label: (id) => etiquetaFila(componentesPorTipo.equipo_herramienta, id),
  });
  const dragAuxiliar = useRowDrag({
    ids: componentesPorTipo.basico_auxiliar.map((c) => c.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(componentesPorTipo.basico_auxiliar, id, dest),
    label: (id) => etiquetaFila(componentesPorTipo.basico_auxiliar, id),
  });
  const dragPorTipo: Record<TipoBasicoAuxiliarComponente, ReturnType<typeof useRowDrag>> = {
    material: dragMaterial,
    mano_obra: dragManoObra,
    equipo_herramienta: dragEquipo,
    basico_auxiliar: dragAuxiliar,
  };

  const abrirAgregar = (tipo: TipoBasicoAuxiliarComponente) => {
    setAgregandoTipo(tipo);
    setGruposColapsados((prev) => {
      if (!prev.has(tipo)) return prev;
      const next = new Set(prev);
      next.delete(tipo);
      return next;
    });
  };

  const confirmarQuitar = async () => {
    if (!pendingQuitar) return;
    setError(null);
    try {
      await deleteBasicoAuxiliarComponente(pendingQuitar.id);
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
            <APP_ICONS.grupo_basico_auxiliar.icono size={16} className={APP_ICONS.grupo_basico_auxiliar.color} />
            Análisis de básico auxiliar
          </span>

          <div className="mt-1 flex items-start gap-3">
            <div className="w-[70%]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-base font-bold tracking-tight">{auxiliar.clave}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Unidad: <span className="font-medium text-foreground">{simboloUnidad}</span>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-foreground">{auxiliar.descripcion}</p>
            </div>

            <div aria-hidden className="mt-0.5 self-stretch w-px shrink-0 bg-border" />

            <div className="w-[30%] text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <span className="font-normal text-muted-foreground">Costo:</span>
                {regionVistaId ? (
                  <APP_ICONS.region_otra.icono size={16} className={APP_ICONS.region_otra.color} />
                ) : (
                  <APP_ICONS.region_nacional.icono size={16} className={APP_ICONS.region_nacional.color} />
                )}
                {zonas.find((z) => z.regionId === regionVistaId)?.nombre ?? NACIONAL}
              </span>

              <div className="mt-2 flex flex-col gap-1">
                <div
                  className="flex h-1.5 min-w-0 overflow-hidden rounded-full bg-muted"
                  title={`Material ${pctMaterial.toFixed(0)}% / MO ${pctManoObra.toFixed(0)}% / Equipo ${pctEquipo.toFixed(0)}% / Otros ${pctAuxiliar.toFixed(0)}%`}
                >
                  <div className={APP_ICONS.grupo_material.bg} style={{ width: `${pctMaterial}%` }} />
                  <div className={APP_ICONS.grupo_mano_obra.bg} style={{ width: `${pctManoObra}%` }} />
                  <div className={APP_ICONS.grupo_equipo_herramienta.bg} style={{ width: `${pctEquipo}%` }} />
                  <div className={APP_ICONS.grupo_basico_auxiliar.bg} style={{ width: `${pctAuxiliar}%` }} />
                </div>
                <span className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1">
                    <APP_ICONS.grupo_material.icono size={16} className={APP_ICONS.grupo_material.color} />
                    {pctMaterial.toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <APP_ICONS.grupo_mano_obra.icono size={16} className={APP_ICONS.grupo_mano_obra.color} />
                    {pctManoObra.toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <APP_ICONS.grupo_equipo_herramienta.icono size={16} className={APP_ICONS.grupo_equipo_herramienta.color} />
                    {pctEquipo.toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <APP_ICONS.grupo_basico_auxiliar.icono size={16} className={APP_ICONS.grupo_basico_auxiliar.color} />
                    {pctAuxiliar.toFixed(0)}%
                  </span>
                </span>
                <div aria-hidden className="mt-1 h-px bg-border" />

                <div className="mt-2 flex items-center justify-end gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                      >
                        <Plus size={16} /> Agregar renglón
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="text-xs" onCloseAutoFocus={(e) => e.preventDefault()}>
                      {gruposDef.map((g) => (
                        <DropdownMenuItem
                          key={g.tipo}
                          disabled={g.opciones.length === 0}
                          onSelect={() => abrirAgregar(g.tipo)}
                          className="text-xs"
                        >
                          <g.Icono size={16} className={g.color} />
                          {g.titulo}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                    <button
                      type="button"
                      title="Expandir todo"
                      onClick={() => setGruposColapsados(new Set())}
                      className="rounded p-1 hover:bg-muted hover:text-foreground"
                    >
                      <ChevronsDown size={16} />
                    </button>
                    <button
                      type="button"
                      title="Colapsar todo"
                      onClick={() => setGruposColapsados(new Set(gruposDef.map((g) => g.tipo)))}
                      className="rounded p-1 hover:bg-muted hover:text-foreground"
                    >
                      <ChevronsUp size={16} />
                    </button>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-xs font-semibold text-foreground">
                <th colSpan={2} className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Clave</th>
                <th className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Descripción</th>
                <th className="w-16 border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Unidad</th>
                <th className="w-20 border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Rendimiento</th>
                <th className="w-20 border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Cantidad</th>
                <th className="w-24 border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">
                  <span className="inline-flex items-center justify-center gap-1">
                    Costo
                    <button
                      type="button"
                      aria-pressed={mostrarFechaPrecio}
                      title="Mostrar/ocultar fecha de precios"
                      onClick={() => setMostrarFechaPrecio((v) => !v)}
                      className={cn(
                        "rounded p-0.5 font-normal",
                        mostrarFechaPrecio ? "text-primary" : "text-muted-foreground/70 hover:text-foreground",
                      )}
                    >
                      <CalendarDays size={16} className={mostrarFechaPrecio ? "fill-current" : undefined} />
                    </button>
                  </span>
                </th>
                <th colSpan={2} className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Importe</th>
              </tr>
            </thead>

            {gruposDef.map((g) => (
              <GrupoTabla
                key={g.tipo}
                titulo={g.titulo}
                Icono={g.Icono}
                color={g.color}
                filas={componentesPorTipo[g.tipo].map(aFila)}
                agregando={agregandoTipo === g.tipo}
                onCerrarAgregar={() => setAgregandoTipo(null)}
                opciones={g.opciones}
                onAgregar={(id) => void agregarComponente(id)}
                onQuitar={(fila) => {
                  const c = componentesPorTipo[g.tipo].find((x) => x.id === fila.id);
                  if (c) setPendingQuitar(c);
                }}
                onCommitCantidad={(id, v) => void guardarCantidad(id, v)}
                onCommitRendimiento={(id, v) => void guardarRendimiento(id, v)}
                mostrarFechaPrecio={mostrarFechaPrecio}
                destello={destello}
                drag={dragPorTipo[g.tipo]}
                subtotal={g.subtotal}
                colapsado={gruposColapsados.has(g.tipo) && agregandoTipo !== g.tipo}
                onToggleColapsado={() =>
                  setGruposColapsados((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.tipo)) next.delete(g.tipo);
                    else next.add(g.tipo);
                    return next;
                  })
                }
              />
            ))}
          </table>

          {cargando && componentes.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">Cargando…</p>}
        </div>

        {/* Costo total */}
        <div
          className={cn(
            "flex items-center justify-between rounded-b-lg border-t-2 border-foreground/20 py-2.5 pr-10 pl-4 transition-colors duration-700",
            destello && destello.total > 0 && "bg-emerald-500/20",
            destello && destello.total < 0 && "bg-rose-500/20",
            (!destello || destello.total === 0) && "bg-muted/40",
          )}
        >
          <span className="text-xs font-semibold uppercase tracking-widest">Costo directo</span>
          <span className="flex items-baseline gap-2">
            {destello && <ChipDelta key={destello.ticket} valor={destello.total} className="text-sm" />}
            <span className="text-xl font-bold tabular-nums">${fmt(costoSeleccionado?.costo_total ?? "0")}</span>
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border-2 border-foreground/20 bg-card shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setCostoRegionExpandido((v) => !v)}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              {costoRegionExpandido ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
              Costo por región
            </button>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Calculado desde los precios y salarios vigentes. Clic en una región para ver su costo en el análisis.
            </p>
          </div>
          <div className="flex shrink-0 items-start">
            <button
              type="button"
              title={
                recalculando
                  ? "Recalculando costos de todas las regiones…"
                  : [
                      "Recalcular todas las regiones con los precios y salarios vigentes.",
                      sincronizadoEn ? `Última sincronización: ${formatearFecha(sincronizadoEn)}` : "Aún no se ha sincronizado con los precios vigentes.",
                    ].join("\n")
              }
              onClick={() => void recalcularZonas()}
              disabled={recalculando}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted",
                recalculando && "opacity-50",
                !sincronizadoEn && "border-amber-500/40",
              )}
            >
              <RefreshCcw size={16} className={cn(recalculando && "animate-spin")} />
              {recalculando ? "Sincronizando…" : "Sincronizar"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto px-4 py-3">
          <table className="w-max min-w-full table-fixed border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-30 w-[7.5rem] min-w-[7.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
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
                      onClick={() => verRegion(z.regionId)}
                    >
                      <span className="line-clamp-2 break-words">{z.nombre}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {costoRegionExpandido &&
                (
                  [
                    [APP_ICONS.grupo_material.titulo, (c: BasicoAuxiliarCosto | null) => c?.sub_total_material],
                    [APP_ICONS.grupo_mano_obra.titulo, (c: BasicoAuxiliarCosto | null) => c?.sub_total_mano_obra],
                    [APP_ICONS.grupo_equipo_herramienta.titulo, (c: BasicoAuxiliarCosto | null) => c?.sub_total_equipo],
                    [APP_ICONS.grupo_basico_auxiliar.titulo, (c: BasicoAuxiliarCosto | null) => c?.sub_total_basico_auxiliar],
                  ] as const
                ).map(([etiqueta, extraer]) => (
                  <tr key={etiqueta}>
                    <th className="sticky left-0 z-10 w-[7.5rem] min-w-[7.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left font-normal text-muted-foreground">
                      {etiqueta}
                    </th>
                    {zonas.map((z) => {
                      const cob = z.costo ? coberturaPorCostoId[z.costo.id] : undefined;
                      const incompleta = !z.costo || (cob?.sin ?? 0) > 0;
                      const monto = incompleta ? "—" : `$${fmt(extraer(z.costo) ?? "0")}`;
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
                ))}
              <tr>
                <th className="sticky left-0 z-10 w-[7.5rem] min-w-[7.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left font-semibold">
                  Costo Total
                </th>
                {zonas.map((z) => {
                  const cob = z.costo ? coberturaPorCostoId[z.costo.id] : undefined;
                  const sin = cob?.sin ?? (componentes.length > 0 && !z.costo ? componentes.length : 0);
                  const total = cob?.total ?? componentes.length;
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

      {dragMaterial.preview}
      {dragManoObra.preview}
      {dragEquipo.preview}
      {dragAuxiliar.preview}

      <AlertDialog open={pendingQuitar !== null} onOpenChange={(open) => !open && setPendingQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este renglón de la receta?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingQuitar && `Se quitará "${nombreComponente(pendingQuitar)}" de todas las regiones. Esta acción no se puede deshacer.`}
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
