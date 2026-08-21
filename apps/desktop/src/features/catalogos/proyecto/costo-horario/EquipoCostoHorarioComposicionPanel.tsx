import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { APP_ICONS } from "@/lib/appIcons";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { toast } from "@/hooks/use-toast";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { formatearFecha } from "@/lib/fecha";
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
  updateEquipoCostoHorarioDetalle,
} from "@/lib/tauri";
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

const ELEGIR_MATERIAL = "— Elige un material —";
const ELEGIR_OPERACION = "— Elige una operación —";
const NACIONAL = "Nacional";
const NACIONAL_VALOR = "__nacional__";

const NATURALEZAS_CONSUMO: { id: NaturalezaConsumoEquipoCostoHorario; etiqueta: string }[] = [
  { id: "combustible", etiqueta: "Combustible" },
  { id: "lubricante", etiqueta: "Lubricante" },
  { id: "llantas", etiqueta: "Llantas" },
  { id: "piezas_especiales", etiqueta: "Piezas especiales" },
  { id: "otras_fuentes", etiqueta: "Otras fuentes" },
];
const ETIQUETA_NATURALEZA_DEFECTO = NATURALEZAS_CONSUMO[0].etiqueta;

/** La naturaleza de operación no se captura: la deriva el backend de la extensión del insumo. */
const ETIQUETA_NATURALEZA_OPERACION: Record<NaturalezaOperacionEquipoCostoHorario, string> = {
  categoria: "Categoría FASAR",
  cuadrilla: "Cuadrilla",
};

function fmt(valor: string, decimales = 2): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/**
 * Panel: composición de un `equipo_costo_horario` — dos matrices planas
 * (consumo, material con su desglose CMIC/RLOPSRM; y operación, categoría
 * FASAR o cuadrilla que opera el equipo, ver diccionario de datos) más los
 * subtotales de la región elegida. Igual que en `cuadrilla`, `cantidad` es de
 * la receta (compartida entre regiones) — solo `costo`/`importe` varían por
 * región. Mismo patrón de matriz plana que `CuadrillaComposicionPanel`.
 */
