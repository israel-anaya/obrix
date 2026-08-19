import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Boxes, CalendarDays, CircleDot, Cog, Droplets, Fuel, Gauge, Globe2, GripVertical, HardHat, Joystick, Layers, MapPinned, Plus, RefreshCcw, Timer, Users, X, type LucideIcon } from "lucide-react";
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
import { CurrencyInput } from "@/components/CurrencyInput";
import { QuantityInput } from "@/components/QuantityInput";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createEquipoCostoHorarioDetalle,
  deleteEquipoCostoHorarioDetalle,
  listCategoriasFasar,
  listCuadrillas,
  listEquipoCostoHorarioCostoDetalles,
  listEquipoCostoHorarioCostos,
  listEquipoCostoHorarioDetalles,
  listMateriales,
  listRegiones,
  listUnidadesMedida,
  moveEquipoCostoHorarioDetalle,
  recalculateEquipoCostoHorarioZonas,
  updateEquipoCostoHorario,
  updateEquipoCostoHorarioDetalle,
} from "@/lib/tauri";
import { useFilaDrag, type EtiquetaFila } from "@/features/catalogos/useFilaDrag";
import { formatearFecha, diasTranscurridos } from "@/lib/fecha";
import { ordenarPor } from "@/lib/ordenar";
import type {
  CategoriaFasar,
  Cuadrilla,
  DireccionMovimiento,
  EquipoCostoHorario,
  EquipoCostoHorarioCosto,
  EquipoCostoHorarioCostoDetalle,
  EquipoCostoHorarioDetalle,
  Material,
  NaturalezaConsumoEquipoCostoHorario,
  NaturalezaOperacionEquipoCostoHorario,
  Region,
  UnidadMedida,
} from "@/lib/types";
import { regionesVisibles } from "@/lib/types";
import { cn } from "@/lib/utils";

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

const NACIONAL = "Nacional";

const NATURALEZAS_CONSUMO: {
  id: NaturalezaConsumoEquipoCostoHorario;
  etiqueta: string;
  icono: LucideIcon;
  clase: string;
}[] = [
  { id: "combustible", etiqueta: "Combustible", icono: Fuel, clase: "text-amber-500" },
  { id: "lubricante", etiqueta: "Lubricante", icono: Droplets, clase: "text-cyan-600 dark:text-cyan-400" },
  { id: "llantas", etiqueta: "Llantas", icono: CircleDot, clase: "text-slate-500 dark:text-slate-400" },
  { id: "piezas_especiales", etiqueta: "Piezas especiales", icono: Cog, clase: "text-orange-500" },
  { id: "otras_fuentes", etiqueta: "Otras fuentes", icono: Layers, clase: "text-muted-foreground" },
];

/** La naturaleza de operación no se captura: la deriva el backend de la extensión del insumo. */
const NATURALEZAS_OPERACION: Record<
  NaturalezaOperacionEquipoCostoHorario,
  { etiqueta: string; icono: LucideIcon; clase: string }
> = {
  categoria: { etiqueta: "Categoría FASAR", icono: HardHat, clase: "text-violet-500" },
  cuadrilla: { etiqueta: "Cuadrilla", icono: Users, clase: "text-emerald-600 dark:text-emerald-400" },
};

