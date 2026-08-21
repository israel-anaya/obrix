import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { APP_ICONS } from "@/lib/appIcons";
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
import { useRowDrag, type RowLabel } from "@/hooks/useRowDrag";
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
import { fmt, fmtCantidad } from "../shared/analisis-insumo/formato";
import { useRegionCosts } from "../shared/analisis-insumo/useRegionCosts";
import { CostoPorRegionCard } from "../shared/analisis-insumo/CostoPorRegionCard";
import { EncabezadoAnalisis } from "../shared/analisis-insumo/EncabezadoAnalisis";
import { RecetaGrupoTabla, TablaReceta, type FilaReceta } from "../shared/analisis-insumo/RecetaGrupoTabla";

type TipoEquipoDetalle = EquipoCostoHorarioDetalle["tipo"];

const NATURALEZAS_CONSUMO: {
  id: NaturalezaConsumoEquipoCostoHorario;
  etiqueta: string;
  icono: LucideIcon;
  clase: string;
}[] = [
  {
    id: "combustible",
    etiqueta: APP_ICONS.naturaleza_consumo_combustible.titulo,
    icono: APP_ICONS.naturaleza_consumo_combustible.icono,
    clase: APP_ICONS.naturaleza_consumo_combustible.color,
  },
  {
    id: "lubricante",
    etiqueta: APP_ICONS.naturaleza_consumo_lubricante.titulo,
    icono: APP_ICONS.naturaleza_consumo_lubricante.icono,
    clase: APP_ICONS.naturaleza_consumo_lubricante.color,
  },
  {
    id: "llantas",
    etiqueta: APP_ICONS.naturaleza_consumo_llantas.titulo,
    icono: APP_ICONS.naturaleza_consumo_llantas.icono,
    clase: APP_ICONS.naturaleza_consumo_llantas.color,
  },
  {
    id: "piezas_especiales",
    etiqueta: APP_ICONS.naturaleza_consumo_piezas_especiales.titulo,
    icono: APP_ICONS.naturaleza_consumo_piezas_especiales.icono,
    clase: APP_ICONS.naturaleza_consumo_piezas_especiales.color,
  },
  {
    id: "otras_fuentes",
    etiqueta: APP_ICONS.naturaleza_consumo_otras_fuentes.titulo,
    icono: APP_ICONS.naturaleza_consumo_otras_fuentes.icono,
    clase: APP_ICONS.naturaleza_consumo_otras_fuentes.color,
  },
];

/** La naturaleza de operación no se captura: la deriva el backend de la extensión del insumo. */
const NATURALEZAS_OPERACION: Record<
  NaturalezaOperacionEquipoCostoHorario,
  { etiqueta: string; icono: LucideIcon; clase: string }