export function EquipoCostoHorarioComposicionPanel({
  equipo,
  onCerrar,
  onComposicionCambiada,
}: {
  equipo: EquipoCostoHorario | null;
  onCerrar: () => void;
  onComposicionCambiada?: () => void;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const equipoId = equipo?.id ?? null;
  const consumoRef = useRef<DataGridHandle>(null);
  const operacionRef = useRef<DataGridHandle>(null);

  const [detalles, setDetalles] = useState<EquipoCostoHorarioDetalle[]>([]);
  const [costos, setCostos] = useState<EquipoCostoHorarioCosto[]>([]);
  const [costoSeleccionadoId, setCostoSeleccionadoId] = useState<string | null>(null);
  const [costoDetalles, setCostoDetalles] = useState<EquipoCostoHorarioCostoDetalle[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [regionVistaId, setRegionVistaId] = useState<string | null>(null);
  const [consumoSeleccionadoId, setConsumoSeleccionadoId] = useState<string | null>(null);
  const [operacionSeleccionadaId, setOperacionSeleccionadaId] = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    listMateriales().then(setMateriales).catch(() => {});
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listCuadrillas().then(setCuadrillas).catch(() => {});
    listUnidadesMedida().then(setUnidades).catch(() => {});
    listRegiones().then(setRegiones).catch(() => {});
  }, [organizacionActivaId]);

  const cargarDetalles = (id: string) =>
    listEquipoCostoHorarioDetalles(id)
      .then(setDetalles)
      .catch((e) => setError(String(e)));

  const cargarCostos = (id: string) =>
    listEquipoCostoHorarioCostos(id)
      .then((r) => {
        setCostos(r);
        return r;
      })
      .catch((e) => {
        setError(String(e));
        return [] as EquipoCostoHorarioCosto[];
      });

  // Igual que en `CuadrillaComposicionPanel`: se espera un momento a que la
  // selección se quede quieta antes de cargar, para que navegar con flechas
  // por el grid maestro no dispare una consulta por cada fila de paso.
  useEffect(() => {
    if (!equipoId) {
      setDetalles([]);
      setCostos([]);
      setCostoSeleccionadoId(null);
      setCostoDetalles([]);
      setRegionVistaId(null);
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    setCostoSeleccionadoId(null);
    setRegionVistaId(null);
    setConsumoSeleccionadoId(null);
    setOperacionSeleccionadaId(null);
    const espera = setTimeout(() => {
      Promise.all([listEquipoCostoHorarioDetalles(equipoId), listEquipoCostoHorarioCostos(equipoId)])
        .then(([detallesR, costosR]) => {
          if (cancelado) return;
          setDetalles(detallesR);
          setCostos(costosR);
          setCostoSeleccionadoId(costosR.find((c) => c.region_id === null)?.id ?? costosR[0]?.id ?? null);
        })
        .catch((e) => {
          if (!cancelado) setError(String(e));
        })
        .finally(() => {
          if (!cancelado) setCargando(false);
        });
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [equipoId]);

  useEffect(() => {
    if (!costoSeleccionadoId) {
      setCostoDetalles([]);
      return;
    }
    listEquipoCostoHorarioCostoDetalles(costoSeleccionadoId)
      .then(setCostoDetalles)
      .catch((e) => setError(String(e)));
  }, [costoSeleccionadoId]);

  // Toda mutación de la receta devuelve el equipo recalculado (con la
  // valuación nacional al día) — se refleja en el grid maestro vía
  // `onComposicionCambiada`, y aquí se recargan receta + valuaciones +
  // renglones de la valuación seleccionada, porque el backend puede haber
  // tocado más de una.
  const trasMutarReceta = async () => {
    onComposicionCambiada?.();
    if (!equipoId) return;
    await cargarDetalles(equipoId);
    const costosR = await cargarCostos(equipoId);
    const id =
      costosR.find((c) => (c.region_id ?? null) === regionVistaId)?.id ??
      costosR.find((c) => c.region_id === null)?.id ??
      costosR[0]?.id ??
      null;
    setCostoSeleccionadoId(id);
    if (id) {
      await listEquipoCostoHorarioCostoDetalles(id).then(setCostoDetalles).catch(() => {});
    } else {
      setCostoDetalles([]);
    }
  };

  const recalcularZonas = async () => {
    if (!equipoId) return;
    setRecalculando(true);
    setError(null);
    try {
      await recalculateEquipoCostoHorarioZonas(equipoId);
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    } finally {
      setRecalculando(false);
    }
  };

  const costoSeleccionado = costos.find((c) => c.id === costoSeleccionadoId) ?? null;
  const costoTotalNum = Number(costoSeleccionado?.costo_total) || 0;
  const cargoVariableNum = Number(costoSeleccionado?.cargo_variable_hora) || 0;
  const pctFijo = costoTotalNum > 0 ? ((costoTotalNum - cargoVariableNum) / costoTotalNum) * 100 : 0;
  const pctConsumo = costoTotalNum > 0 ? ((Number(costoSeleccionado?.subtotal_consumo) || 0) / costoTotalNum) * 100 : 0;
  const pctOperacion = costoTotalNum > 0 ? ((Number(costoSeleccionado?.subtotal_operacion) || 0) / costoTotalNum) * 100 : 0;
  const sincronizadoEn = useMemo(() => {
    const fechas = costos.map((c) => c.sincronizado_en).filter((f): f is string => !!f);
    if (fechas.length === 0) return null;
    return fechas.sort()[fechas.length - 1] ?? null;
  }, [costos]);

  const elegirRegion = (valor: string) => {
    const regionId = valor === NACIONAL_VALOR ? null : valor;
    setRegionVistaId(regionId);
    const id = costos.find((c) => (c.region_id ?? null) === regionId)?.id ?? null;
    setCostoSeleccionadoId(id);
  };

  const opcionPorMaterialId = useMemo(
    () => Object.fromEntries(materiales.map((m) => [m.id, `${m.clave} — ${m.descripcion}`])),
    [materiales],
  );
  const materialIdPorOpcion = useMemo(
    () => Object.fromEntries(materiales.map((m) => [`${m.clave} — ${m.descripcion}`, m.id])),
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
  const operacionIdPorOpcion = useMemo(
    () =>
      Object.fromEntries([
        ...categorias.map((c) => [`${c.clave} — ${c.descripcion}`, c.id]),
        ...cuadrillas.map((c) => [`${c.clave} — ${c.descripcion}`, c.id]),
      ]),
    [categorias, cuadrillas],
  );
  const categoriaPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const cuadrillaPorId = useMemo(() => Object.fromEntries(cuadrillas.map((c) => [c.id, c])), [cuadrillas]);
  const simboloPorUnidadId = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    [unidades],
  );
  const unidadDeOperacion = (detalleInsumoId: string) =>
    categoriaPorId[detalleInsumoId]?.unidad_id ?? cuadrillaPorId[detalleInsumoId]?.unidad_id ?? "";

  const idsUsados = useMemo(() => new Set(detalles.map((d) => d.detalle_insumo_id)), [detalles]);
  const opcionesMaterial = useMemo(
    () => [ELEGIR_MATERIAL, ...ordenarPor(materiales.filter((m) => !idsUsados.has(m.id)), (m) => m.clave).map((m) => opcionPorMaterialId[m.id])],
    [materiales, idsUsados, opcionPorMaterialId],
  );
  const opcionesOperacion = useMemo(
    () => [
      ELEGIR_OPERACION,
      ...ordenarPor(categorias.filter((c) => !idsUsados.has(c.id)), (c) => c.clave).map((c) => opcionPorOperacionId[c.id]),
      ...ordenarPor(cuadrillas.filter((c) => !idsUsados.has(c.id)), (c) => c.clave).map((c) => opcionPorOperacionId[c.id]),
    ],
    [categorias, cuadrillas, idsUsados, opcionPorOperacionId],
  );
  const opcionesNaturaleza = useMemo(() => NATURALEZAS_CONSUMO.map((n) => n.etiqueta), []);
  const naturalezaIdPorEtiqueta = useMemo(
    () => Object.fromEntries(NATURALEZAS_CONSUMO.map((n) => [n.etiqueta, n.id])),
    [],
  );
  const etiquetaPorNaturalezaId = useMemo(
    () => Object.fromEntries(NATURALEZAS_CONSUMO.map((n) => [n.id, n.etiqueta])),
    [],
  );

  const costoDetallePorDetalleId = useMemo(
    () => Object.fromEntries(costoDetalles.map((cd) => [cd.equipo_costo_horario_detalle_id, cd])),
    [costoDetalles],
  );

  const consumos = useMemo(
    () => detalles.filter((d) => d.tipo === "consumo").sort((a, b) => a.orden - b.orden),
    [detalles],
  );
  const operaciones = useMemo(
    () => detalles.filter((d) => d.tipo === "operacion").sort((a, b) => a.orden - b.orden),
    [detalles],
  );

  const configConsumo: DataGridConfig = useMemo(
    () => ({
      title: APP_ICONS.grupo_consumo.titulo,
      columns: [
        { field: "material", header: "Material", width: 240, grow: true, readOnlyOnEdit: true, options: opcionesMaterial },
        { field: "naturaleza", header: "Naturaleza", width: 140, options: opcionesNaturaleza, default: ETIQUETA_NATURALEZA_DEFECTO },
        { field: "unidad", header: "Unidad", width: 80, readOnly: true },
        { field: "cantidad", header: "Cantidad", width: 100, numeric: true, decimals: 6 },
        { field: "costo", header: "Costo", width: 120, numeric: true, readOnly: true },
        { field: "fecha_precio", header: "Fecha precio", width: 126, readOnly: true, date: true, hiddenByDefault: true },
        { field: "importe", header: "Importe", width: 110, numeric: true, readOnly: true },
      ],
    }),
    [opcionesMaterial, opcionesNaturaleza],
  );

  const configOperacion: DataGridConfig = useMemo(
    () => ({
      title: APP_ICONS.grupo_operacion.titulo,
      columns: [
        { field: "operacion", header: "Categoría / Cuadrilla", width: 240, grow: true, readOnlyOnEdit: true, options: opcionesOperacion },
        { field: "naturaleza", header: "Naturaleza", width: 140, readOnly: true },
        { field: "unidad", header: "Unidad", width: 80, readOnly: true },
        { field: "cantidad", header: "Cantidad", width: 100, numeric: true, decimals: 6 },
        { field: "costo", header: "Costo", width: 120, numeric: true, readOnly: true },
        { field: "fecha_precio", header: "Fecha precio", width: 126, readOnly: true, date: true, hiddenByDefault: true },
        { field: "importe", header: "Importe", width: 110, numeric: true, readOnly: true },
      ],
    }),
    [opcionesOperacion],
  );

  const filasConsumo: Row[] = useMemo(
    () =>
      consumos.map((d) => {
        const cd = costoDetallePorDetalleId[d.id];
        return {
          _id: d.id,
          material: opcionPorMaterialId[d.detalle_insumo_id] ?? ELEGIR_MATERIAL,
          naturaleza: etiquetaPorNaturalezaId[d.naturaleza ?? "combustible"] ?? ETIQUETA_NATURALEZA_DEFECTO,
          unidad: simboloPorUnidadId[materiales.find((m) => m.id === d.detalle_insumo_id)?.unidad_id ?? ""] ?? "",
          cantidad: Number(d.cantidad),
          costo: `$${fmt(cd?.costo ?? "0")}`,
          fecha_precio: cd?.fecha_precio ?? "",
          importe: `$${fmt(cd?.importe ?? "0")}`,
        };
      }),
    [consumos, costoDetallePorDetalleId, opcionPorMaterialId, etiquetaPorNaturalezaId, simboloPorUnidadId, materiales],
  );

  const filasOperacion: Row[] = useMemo(
    () =>
      operaciones.map((d) => {
        const cd = costoDetallePorDetalleId[d.id];
        return {
          _id: d.id,
          operacion: opcionPorOperacionId[d.detalle_insumo_id] ?? ELEGIR_OPERACION,
          naturaleza:
            (d.naturaleza && ETIQUETA_NATURALEZA_OPERACION[d.naturaleza as NaturalezaOperacionEquipoCostoHorario]) ??
            "",
          unidad: simboloPorUnidadId[unidadDeOperacion(d.detalle_insumo_id)] ?? "",
          cantidad: Number(d.cantidad),
          costo: `$${fmt(cd?.costo ?? "0")}`,
          fecha_precio: cd?.fecha_precio ?? "",
          importe: `$${fmt(cd?.importe ?? "0")}`,
        };
      }),
    [operaciones, costoDetallePorDetalleId, opcionPorOperacionId, simboloPorUnidadId, categoriaPorId, cuadrillaPorId],
  );

  const agregarConsumo = (fila: Row) => {
    if (!equipoId) return Promise.reject(new Error("Selecciona un equipo."));
    const detalleInsumoId = materialIdPorOpcion[String(fila.material)];
    if (!detalleInsumoId || fila.material === ELEGIR_MATERIAL) throw new Error("Elige un material válido.");
    const naturaleza = naturalezaIdPorEtiqueta[String(fila.naturaleza)] ?? "combustible";
    return createEquipoCostoHorarioDetalle(equipoId, {
      detalle_insumo_id: detalleInsumoId,
      cantidad: String(fila.cantidad || "1"),
      naturaleza,
    }).then(trasMutarReceta);
  };

  const agregarOperacion = (fila: Row) => {
    if (!equipoId) return Promise.reject(new Error("Selecciona un equipo."));
    const detalleInsumoId = operacionIdPorOpcion[String(fila.operacion)];
    if (!detalleInsumoId || fila.operacion === ELEGIR_OPERACION) throw new Error("Elige una operación válida.");
    return createEquipoCostoHorarioDetalle(equipoId, {
      detalle_insumo_id: detalleInsumoId,
      cantidad: String(fila.cantidad || "1"),
    }).then(trasMutarReceta);
  };

  const editarConsumo = async (fila: Row) => {
    const detalle = consumos.find((d) => d.id === fila._id);
    if (!detalle) return;
    const cantidad = Number(fila.cantidad);
    const naturaleza = naturalezaIdPorEtiqueta[String(fila.naturaleza)] ?? detalle.naturaleza ?? "combustible";
    if (Number(detalle.cantidad) === cantidad && detalle.naturaleza === naturaleza) return;
    await updateEquipoCostoHorarioDetalle(detalle.id, {
      detalle_insumo_id: detalle.detalle_insumo_id,
      cantidad: String(cantidad),
      naturaleza,
    }).then(trasMutarReceta);
  };

  const editarOperacion = async (fila: Row) => {
    const detalle = operaciones.find((d) => d.id === fila._id);
    if (!detalle) return;
    const cantidad = Number(fila.cantidad);
    if (Number(detalle.cantidad) === cantidad) return;
    await updateEquipoCostoHorarioDetalle(detalle.id, {
      detalle_insumo_id: detalle.detalle_insumo_id,
      cantidad: String(cantidad),
      naturaleza: detalle.naturaleza,
    }).then(trasMutarReceta);
  };

  const indiceConsumo = consumos.findIndex((d) => d.id === consumoSeleccionadoId);
  const indiceOperacion = operaciones.findIndex((d) => d.id === operacionSeleccionadaId);

  const mover = async (id: string | null, direccion: DireccionMovimiento) => {
    if (!id) return;
    setError(null);
    try {
      await moveEquipoCostoHorarioDetalle(id, direccion);
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  const eliminar = async (ids: string[]) => {
    for (const id of ids) await deleteEquipoCostoHorarioDetalle(id);
    await trasMutarReceta();
  };

  return (
    <div className="flex h-full flex-col border-l-2 border-l-primary bg-muted/15">
      <div className="flex items-center gap-3 border-b-2 border-foreground/20 bg-background/80 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <APP_ICONS.insumo_costo_horario.icono size={16} className={APP_ICONS.insumo_costo_horario.color} />
            Composición
          </span>
          <Select value={regionVistaId ?? NACIONAL_VALOR} onValueChange={elegirRegion}>
            <SelectTrigger className="h-7 w-[9.5rem] border-border bg-background px-2 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NACIONAL_VALOR}>
                <span className="flex items-center gap-1.5">
                  <APP_ICONS.region_nacional.icono size={14} className={APP_ICONS.region_nacional.color} />
                  {NACIONAL}
                </span>
              </SelectItem>
              {ordenarPor(regionesVisibles(regiones), (r) => r.nombre).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-1.5">
                    <APP_ICONS.region_otra.icono size={14} className={APP_ICONS.region_otra.color} />
                    {r.nombre}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-5 w-px shrink-0 bg-border" />
        {equipo ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
              title={`Fijo ${pctFijo.toFixed(0)}% / Consumo ${pctConsumo.toFixed(0)}% / Operación ${pctOperacion.toFixed(0)}%`}
            >
              <div className={APP_ICONS.grupo_cargos_fijos.bg} style={{ width: `${pctFijo}%` }} />
              <div className={APP_ICONS.grupo_consumo.bg} style={{ width: `${pctConsumo}%` }} />
              <div className={APP_ICONS.grupo_operacion.bg} style={{ width: `${pctOperacion}%` }} />
            </div>
            <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <APP_ICONS.grupo_cargos_fijos.icono size={16} className={APP_ICONS.grupo_cargos_fijos.color} />
                {pctFijo.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1">
                <APP_ICONS.grupo_consumo.icono size={16} className={APP_ICONS.grupo_consumo.color} />
                {pctConsumo.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1">
                <APP_ICONS.grupo_operacion.icono size={16} className={APP_ICONS.grupo_operacion.color} />
                {pctOperacion.toFixed(0)}%
              </span>
            </span>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="h-5 w-px shrink-0 bg-border" />
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={
              !equipoId
                ? "Selecciona un equipo para sincronizar"
                : recalculando
                  ? "Recalculando costos de todas las regiones…"
                  : [
                      "Recalcular todas las regiones con los precios vigentes.",
                      sincronizadoEn
                        ? `Última sincronización: ${formatearFecha(sincronizadoEn)}`
                        : "Aún no se ha sincronizado con los precios vigentes.",
                    ].join("\n")
            }
            onClick={() => void recalcularZonas()}
            disabled={!equipoId || recalculando}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted",
              (!equipoId || recalculando) && "opacity-50",
              !sincronizadoEn && equipoId && "border-amber-500/40",
            )}
          >
            <RefreshCcw size={16} className={cn(recalculando && "animate-spin")} />
            {recalculando ? "Sincronizando…" : "Sincronizar"}
          </button>
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!equipoId ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona un equipo para ver su composición.</p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border">
              <div className="flex items-center justify-between px-3 py-1.5">
                <h4 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <APP_ICONS.grupo_consumo.icono size={14} className={APP_ICONS.grupo_consumo.color} />
                  {APP_ICONS.grupo_consumo.titulo}
                </h4>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Agregar consumo"
                    onClick={() => consumoRef.current?.addRow()}
                    className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus size={16} />
                    <span className="text-[11px]">Agregar</span>
                  </button>
                  <Separator orientation="vertical" />
                  <button
                    type="button"
                    title="Subir"
                    disabled={indiceConsumo <= 0}
                    onClick={() => void mover(consumoSeleccionadoId, "arriba")}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    title="Bajar"
                    disabled={indiceConsumo < 0 || indiceConsumo >= consumos.length - 1}
                    onClick={() => void mover(consumoSeleccionadoId, "abajo")}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <Separator orientation="vertical" />
                  <button
                    type="button"
                    title="Eliminar consumo"
                    disabled={indiceConsumo < 0}
                    onClick={() => consumoRef.current?.deleteSelectedRows()}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1">
                <DataGrid
                  ref={consumoRef}
                  config={configConsumo}
                  initialRows={filasConsumo}
                  loading={cargando || recalculando}
                  selectionMode="single"
                  enableSorting={false}
                  search=""
                  onSearchChange={() => {}}
                  onRowSelected={(row) => setConsumoSeleccionadoId(row?._id ?? null)}
                  onAddRow={(fila) => agregarConsumo(fila)}
                  onEditRow={(fila) => editarConsumo(fila)}
                  onDeleteRows={(ids) => eliminar(ids)}
                  onSaveError={(mensaje) => setError(mensaje)}
                  onSaveSuccess={() => setError(null)}
                />
              </div>
            </section>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border">
              <div className="flex items-center justify-between px-3 py-1.5">
                <h4 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <APP_ICONS.grupo_operacion.icono size={14} className={APP_ICONS.grupo_operacion.color} />
                  {APP_ICONS.grupo_operacion.titulo}
                </h4>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Agregar operación"
                    onClick={() => operacionRef.current?.addRow()}
                    className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus size={16} />
                    <span className="text-[11px]">Agregar</span>
                  </button>
                  <Separator orientation="vertical" />
                  <button
                    type="button"
                    title="Subir"
                    disabled={indiceOperacion <= 0}
                    onClick={() => void mover(operacionSeleccionadaId, "arriba")}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    title="Bajar"
                    disabled={indiceOperacion < 0 || indiceOperacion >= operaciones.length - 1}
                    onClick={() => void mover(operacionSeleccionadaId, "abajo")}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <Separator orientation="vertical" />
                  <button
                    type="button"
                    title="Eliminar operación"
                    disabled={indiceOperacion < 0}
                    onClick={() => operacionRef.current?.deleteSelectedRows()}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1">
                <DataGrid
                  ref={operacionRef}
                  config={configOperacion}
                  initialRows={filasOperacion}
                  loading={cargando || recalculando}
                  selectionMode="single"
                  enableSorting={false}
                  search=""
                  onSearchChange={() => {}}
                  onRowSelected={(row) => setOperacionSeleccionadaId(row?._id ?? null)}
                  onAddRow={(fila) => agregarOperacion(fila)}
                  onEditRow={(fila) => editarOperacion(fila)}
                  onDeleteRows={(ids) => eliminar(ids)}
                  onSaveError={(mensaje) => setError(mensaje)}
                  onSaveSuccess={() => setError(null)}
                />
              </div>
            </section>

            <section className="shrink-0 p-3">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Totales</h4>
              <dl className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{APP_ICONS.grupo_consumo.titulo}</dt>
                  <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.subtotal_consumo ?? "0")}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{APP_ICONS.grupo_operacion.titulo}</dt>
                  <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.subtotal_operacion ?? "0")}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Cargo variable/hr</dt>
                  <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.cargo_variable_hora ?? "0")}</dd>
                </div>
                <div className={cn("flex items-center justify-between border-t border-border pt-1")}>
                  <dt className="font-semibold">Costo horario total</dt>
                  <dd className="font-semibold tabular-nums">${fmt(costoSeleccionado?.costo_total ?? "0")}</dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