function ComboNaturaleza({
  valor,
  onElegir,
}: {
  valor: NaturalezaConsumoEquipoCostoHorario;
  onElegir: (naturaleza: NaturalezaConsumoEquipoCostoHorario) => void;
}) {
  const actual = NATURALEZAS_CONSUMO.find((n) => n.id === valor) ?? NATURALEZAS_CONSUMO[0];
  const Icono = actual.icono;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={actual.etiqueta}
          className="rounded p-0.5 hover:bg-muted"
        >
          <Icono size={16} className={actual.clase} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={actual.id}
          onValueChange={(v) => onElegir(v as NaturalezaConsumoEquipoCostoHorario)}
        >
          {NATURALEZAS_CONSUMO.map((n) => (
            <DropdownMenuRadioItem key={n.id} value={n.id}>
              <n.icono size={16} className={n.clase} />
              {n.etiqueta}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconoNaturalezaOperacion({ naturaleza }: { naturaleza: string | null }) {
  const info =
    naturaleza && naturaleza in NATURALEZAS_OPERACION
      ? NATURALEZAS_OPERACION[naturaleza as NaturalezaOperacionEquipoCostoHorario]
      : null;
  if (!info) return null;
  const Icono = info.icono;
  return (
    <span title={info.etiqueta} className="inline-flex p-0.5">
      <Icono size={16} className={info.clase} />
      <span className="sr-only">{info.etiqueta}</span>
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

interface CamposCf {
  cf_costo_maquina: string;
  cf_valor_llantas: string;
  cf_valor_piezas_especiales: string;
  cf_valor_rescate_porcentaje: string;
  cf_vida_economica_anios: string;
  cf_horas_uso_anual: string;
  cf_tasa_interes_anual_porcentaje: string;
  cf_tasa_seguros_anual_porcentaje: string;
  cf_mantenimiento_porcentaje: string;
}

/** Un renglón "etiqueta = valor" del bloque de cargos fijos — captura editable o valor intermedio de solo lectura. */
function FilaCf({
  label,
  destacado,
  children,
}: {
  label: string;
  /** Marca un valor intermedio calculado (p. ej. Vm) con una línea separadora arriba, como un subtotal. */
  destacado?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", destacado && "mt-1 border-t border-foreground/30 pt-1.5")}>
      <span className="text-muted-foreground">{label} =</span>
      {children}
    </div>
  );
}

function ValorCf({ valor, moneda = true }: { valor: string; moneda?: boolean }) {
  return (
    <span className="tabular-nums">
      {moneda && "$"}
      {fmt(valor)}
    </span>
  );
}

/** Un renglón de la caja "Cargos fijos" — concepto y valor en el primer renglón, fórmula en el segundo. */
function FilaFormula({ concepto, formula, valor }: { concepto: string; formula: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{concepto}</span>
        <ValorCf valor={valor} />
      </div>
      <span className="text-[10px] text-muted-foreground/70">{formula}</span>
    </div>
  );
}

function aCamposCf(e: EquipoCostoHorario): CamposCf {
  return {
    cf_costo_maquina: e.cf_costo_maquina,
    cf_valor_llantas: e.cf_valor_llantas,
    cf_valor_piezas_especiales: e.cf_valor_piezas_especiales,
    cf_valor_rescate_porcentaje: e.cf_valor_rescate_porcentaje,
    cf_vida_economica_anios: e.cf_vida_economica_anios,
    cf_horas_uso_anual: e.cf_horas_uso_anual,
    cf_tasa_interes_anual_porcentaje: e.cf_tasa_interes_anual_porcentaje,
    cf_tasa_seguros_anual_porcentaje: e.cf_tasa_seguros_anual_porcentaje,
    cf_mantenimiento_porcentaje: e.cf_mantenimiento_porcentaje,
  };
}

/**
 * "Ficha" de un equipo de costo horario — mismo formato de tarjeta APU que
 * `CuadrillaFichaApu`, con un bloque adicional editable de "Cargos fijos"
 * (los 9 valores de captura de depreciación/inversión/seguro/mantenimiento,
 * metodología SCT/CMIC) antes de las dos tablas de composición (Consumo,
 * Operación) — así se ve el desglose recalculado mientras se ajustan los
 * valores de la máquina. Enfoque alterno a la vista de grid: mismos
 * comandos de Tauri; los montos del análisis son los de la región elegida
 * en Costo por región (Nacional al abrir).
 *
 * Agregar/editar/eliminar el equipo en sí (identidad: clave/descripción/
 * unidad/familia) vive en la barra de acciones de
 * `EquipoCostoHorarioFicha` — este componente administra los cargos fijos y
 * la composición.
 */
export function EquipoCostoHorarioFichaApu({
  equipo,
  onCambio,
}: {
  equipo: EquipoCostoHorario;
  onCambio: () => void;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const [detalles, setDetalles] = useState<EquipoCostoHorarioDetalle[]>([]);
  const [costos, setCostos] = useState<EquipoCostoHorarioCosto[]>([]);
  const [costoSeleccionadoId, setCostoSeleccionadoId] = useState<string | null>(null);
  const [costoDetalles, setCostoDetalles] = useState<EquipoCostoHorarioCostoDetalle[]>([]);
  const [costoDetallesPorCostoId, setCostoDetallesPorCostoId] = useState<Record<string, EquipoCostoHorarioCostoDetalle[]>>({});
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [totales, setTotales] = useState<EquipoCostoHorario>(equipo);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregandoConsumo, setAgregandoConsumo] = useState(false);
  const [agregandoOperacion, setAgregandoOperacion] = useState(false);
  const [pendingQuitar, setPendingQuitar] = useState<EquipoCostoHorarioDetalle | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  /** `null` = Nacional. No se persiste: solo elige qué cache ve el análisis. */
  const [regionVistaId, setRegionVistaId] = useState<string | null>(null);
  const [mostrarFechaPrecio, setMostrarFechaPrecio] = useState(false);

  const [camposCf, setCamposCf] = useState<CamposCf>(() => aCamposCf(equipo));
  const [guardandoCf, setGuardandoCf] = useState(false);
  const zonasMaterializadasId = useRef<string | null>(null);

  useEffect(() => {
    listMateriales().then(setMateriales).catch(() => {});
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listCuadrillas().then(setCuadrillas).catch(() => {});
    listRegiones().then(setRegiones).catch(() => {});
    listUnidadesMedida().then(setUnidades).catch(() => {});
  }, [organizacionActivaId]);

  useEffect(() => {
    setTotales(equipo);
    setCamposCf(aCamposCf(equipo));
  }, [equipo]);

  useEffect(() => {
    setAgregandoConsumo(false);
    setAgregandoOperacion(false);
  }, [equipo.id]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const aplicarCostos = async (costosR: EquipoCostoHorarioCosto[], vistaId: string | null) => {
    setCostos(costosR);
    const pares = await Promise.all(
      costosR.map(async (c) => {
        const dets = await listEquipoCostoHorarioCostoDetalles(c.id).catch(() => [] as EquipoCostoHorarioCostoDetalle[]);
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
  };

  const cargarCostos = (id: string, vistaId: string | null = regionVistaId) =>
    listEquipoCostoHorarioCostos(id)
      .then((costosR) => aplicarCostos(costosR, vistaId))
      .catch((e) => {
        setError(String(e));
        setCostos([]);
        setCostoDetalles([]);
        setCostoDetallesPorCostoId({});
      });

  useEffect(() => {
    setCargando(true);
    setError(null);
    setCostoSeleccionadoId(null);
    setRegionVistaId(null);
    zonasMaterializadasId.current = null;
    Promise.all([listEquipoCostoHorarioDetalles(equipo.id), listEquipoCostoHorarioCostos(equipo.id)])
      .then(async ([detallesR, costosR]) => {
        setDetalles(detallesR);
        await aplicarCostos(costosR, null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipo.id]);

  const trasMutar = async (equipoActualizado: EquipoCostoHorario) => {
    setTotales(equipoActualizado);
    setCamposCf(aCamposCf(equipoActualizado));
    onCambio();
    await listEquipoCostoHorarioDetalles(equipo.id).then(setDetalles).catch((e) => setError(String(e)));
    await cargarCostos(equipo.id);
  };

  const recalcularZonas = async () => {
    setRecalculando(true);
    setError(null);
    try {
      await recalculateEquipoCostoHorarioZonas(equipo.id);
      await cargarCostos(equipo.id);
      onCambio();
    } catch (e) {
      setError(String(e));
    } finally {
      setRecalculando(false);
    }
  };

  // El alta/CSV solo crea la valuación nacional. Las columnas regionales
  // nacen al mutar la receta o al sincronizar; si el catálogo ya tiene
  // regiones, materialízalas al abrir la ficha para que Costo por región
  // no quede solo en Nacional.
  useEffect(() => {
    if (cargando || recalculando || costos.length === 0) return;
    if (zonasMaterializadasId.current === equipo.id) return;
    const visibles = regionesVisibles(regiones);
    const faltante = visibles.some((r) => !costos.some((c) => c.region_id === r.id));
    zonasMaterializadasId.current = equipo.id;
    if (faltante) void recalcularZonas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipo.id, cargando, costos, regiones]);

  const simboloUnidad = useMemo(
    () => unidades.find((u) => u.id === totales.unidad_id)?.simbolo ?? totales.unidad_id,
    [unidades, totales.unidad_id],
  );

  const opcionPorMaterialId = useMemo(
    () => Object.fromEntries(materiales.map((m) => [m.id, `${m.clave} — ${m.descripcion}`])),
    [materiales],
  );
  const opcionPorOperacionId = useMemo(
    () =>
      Object.fromEntries([
        ...categorias.map((c) => [c.id, `${c.clave} — ${c.descripcion}`]),
        ...cuadrillas.map((c) => [c.id, `${c.clave} — ${c.descripcion}`]),
      ]),
    [categorias, cuadrillas],
  );
  const materialPorId = useMemo(() => Object.fromEntries(materiales.map((m) => [m.id, m])), [materiales]);
  const categoriaPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const cuadrillaPorId = useMemo(() => Object.fromEntries(cuadrillas.map((c) => [c.id, c])), [cuadrillas]);
  const simboloPorUnidadId = useMemo(() => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])), [unidades]);

  const unidadDeOperacion = (detalleInsumoId: string) =>
    categoriaPorId[detalleInsumoId]?.unidad_id ?? cuadrillaPorId[detalleInsumoId]?.unidad_id ?? "";

  const idsUsados = useMemo(() => new Set(detalles.map((d) => d.detalle_insumo_id)), [detalles]);
  const materialesDisponibles = useMemo(() => materiales.filter((m) => !idsUsados.has(m.id)), [materiales, idsUsados]);
  const operacionesDisponibles = useMemo(
    () => [
      ...categorias.filter((c) => !idsUsados.has(c.id)).map((c) => ({ id: c.id, etiqueta: `${c.clave} — ${c.descripcion}` })),
      ...cuadrillas.filter((c) => !idsUsados.has(c.id)).map((c) => ({ id: c.id, etiqueta: `${c.clave} — ${c.descripcion}` })),
    ],
    [categorias, cuadrillas, idsUsados],
  );

  const consumos = useMemo(
    () => detalles.filter((d) => d.tipo === "consumo").sort((a, b) => a.orden - b.orden),
    [detalles],
  );
  const operaciones = useMemo(
    () => detalles.filter((d) => d.tipo === "operacion").sort((a, b) => a.orden - b.orden),
    [detalles],
  );
  const costoDetallePorDetalleId = useMemo(
    () => Object.fromEntries(costoDetalles.map((cd) => [cd.equipo_costo_horario_detalle_id, cd])),
    [costoDetalles],
  );
  const costoSeleccionado = costos.find((c) => c.id === costoSeleccionadoId) ?? null;

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
    const idsReceta = new Set(detalles.map((d) => d.id));
    return Object.fromEntries(
      Object.entries(costoDetallesPorCostoId).map(([costoId, dets]) => {
        const deReceta = dets.filter((d) => idsReceta.has(d.equipo_costo_horario_detalle_id));
        const sin = deReceta.filter((d) => !d.fecha_precio).length;
        return [costoId, { total: idsReceta.size, sin }];
      }),
    );
  }, [costoDetallesPorCostoId, detalles]);

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

  const reordenar = async (filas: EquipoCostoHorarioDetalle[], id: string, indiceDestino: number) => {
    const fromIndex = filas.findIndex((d) => d.id === id);
    if (fromIndex < 0 || fromIndex === indiceDestino) return;
    const direccion: DireccionMovimiento = indiceDestino < fromIndex ? "arriba" : "abajo";
    const pasos = Math.abs(indiceDestino - fromIndex);
    setError(null);
    try {
      for (let i = 0; i < pasos; i++) {
        await moveEquipoCostoHorarioDetalle(id, direccion);
      }
      await listEquipoCostoHorarioDetalles(equipo.id).then(setDetalles).catch((e) => setError(String(e)));
    } catch (e) {
      setError(String(e));
    }
  };

  const nombreDetalle = (detalle: EquipoCostoHorarioDetalle) =>
    detalle.tipo === "consumo"
      ? (opcionPorMaterialId[detalle.detalle_insumo_id] ?? detalle.detalle_insumo_id)
      : (opcionPorOperacionId[detalle.detalle_insumo_id] ?? detalle.detalle_insumo_id);

  const etiquetaDetalle = (lista: EquipoCostoHorarioDetalle[], id: string): EtiquetaFila | null => {
    const detalle = lista.find((d) => d.id === id);
    if (!detalle) return null;
    const costo = costoDetallePorDetalleId[detalle.id]?.costo;
    const unidadId =
      detalle.tipo === "consumo"
        ? (materialPorId[detalle.detalle_insumo_id]?.unidad_id ?? "")
        : unidadDeOperacion(detalle.detalle_insumo_id);
    return {
      titulo: nombreDetalle(detalle),
      cantidad: fmtCantidad(detalle.cantidad),
      unidad: simboloPorUnidadId[unidadId] ?? "",
      costo: costo ? `$${fmt(costo)}` : undefined,
    };
  };

  const dragConsumos = useFilaDrag({
    ids: consumos.map((d) => d.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(consumos, id, dest),
    etiqueta: (id) => etiquetaDetalle(consumos, id),
  });
  const dragOperaciones = useFilaDrag({
    ids: operaciones.map((d) => d.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(operaciones, id, dest),
    etiqueta: (id) => etiquetaDetalle(operaciones, id),
  });

  const agregarConsumo = async (id: string) => {
    setAgregandoConsumo(false);
    if (!id) return;
    setError(null);
    try {
      const actualizado = await createEquipoCostoHorarioDetalle(equipo.id, {
        detalle_insumo_id: id,
        cantidad: "1",
        naturaleza: "combustible",
      });
      await trasMutar(actualizado);
    } catch (e) {
      setError(String(e));
    }
  };

  const agregarOperacion = async (id: string) => {
    setAgregandoOperacion(false);
    if (!id) return;
    setError(null);
    try {
      const actualizado = await createEquipoCostoHorarioDetalle(equipo.id, { detalle_insumo_id: id, cantidad: "1" });
      await trasMutar(actualizado);
    } catch (e) {
      setError(String(e));
    }
  };

  const guardarCantidad = async (detalle: EquipoCostoHorarioDetalle, valorTexto: string) => {
    if (valorTexto.trim() === "") return;
    const numero = Number(valorTexto);
    if (!Number.isFinite(numero) || numero < 0) {
      setError("La cantidad debe ser un número mayor o igual a 0.");
      return;
    }
    const redondeada = Number(numero.toFixed(6));
    if (redondeada === Number(detalle.cantidad)) return;
    setError(null);
    try {
      const actualizado = await updateEquipoCostoHorarioDetalle(detalle.id, {
        detalle_insumo_id: detalle.detalle_insumo_id,
        cantidad: String(redondeada),
        naturaleza: detalle.naturaleza,
      });
      await trasMutar(actualizado);
    } catch (e) {
      setError(String(e));
    }
  };

  const guardarNaturaleza = async (
    detalle: EquipoCostoHorarioDetalle,
    naturaleza: NaturalezaConsumoEquipoCostoHorario,
  ) => {
    if (detalle.naturaleza === naturaleza) return;
    setError(null);
    try {
      const actualizado = await updateEquipoCostoHorarioDetalle(detalle.id, {
        detalle_insumo_id: detalle.detalle_insumo_id,
        cantidad: detalle.cantidad,
        naturaleza,
      });
      await trasMutar(actualizado);
    } catch (e) {
      setError(String(e));
    }
  };

  const confirmarQuitar = async () => {
    if (!pendingQuitar) return;
    setError(null);
    try {
      const actualizado = await deleteEquipoCostoHorarioDetalle(pendingQuitar.id);
      setPendingQuitar(null);
      await trasMutar(actualizado);
    } catch (e) {
      setPendingQuitar(null);
      setError(String(e));
    }
  };

  // Los 9 valores de captura de cargos fijos soportan hasta 2 decimales —
  // se redondean al salir del campo, no en cada tecleo, para no pelear con
  // lo que el usuario está escribiendo.
  const redondearCampoCf = (campo: keyof CamposCf, valorTexto: string) => {
    const numero = Number(valorTexto.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(numero)) return;
    setCamposCf((actual) => ({ ...actual, [campo]: Math.max(0, numero).toFixed(2) }));
  };

  const cfCambio = useMemo(
    () => JSON.stringify(camposCf) !== JSON.stringify(aCamposCf(totales)),
    [camposCf, totales],
  );

  const guardarCf = async () => {
    setGuardandoCf(true);
    setError(null);
    try {
      const actualizado = await updateEquipoCostoHorario(equipo.id, {
        clave: totales.clave,
        descripcion: totales.descripcion,
        unidad_id: totales.unidad_id,
        familia_id: totales.familia_id,
        sub_familia_id: totales.sub_familia_id,
        ...camposCf,
      });
      setTotales(actualizado);
      setCamposCf(aCamposCf(actualizado));
      onCambio();
      await cargarCostos(equipo.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardandoCf(false);
    }
  };

  const costoTotalNum = Number(costoSeleccionado?.costo_total) || 0;
  const pctFijo = costoTotalNum > 0 ? ((Number(totales.cf_cargo_fijo_hora) || 0) / costoTotalNum) * 100 : 0;
  const pctConsumo = costoTotalNum > 0 ? ((Number(costoSeleccionado?.subtotal_consumo) || 0) / costoTotalNum) * 100 : 0;
  const pctOperacion = costoTotalNum > 0 ? ((Number(costoSeleccionado?.subtotal_operacion) || 0) / costoTotalNum) * 100 : 0;

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
            <Gauge size={16} className="text-emerald-500" />
            Análisis de costo horario
          </span>

          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="font-mono text-base font-bold tracking-tight">{totales.clave}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              Unidad: <span className="font-medium text-foreground">{simboloUnidad}</span>
              <span aria-hidden className="px-1.5 text-border">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                {regionVistaId ? (
                  <MapPinned size={12} className="text-teal-600 dark:text-teal-400" />
                ) : (
                  <Globe2 size={12} className="text-primary" />
                )}
                {zonas.find((z) => z.regionId === regionVistaId)?.nombre ?? NACIONAL}
              </span>
            </span>
          </div>
          <p className="mt-0.5 text-xs text-foreground">{totales.descripcion}</p>
          <div className="mt-2 flex items-center gap-3">
            <div
              className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
              title={`Fijo ${pctFijo.toFixed(0)}% / Consumo ${pctConsumo.toFixed(0)}% / Operación ${pctOperacion.toFixed(0)}%`}
            >
              <div className="bg-blue-500" style={{ width: `${pctFijo}%` }} />
              <div className="bg-amber-500" style={{ width: `${pctConsumo}%` }} />
              <div className="bg-violet-500" style={{ width: `${pctOperacion}%` }} />
            </div>
            <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Timer size={16} className="text-blue-500" />
                {pctFijo.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1">
                <Boxes size={16} className="text-amber-500" />
                {pctConsumo.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1">
                <Joystick size={16} className="text-violet-500" />
                {pctOperacion.toFixed(0)}%
              </span>
            </span>
          </div>
        </div>

        {/* Cargos fijos */}
        <div className="border-b-2 border-foreground/20 p-4">
          <div className="grid grid-cols-[3fr_2fr] gap-6">
            {/* Captura + valores intermedios */}
            <div className="flex flex-col gap-1.5 text-xs">
              <FilaCf label="Costo de la máquina (Cm)">
                <CurrencyInput
                  value={camposCf.cf_costo_maquina}
                  onCommit={(v) => redondearCampoCf("cf_costo_maquina", v)}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="Valor de las llantas (Pn)">
                <CurrencyInput
                  value={camposCf.cf_valor_llantas}
                  onCommit={(v) => redondearCampoCf("cf_valor_llantas", v)}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="Valor de las piezas especiales (Pa)">
                <CurrencyInput
                  value={camposCf.cf_valor_piezas_especiales}
                  onCommit={(v) => redondearCampoCf("cf_valor_piezas_especiales", v)}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="Valor de la máquina (Vm)" destacado>
                <ValorCf valor={totales.cf_valor_maquina} />
              </FilaCf>
              <FilaCf label="Horas efectivas al año (Hea)">
                <QuantityInput
                  value={camposCf.cf_horas_uso_anual}
                  onCommit={(v) => redondearCampoCf("cf_horas_uso_anual", v)}
                  decimals={2}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="Vida Económica (V)">
                <QuantityInput
                  value={camposCf.cf_vida_economica_anios}
                  onCommit={(v) => redondearCampoCf("cf_vida_economica_anios", v)}
                  decimals={2}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="Tasa de Seguro (s)">
                <QuantityInput
                  value={camposCf.cf_tasa_seguros_anual_porcentaje}
                  onCommit={(v) => redondearCampoCf("cf_tasa_seguros_anual_porcentaje", v)}
                  decimals={2}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="% de Mantenimiento (Ko)">
                <QuantityInput
                  value={camposCf.cf_mantenimiento_porcentaje}
                  onCommit={(v) => redondearCampoCf("cf_mantenimiento_porcentaje", v)}
                  decimals={2}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="% de Rescate (r)">
                <QuantityInput
                  value={camposCf.cf_valor_rescate_porcentaje}
                  onCommit={(v) => redondearCampoCf("cf_valor_rescate_porcentaje", v)}
                  decimals={2}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="Tasa de Interés (i)">
                <QuantityInput
                  value={camposCf.cf_tasa_interes_anual_porcentaje}
                  onCommit={(v) => redondearCampoCf("cf_tasa_interes_anual_porcentaje", v)}
                  decimals={2}
                  className="w-28 shrink-0"
                />
              </FilaCf>
              <FilaCf label="Vr = Vm × r">
                <ValorCf valor={totales.cf_valor_rescate} />
              </FilaCf>
              <FilaCf label="Ve = V × Hea">
                <ValorCf valor={totales.cf_vida_util_horas} moneda={false} />
              </FilaCf>
            </div>

            {/* Botón arriba, caja de resultado alineada abajo */}
            <div className="flex h-full flex-col">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void guardarCf()}
                  disabled={!cfCambio || guardandoCf}
                  className={cn(
                    "rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90",
                    (!cfCambio || guardandoCf) && "opacity-50",
                  )}
                >
                  {guardandoCf ? "Guardando…" : "Guardar cargos fijos"}
                </button>
              </div>

              <div className="mt-auto rounded-md border border-border p-3">
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <Timer size={16} className="text-blue-500" />
                  Cargos fijos
                </span>

                <div className="mt-2 flex flex-col gap-2 text-xs">
                  <FilaFormula concepto="a) Depreciación" formula="D = (Vm-Vr)/Ve" valor={totales.cf_depreciacion_hora} />
                  <FilaFormula concepto="b) Inversión" formula="Im = (Vm+Vr)×i/2×Hea" valor={totales.cf_inversion_hora} />
                  <FilaFormula concepto="c) Seguros" formula="Sm = (Vm+Vr)×s/2×Hea" valor={totales.cf_seguro_hora} />
                  <FilaFormula concepto="d) Mantenimiento" formula="Mn = Ko×D" valor={totales.cf_mantenimiento_hora} />
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-foreground/30 pt-1.5 text-xs font-semibold">
                  <span>TOTAL DE CARGOS FIJOS</span>
                  <ValorCf valor={totales.cf_cargo_fijo_hora} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-foreground/30 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="w-6 py-1" />
                <th className="w-20 py-1 pr-2 font-semibold">Código</th>
                <th className="py-1 pr-2 font-semibold">Descripción</th>
                <th className="w-8 py-1 pr-2 font-semibold" title="Naturaleza">
                  <span className="sr-only">Naturaleza</span>
                </th>
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

            {/* CONSUMO */}
            <tbody>
              <tr>
                <td colSpan={9} className="pt-2 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Boxes size={16} className="text-amber-500" />
                    Consumo
                  </span>
                </td>
              </tr>
              {consumos.length === 0 && !agregandoConsumo && (
                <tr>
                  <td colSpan={9} className="py-1.5 text-muted-foreground">
                    Sin consumos todavía.
                  </td>
                </tr>
              )}
              {consumos.map((d, i) => {
                const cd = costoDetallePorDetalleId[d.id];
                return (
                  <Fragment key={d.id}>
                    {dragConsumos.hueco === i && <MarcadorInsercion />}
                    <tr
                      className={cn(
                        "group border-b border-border/50 hover:bg-muted/30",
                        dragConsumos.filaClass(d.id),
                      )}
                      {...dragConsumos.filaProps(d.id)}
                    >
                  <td className="py-1 pr-1">
                    <span
                      title="Arrastra para reordenar"
                      className="inline-flex cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                      {...dragConsumos.handleProps(d.id)}
                    >
                      <GripVertical size={16} />
                    </span>
                  </td>
                  <td className="py-1 pr-2 font-mono text-muted-foreground">
                    {materialPorId[d.detalle_insumo_id]?.clave ?? d.detalle_insumo_id}
                  </td>
                  <td className="py-1 pr-2">{materialPorId[d.detalle_insumo_id]?.descripcion ?? ""}</td>
                  <td className="py-1 pr-2">
                    <ComboNaturaleza
                      valor={(d.naturaleza as NaturalezaConsumoEquipoCostoHorario | null) ?? "combustible"}
                      onElegir={(naturaleza) => void guardarNaturaleza(d, naturaleza)}
                    />
                  </td>
                  <td className="py-1 pr-2 text-muted-foreground">
                    {simboloPorUnidadId[materialPorId[d.detalle_insumo_id]?.unidad_id ?? ""] ?? ""}
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
                      <FechaPrecioFrescura fecha={cd.fecha_precio} />
                    ) : null}
                  </td>
                  <td className="py-1 text-right font-medium tabular-nums">${fmt(cd?.importe ?? "0")}</td>
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
                    {dragConsumos.hueco === consumos.length && i === consumos.length - 1 && (
                      <MarcadorInsercion />
                    )}
                  </Fragment>
                );
              })}
              <tr>
                <td colSpan={9} className="pt-1.5">
                  {agregandoConsumo ? (
                    <ComboboxFiltrable
                      opciones={materialesDisponibles.map((m) => ({
                        id: m.id,
                        etiqueta: `${m.clave} — ${m.descripcion}`,
                      }))}
                      onElegir={(id) => void agregarConsumo(id)}
                      onCancelar={() => setAgregandoConsumo(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAgregandoConsumo(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                    >
                      <Plus size={16} /> Agregar renglón
                    </button>
                  )}
                </td>
              </tr>
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={7} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal consumo
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(costoSeleccionado?.subtotal_consumo ?? "0")}</td>
                <td />
              </tr>
            </tbody>

            {/* OPERACIÓN */}
            <tbody>
              <tr>
                <td colSpan={9} className="pt-3 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Joystick size={16} className="text-violet-500" />
                    Operación
                  </span>
                </td>
              </tr>
              {operaciones.length === 0 && !agregandoOperacion && (
                <tr>
                  <td colSpan={9} className="py-1.5 text-muted-foreground">
                    Sin operación todavía.
                  </td>
                </tr>
              )}
              {operaciones.map((d, i) => {
                const cd = costoDetallePorDetalleId[d.id];
                return (
                  <Fragment key={d.id}>
                    {dragOperaciones.hueco === i && <MarcadorInsercion />}
                    <tr
                      className={cn(
                        "group border-b border-border/50 hover:bg-muted/30",
                        dragOperaciones.filaClass(d.id),
                      )}
                      {...dragOperaciones.filaProps(d.id)}
                    >
                  <td className="py-1 pr-1">
                    <span
                      title="Arrastra para reordenar"
                      className="inline-flex cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                      {...dragOperaciones.handleProps(d.id)}
                    >
                      <GripVertical size={16} />
                    </span>
                  </td>
                  <td className="py-1 pr-2 font-mono text-muted-foreground">
                    {(categoriaPorId[d.detalle_insumo_id] ?? cuadrillaPorId[d.detalle_insumo_id])?.clave ??
                      d.detalle_insumo_id}
                  </td>
                  <td className="py-1 pr-2">
                    {(categoriaPorId[d.detalle_insumo_id] ?? cuadrillaPorId[d.detalle_insumo_id])?.descripcion ?? ""}
                  </td>
                  <td className="py-1 pr-2">
                    <IconoNaturalezaOperacion naturaleza={d.naturaleza} />
                  </td>
                  <td className="py-1 pr-2 text-muted-foreground">
                    {simboloPorUnidadId[unidadDeOperacion(d.detalle_insumo_id)] ?? ""}
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
                  <td className="py-1 text-right font-medium tabular-nums">${fmt(cd?.importe ?? "0")}</td>
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
                    {dragOperaciones.hueco === operaciones.length && i === operaciones.length - 1 && (
                      <MarcadorInsercion />
                    )}
                  </Fragment>
                );
              })}
              <tr>
                <td colSpan={9} className="pt-1.5">
                  {agregandoOperacion ? (
                    <ComboboxFiltrable
                      opciones={operacionesDisponibles}
                      onElegir={(id) => void agregarOperacion(id)}
                      onCancelar={() => setAgregandoOperacion(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAgregandoOperacion(true)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                    >
                      <Plus size={16} /> Agregar renglón
                    </button>
                  )}
                </td>
              </tr>
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={7} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal operación
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(costoSeleccionado?.subtotal_operacion ?? "0")}</td>
                <td />
              </tr>
            </tbody>
          </table>

          {cargando && detalles.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">Cargando…</p>}
        </div>

        {/* Costo total */}
        <div className="flex items-center justify-between rounded-b-lg border-t-2 border-foreground/20 bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-widest">Costo horario total</span>
          <span className="text-xl font-bold tabular-nums">${fmt(costoSeleccionado?.costo_total ?? "0")}/hr</span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border-2 border-foreground/20 bg-card shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Costo por región
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Calculado desde precios de materiales y salarios/cuadrillas vigentes. Clic en una región para ver su costo en el análisis.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              title={
                recalculando
                  ? "Recalculando costos de todas las regiones…"
                  : [
                      "Recalcular todas las regiones con los precios y salarios vigentes.",
                      sincronizadoEn
                        ? `Última sincronización: ${formatearFecha(sincronizadoEn)}`
                        : "Aún no se ha sincronizado con los catálogos vigentes.",
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
                      <Globe2 size={16} className="mx-auto text-primary" aria-label="Nacional" />
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
              {(
                [
                  ["Consumo", "subtotal_consumo"],
                  ["Operación", "subtotal_operacion"],
                ] as const
              ).map(([etiqueta, campo]) => (
                <tr key={campo}>
                  <th className="sticky left-0 z-10 w-[5.5rem] min-w-[5.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left font-normal text-muted-foreground">
                    {etiqueta}
                  </th>
                  {zonas.map((z) => {
                    const monto = z.costo ? `$${fmt(z.costo[campo])}` : "—";
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
                        <span className="num block truncate" title={z.costo ? monto : undefined}>
                          {monto}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th className="sticky left-0 z-10 w-[5.5rem] min-w-[5.5rem] border-b border-r border-border bg-background px-2 py-1.5 text-left font-semibold">
                  Costo Total
                </th>
                {zonas.map((z) => {
                  const cob = z.costo ? coberturaPorCostoId[z.costo.id] : undefined;
                  const sin = cob?.sin ?? (detalles.length > 0 && !z.costo ? detalles.length : 0);
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
                      {!z.costo ? (
                        "—"
                      ) : (
                        <span className="inline-flex items-center justify-end gap-0.5">
                          {sin > 0 ? (
                            <span
                              title="sin precio en algún renglón"
                              className="inline-flex text-amber-800 dark:text-amber-300"
                            >
                              <AlertTriangle size={12} className="shrink-0" />
                            </span>
                          ) : null}
                          <span className="num block truncate font-semibold text-primary" title={monto}>
                            {monto}
                          </span>
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
              <Globe2 size={12} className="shrink-0 text-primary" />
            )}
            El análisis usa los precios de {zonas.find((z) => (z.regionId ?? null) === regionVistaId)?.nombre ?? NACIONAL}.
          </p>
        </div>
      </div>

      {dragConsumos.vistaPrevia}
      {dragOperaciones.vistaPrevia}

      <AlertDialog open={pendingQuitar !== null} onOpenChange={(open) => !open && setPendingQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este renglón del equipo?</AlertDialogTitle>
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