> = {
  categoria: {
    etiqueta: "Categoría FASAR",
    icono: APP_ICONS.insumo_categoria_fasar.icono,
    clase: APP_ICONS.insumo_categoria_fasar.color,
  },
  cuadrilla: {
    etiqueta: "Cuadrilla",
    icono: APP_ICONS.insumo_cuadrilla.icono,
    clase: APP_ICONS.insumo_cuadrilla.color,
  },
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
        <button type="button" title={actual.etiqueta} className="rounded p-0.5 hover:bg-muted">
          <Icono size={16} className={actual.clase} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={actual.id} onValueChange={(v) => onElegir(v as NaturalezaConsumoEquipoCostoHorario)}>
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
  const { organizaciones, organizacionActivaId } = useOrganizacionActiva();
  const [detalles, setDetalles] = useState<EquipoCostoHorarioDetalle[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [totales, setTotales] = useState<EquipoCostoHorario>(equipo);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregandoTipo, setAgregandoTipo] = useState<TipoEquipoDetalle | null>(null);
  const [pendingQuitar, setPendingQuitar] = useState<EquipoCostoHorarioDetalle | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [mostrarFechaPrecio, setMostrarFechaPrecio] = useState(false);
  const [gruposColapsados, setGruposColapsados] = useState<Set<TipoEquipoDetalle>>(new Set());

  const [camposCf, setCamposCf] = useState<CamposCf>(() => aCamposCf(equipo));
  const [guardandoCf, setGuardandoCf] = useState(false);
  const zonasMaterializadasId = useRef<string | null>(null);

  const {
    costos,
    costoDetalles,
    costoSeleccionado,
    regionVistaId,
    zonas,
    coberturaPorCostoId,
    sincronizadoEn,
    cargarCostos,
    verRegion,
  } = useRegionCosts<EquipoCostoHorarioCosto, EquipoCostoHorarioCostoDetalle>({
    entityId: equipo.id,
    regiones,
    listCostos: listEquipoCostoHorarioCostos,
    listCostoDetalles: listEquipoCostoHorarioCostoDetalles,
    detalleRowId: (cd) => cd.equipo_costo_horario_detalle_id,
    filasCobertura: detalles,
    onError: (e) => setError(String(e)),
  });

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
    setAgregandoTipo(null);
  }, [equipo.id]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    setCargando(true);
    setError(null);
    zonasMaterializadasId.current = null;
    Promise.all([listEquipoCostoHorarioDetalles(equipo.id), cargarCostos(equipo.id, null)])
      .then(([detallesR]) => setDetalles(detallesR))
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

  const materialPorId = useMemo(() => Object.fromEntries(materiales.map((m) => [m.id, m])), [materiales]);
  const categoriaPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const cuadrillaPorId = useMemo(() => Object.fromEntries(cuadrillas.map((c) => [c.id, c])), [cuadrillas]);
  const simboloPorUnidadId = useMemo(() => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])), [unidades]);

  const unidadDeOperacion = (detalleInsumoId: string) =>
    categoriaPorId[detalleInsumoId]?.unidad_id ?? cuadrillaPorId[detalleInsumoId]?.unidad_id ?? "";

  const idsUsados = useMemo(() => new Set(detalles.map((d) => d.detalle_insumo_id)), [detalles]);
  const opcionesConsumo = useMemo(
    () => materiales.filter((m) => !idsUsados.has(m.id)).map((m) => ({ id: m.id, label: `${m.clave} — ${m.descripcion}` })),
    [materiales, idsUsados],
  );
  const opcionesOperacion = useMemo(
    () => [
      ...categorias.filter((c) => !idsUsados.has(c.id)).map((c) => ({ id: c.id, label: `${c.clave} — ${c.descripcion}` })),
      ...cuadrillas.filter((c) => !idsUsados.has(c.id)).map((c) => ({ id: c.id, label: `${c.clave} — ${c.descripcion}` })),
    ],
    [categorias, cuadrillas, idsUsados],
  );

  const consumos = useMemo(() => detalles.filter((d) => d.tipo === "consumo").sort((a, b) => a.orden - b.orden), [detalles]);
  const operaciones = useMemo(() => detalles.filter((d) => d.tipo === "operacion").sort((a, b) => a.orden - b.orden), [detalles]);
  const costoDetallePorDetalleId = useMemo(
    () => Object.fromEntries(costoDetalles.map((cd) => [cd.equipo_costo_horario_detalle_id, cd])),
    [costoDetalles],
  );

  const nombreRegionVista = useMemo(
    () => (regionVistaId ? (zonas.find((z) => z.regionId === regionVistaId)?.nombre ?? null) : null),
    [regionVistaId, zonas],
  );

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

  const nombreDetalle = (detalle: EquipoCostoHorarioDetalle) => {
    if (detalle.tipo === "consumo") {
      const m = materialPorId[detalle.detalle_insumo_id];
      return m ? `${m.clave} — ${m.descripcion}` : detalle.detalle_insumo_id;
    }
    const info = categoriaPorId[detalle.detalle_insumo_id] ?? cuadrillaPorId[detalle.detalle_insumo_id];
    return info ? `${info.clave} — ${info.descripcion}` : detalle.detalle_insumo_id;
  };

  const aFila = (d: EquipoCostoHorarioDetalle): FilaReceta => {
    const cd = costoDetallePorDetalleId[d.id];
    if (d.tipo === "consumo") {
      const material = materialPorId[d.detalle_insumo_id];
      return {
        id: d.id,
        clave: material?.clave ?? d.detalle_insumo_id,
        descripcion: material?.descripcion ?? "",
        unidad: simboloPorUnidadId[material?.unidad_id ?? ""] ?? "",
        cantidad: d.cantidad,
        costo: cd?.costo ?? "0",
        importe: cd?.importe ?? "0",
        fechaPrecio: cd?.fecha_precio ?? null,
        usaCostoNacional: cd?.usa_costo_nacional ?? false,
      };
    }
    const info = categoriaPorId[d.detalle_insumo_id] ?? cuadrillaPorId[d.detalle_insumo_id];
    return {
      id: d.id,
      clave: info?.clave ?? d.detalle_insumo_id,
      descripcion: info?.descripcion ?? "",
      unidad: simboloPorUnidadId[unidadDeOperacion(d.detalle_insumo_id)] ?? "",
      cantidad: d.cantidad,
      costo: cd?.costo ?? "0",
      importe: cd?.importe ?? "0",
      fechaPrecio: cd?.fecha_precio ?? null,
      usaCostoNacional: cd?.usa_costo_nacional ?? false,
      fechaSalarioVigente: categoriaPorId[d.detalle_insumo_id]?.salario_vigente?.fecha_vigencia_desde,
    };
  };

  const etiquetaDetalle = (lista: EquipoCostoHorarioDetalle[], id: string): RowLabel | null => {
    const detalle = lista.find((d) => d.id === id);
    if (!detalle) return null;
    const fila = aFila(detalle);
    return {
      title: nombreDetalle(detalle),
      quantity: fmtCantidad(detalle.cantidad),
      unit: fila.unidad,
      cost: fila.costo !== "0" ? `$${fmt(fila.costo)}` : undefined,
    };
  };

  const dragConsumos = useRowDrag({
    ids: consumos.map((d) => d.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(consumos, id, dest),
    label: (id) => etiquetaDetalle(consumos, id),
  });
  const dragOperaciones = useRowDrag({
    ids: operaciones.map((d) => d.id),
    enabled: true,
    onMove: (id, dest) => void reordenar(operaciones, id, dest),
    label: (id) => etiquetaDetalle(operaciones, id),
  });
  const dragPorTipo: Record<TipoEquipoDetalle, ReturnType<typeof useRowDrag>> = {
    consumo: dragConsumos,
    operacion: dragOperaciones,
  };

  const agregarComponente = async (tipo: TipoEquipoDetalle, id: string) => {
    if (!id) return;
    setError(null);
    try {
      let actualizado: EquipoCostoHorario;
      if (tipo === "consumo") {
        actualizado = await createEquipoCostoHorarioDetalle(equipo.id, {
          detalle_insumo_id: id,
          cantidad: "1",
          naturaleza: "combustible",
        });
      } else {
        const orgActiva = organizaciones.find((o) => o.id === organizacionActivaId);
        const horasJornada = Number(orgActiva?.horas_jornada) || 8;
        actualizado = await createEquipoCostoHorarioDetalle(equipo.id, {
          detalle_insumo_id: id,
          cantidad: String(1 / horasJornada),
        });
      }
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

  const guardarNaturaleza = async (detalle: EquipoCostoHorarioDetalle, naturaleza: NaturalezaConsumoEquipoCostoHorario) => {
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

  const cfCambio = useMemo(() => JSON.stringify(camposCf) !== JSON.stringify(aCamposCf(totales)), [camposCf, totales]);

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

  const abrirAgregar = (tipo: TipoEquipoDetalle) => {
    setAgregandoTipo(tipo);
    setGruposColapsados((prev) => {
      if (!prev.has(tipo)) return prev;
      const next = new Set(prev);
      next.delete(tipo);
      return next;
    });
  };

  const gruposDef: { tipo: TipoEquipoDetalle; titulo: string; Icono: typeof APP_ICONS.grupo_consumo.icono; color: string; opciones: { id: string; label: string }[] }[] = [
    { tipo: "consumo", titulo: APP_ICONS.grupo_consumo.titulo, Icono: APP_ICONS.grupo_consumo.icono, color: APP_ICONS.grupo_consumo.color, opciones: opcionesConsumo },
    { tipo: "operacion", titulo: APP_ICONS.grupo_operacion.titulo, Icono: APP_ICONS.grupo_operacion.icono, color: APP_ICONS.grupo_operacion.color, opciones: opcionesOperacion },
  ];

  return (
    <div className="w-full">
      <div className="rounded-lg border-2 border-foreground/20 bg-card shadow-sm">
        {(cargando || recalculando) && (
          <div aria-hidden className="h-[3px] overflow-hidden rounded-t-lg bg-primary/25">
            <div className="indeterminate-progress-bar h-full w-1/3 rounded-full bg-primary" />
          </div>
        )}

        <EncabezadoAnalisis
          tituloAnalisis="Análisis de costo horario"
          IconoTitulo={APP_ICONS.insumo_costo_horario.icono}
          colorTitulo={APP_ICONS.insumo_costo_horario.color}
          clave={totales.clave}
          descripcion={totales.descripcion}
          simboloUnidad={simboloUnidad}
          regionVistaId={regionVistaId}
          nombreRegionVista={zonas.find((z) => z.regionId === regionVistaId)?.nombre ?? "Nacional"}
          segmentos={[
            { pct: pctFijo, Icono: APP_ICONS.grupo_cargos_fijos.icono, color: APP_ICONS.grupo_cargos_fijos.color, bg: APP_ICONS.grupo_cargos_fijos.bg, etiqueta: "Fijo" },
            { pct: pctConsumo, Icono: APP_ICONS.grupo_consumo.icono, color: APP_ICONS.grupo_consumo.color, bg: APP_ICONS.grupo_consumo.bg, etiqueta: "Consumo" },
            { pct: pctOperacion, Icono: APP_ICONS.grupo_operacion.icono, color: APP_ICONS.grupo_operacion.color, bg: APP_ICONS.grupo_operacion.bg, etiqueta: "Operación" },
          ]}
          gruposDef={gruposDef}
          onAbrirAgregar={abrirAgregar}
          onExpandirTodos={() => setGruposColapsados(new Set())}
          onColapsarTodos={() => setGruposColapsados(new Set(gruposDef.map((g) => g.tipo)))}
          recalculando={recalculando}
          sincronizadoEn={sincronizadoEn}
          onRecalcular={() => void recalcularZonas()}
          notaRecalcular="Recalcular todas las regiones con los precios y salarios vigentes."
        />

        {/* Cargos fijos */}
        <div className="border-b-2 border-foreground/20 p-4">
          <div className="grid grid-cols-[3fr_2fr] gap-6">
            <div className="flex flex-col gap-1.5 text-xs">
              <FilaCf label="Costo de la máquina (Cm)">
                <CurrencyInput value={camposCf.cf_costo_maquina} onCommit={(v) => redondearCampoCf("cf_costo_maquina", v)} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="Valor de las llantas (Pn)">
                <CurrencyInput value={camposCf.cf_valor_llantas} onCommit={(v) => redondearCampoCf("cf_valor_llantas", v)} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="Valor de las piezas especiales (Pa)">
                <CurrencyInput value={camposCf.cf_valor_piezas_especiales} onCommit={(v) => redondearCampoCf("cf_valor_piezas_especiales", v)} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="Valor de la máquina (Vm)" destacado>
                <ValorCf valor={totales.cf_valor_maquina} />
              </FilaCf>
              <FilaCf label="Horas efectivas al año (Hea)">
                <QuantityInput value={camposCf.cf_horas_uso_anual} onCommit={(v) => redondearCampoCf("cf_horas_uso_anual", v)} decimals={2} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="Vida Económica (V)">
                <QuantityInput value={camposCf.cf_vida_economica_anios} onCommit={(v) => redondearCampoCf("cf_vida_economica_anios", v)} decimals={2} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="Tasa de Seguro (s)">
                <QuantityInput value={camposCf.cf_tasa_seguros_anual_porcentaje} onCommit={(v) => redondearCampoCf("cf_tasa_seguros_anual_porcentaje", v)} decimals={2} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="% de Mantenimiento (Ko)">
                <QuantityInput value={camposCf.cf_mantenimiento_porcentaje} onCommit={(v) => redondearCampoCf("cf_mantenimiento_porcentaje", v)} decimals={2} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="% de Rescate (r)">
                <QuantityInput value={camposCf.cf_valor_rescate_porcentaje} onCommit={(v) => redondearCampoCf("cf_valor_rescate_porcentaje", v)} decimals={2} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="Tasa de Interés (i)">
                <QuantityInput value={camposCf.cf_tasa_interes_anual_porcentaje} onCommit={(v) => redondearCampoCf("cf_tasa_interes_anual_porcentaje", v)} decimals={2} className="w-28 shrink-0" />
              </FilaCf>
              <FilaCf label="Vr = Vm × r">
                <ValorCf valor={totales.cf_valor_rescate} />
              </FilaCf>
              <FilaCf label="Ve = V × Hea">
                <ValorCf valor={totales.cf_vida_util_horas} moneda={false} />
              </FilaCf>
            </div>

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
                  <APP_ICONS.grupo_cargos_fijos.icono size={16} className={APP_ICONS.grupo_cargos_fijos.color} />
                  {APP_ICONS.grupo_cargos_fijos.titulo}
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
          <TablaReceta
            columnas={{ mostrarNaturaleza: true }}
            mostrarFechaPrecio={mostrarFechaPrecio}
            onToggleFechaPrecio={() => setMostrarFechaPrecio((v) => !v)}
          >
            <RecetaGrupoTabla
              titulo={APP_ICONS.grupo_consumo.titulo}
              Icono={APP_ICONS.grupo_consumo.icono}
              color={APP_ICONS.grupo_consumo.color}
              filas={consumos.map(aFila)}
              columnas={{ mostrarNaturaleza: true }}
              agregando={agregandoTipo === "consumo"}
              onCerrarAgregar={() => setAgregandoTipo(null)}
              opciones={opcionesConsumo}
              onAgregar={(id) => void agregarComponente("consumo", id)}
              onQuitar={(fila) => {
                const d = consumos.find((x) => x.id === fila.id);
                if (d) setPendingQuitar(d);
              }}
              onCommitCantidad={(id, v) => {
                const d = consumos.find((x) => x.id === id);
                if (d) void guardarCantidad(d, v);
              }}
              mostrarFechaPrecio={mostrarFechaPrecio}
              destello={null}
              drag={dragPorTipo.consumo}
              subtotal={costoSeleccionado?.subtotal_consumo ?? "0"}
              colapsado={gruposColapsados.has("consumo") && agregandoTipo !== "consumo"}
              onToggleColapsado={() =>
                setGruposColapsados((prev) => {
                  const next = new Set(prev);
                  if (next.has("consumo")) next.delete("consumo");
                  else next.add("consumo");
                  return next;
                })
              }
              nombreRegionVista={nombreRegionVista}
              renderNaturaleza={(f) => {
                const d = consumos.find((x) => x.id === f.id);
                if (!d) return null;
                return (
                  <ComboNaturaleza
                    valor={(d.naturaleza as NaturalezaConsumoEquipoCostoHorario | null) ?? "combustible"}
                    onElegir={(naturaleza) => void guardarNaturaleza(d, naturaleza)}
                  />
                );
              }}
            />
            <RecetaGrupoTabla
              titulo={APP_ICONS.grupo_operacion.titulo}
              Icono={APP_ICONS.grupo_operacion.icono}
              color={APP_ICONS.grupo_operacion.color}
              filas={operaciones.map(aFila)}
              columnas={{ mostrarNaturaleza: true }}
              agregando={agregandoTipo === "operacion"}
              onCerrarAgregar={() => setAgregandoTipo(null)}
              opciones={opcionesOperacion}
              onAgregar={(id) => void agregarComponente("operacion", id)}
              onQuitar={(fila) => {
                const d = operaciones.find((x) => x.id === fila.id);
                if (d) setPendingQuitar(d);
              }}
              onCommitCantidad={(id, v) => {
                const d = operaciones.find((x) => x.id === id);
                if (d) void guardarCantidad(d, v);
              }}
              mostrarFechaPrecio={mostrarFechaPrecio}
              destello={null}
              drag={dragPorTipo.operacion}
              subtotal={costoSeleccionado?.subtotal_operacion ?? "0"}
              colapsado={gruposColapsados.has("operacion") && agregandoTipo !== "operacion"}
              onToggleColapsado={() =>
                setGruposColapsados((prev) => {
                  const next = new Set(prev);
                  if (next.has("operacion")) next.delete("operacion");
                  else next.add("operacion");
                  return next;
                })
              }
              nombreRegionVista={nombreRegionVista}
              renderNaturaleza={(f) => {
                const d = operaciones.find((x) => x.id === f.id);
                if (!d) return null;
                return <IconoNaturalezaOperacion naturaleza={d.naturaleza} />;
              }}
            />
          </TablaReceta>

          {cargando && detalles.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">Cargando…</p>}
        </div>

        <div className="flex items-center justify-between rounded-b-lg border-t-2 border-foreground/20 bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-widest">Costo horario total</span>
          <span className="text-xl font-bold tabular-nums">${fmt(costoSeleccionado?.costo_total ?? "0")}/hr</span>
        </div>
      </div>

      <CostoPorRegionCard
        colapsable
        rows={[
          { etiqueta: APP_ICONS.grupo_consumo.titulo, extraer: (c) => c?.subtotal_consumo },
          { etiqueta: APP_ICONS.grupo_operacion.titulo, extraer: (c) => c?.subtotal_operacion },
        ]}
        zonas={zonas}
        regionVistaId={regionVistaId}
        onVerRegion={verRegion}
        coberturaPorCostoId={coberturaPorCostoId}
        totalFilas={detalles.length}
      />

      {dragConsumos.preview}
      {dragOperaciones.preview}

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
