import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Fuel, Gauge, HardHat, Plus, RefreshCcw, Timer, X } from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import {
  createEquipoCostoHorarioDetalle,
  deleteEquipoCostoHorarioDetalle,
  listCategoriasFasar,
  listCuadrillas,
  listEquipoCostoHorarioDetalles,
  listMateriales,
  listUnidadesMedida,
  moveEquipoCostoHorarioDetalle,
  recalculateEquipoCostoHorario,
  updateEquipoCostoHorario,
  updateEquipoCostoHorarioDetalle,
} from "@/lib/tauri";
import type {
  CategoriaFasar,
  Cuadrilla,
  DireccionMovimiento,
  EquipoCostoHorario,
  EquipoCostoHorarioDetalle,
  Material,
  UnidadMedida,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function fmt(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
 * comandos de Tauri, mismo recálculo en el backend.
 *
 * Agregar/editar/eliminar el equipo en sí (identidad: clave/descripción/
 * unidad/familia/región) vive en la barra de acciones de
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
  const [detalles, setDetalles] = useState<EquipoCostoHorarioDetalle[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [totales, setTotales] = useState<EquipoCostoHorario>(equipo);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregandoConsumo, setAgregandoConsumo] = useState(false);
  const [agregandoOperacion, setAgregandoOperacion] = useState(false);
  const [pendingQuitar, setPendingQuitar] = useState<EquipoCostoHorarioDetalle | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  const [camposCf, setCamposCf] = useState<CamposCf>(() => aCamposCf(equipo));
  const [guardandoCf, setGuardandoCf] = useState(false);

  useEffect(() => {
    listMateriales().then(setMateriales).catch(() => {});
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listCuadrillas().then(setCuadrillas).catch(() => {});
    listUnidadesMedida().then(setUnidades).catch(() => {});
  }, []);

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

  const cargarDetalles = (id: string) =>
    listEquipoCostoHorarioDetalles(id)
      .then(setDetalles)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    setCargando(true);
    setError(null);
    cargarDetalles(equipo.id).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipo.id]);

  const trasMutar = async (equipoActualizado: EquipoCostoHorario) => {
    setTotales(equipoActualizado);
    setCamposCf(aCamposCf(equipoActualizado));
    onCambio();
    await cargarDetalles(equipo.id);
  };

  const recalcular = async () => {
    setRecalculando(true);
    setError(null);
    try {
      const actualizado = await recalculateEquipoCostoHorario(equipo.id);
      await trasMutar(actualizado);
    } catch (e) {
      setError(String(e));
    } finally {
      setRecalculando(false);
    }
  };

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
  const subtotalConsumo = useMemo(() => consumos.reduce((acc, d) => acc + Number(d.importe), 0), [consumos]);
  const subtotalOperacion = useMemo(() => operaciones.reduce((acc, d) => acc + Number(d.importe), 0), [operaciones]);

  const agregarConsumo = async (id: string) => {
    setAgregandoConsumo(false);
    if (!id) return;
    setError(null);
    try {
      const actualizado = await createEquipoCostoHorarioDetalle(equipo.id, { detalle_insumo_id: id, cantidad: "1" });
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
    const numero = Number(valorTexto);
    if (!Number.isFinite(numero) || numero < 0) {
      setError("La cantidad debe ser un número mayor o igual a 0.");
      return;
    }
    const redondeada = Number(numero.toFixed(6));
    setError(null);
    try {
      const actualizado = await updateEquipoCostoHorarioDetalle(detalle.id, {
        detalle_insumo_id: detalle.detalle_insumo_id,
        cantidad: String(redondeada),
      });
      await trasMutar(actualizado);
    } catch (e) {
      setError(String(e));
    }
  };

  const mover = async (detalle: EquipoCostoHorarioDetalle, direccion: DireccionMovimiento) => {
    setError(null);
    try {
      const actualizado = await moveEquipoCostoHorarioDetalle(detalle.id, direccion);
      await trasMutar(actualizado);
    } catch (e) {
      setError(String(e));
    }
  };

  const nombreDetalle = (detalle: EquipoCostoHorarioDetalle) =>
    detalle.tipo === "consumo"
      ? (opcionPorMaterialId[detalle.detalle_insumo_id] ?? detalle.detalle_insumo_id)
      : (opcionPorOperacionId[detalle.detalle_insumo_id] ?? detalle.detalle_insumo_id);

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
        region_id: totales.region_id,
        ...camposCf,
      });
      setTotales(actualizado);
      setCamposCf(aCamposCf(actualizado));
      onCambio();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardandoCf(false);
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
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Gauge size={11} className="text-emerald-500" />
              Análisis de costo horario
            </span>
            <button
              type="button"
              title="Recalcular costos desde los insumos vigentes"
              onClick={() => void recalcular()}
              disabled={recalculando}
              className={cn(
                "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                recalculando && "opacity-50",
              )}
            >
              <RefreshCcw size={12} className={cn(recalculando && "animate-spin")} />
            </button>
          </div>

          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="font-mono text-base font-bold tracking-tight">{totales.clave}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              Unidad: <span className="font-medium text-foreground">{simboloUnidad}</span>
            </span>
          </div>
          <p className="mt-0.5 text-xs text-foreground">{totales.descripcion}</p>
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
                  <Timer size={12} className="text-blue-500" />
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
                <th className="w-20 py-1 pr-2 font-semibold">Código</th>
                <th className="py-1 pr-2 font-semibold">Descripción</th>
                <th className="w-16 py-1 pr-2 font-semibold">Unidad</th>
                <th className="w-20 py-1 pr-2 text-right font-semibold">Cantidad</th>
                <th className="w-24 py-1 pr-2 text-right font-semibold">Costo</th>
                <th className="w-24 py-1 text-right font-semibold">Importe</th>
                <th className="w-6" />
              </tr>
            </thead>

            {/* CONSUMO */}
            <tbody>
              <tr>
                <td colSpan={7} className="pt-2 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Fuel size={12} className="text-amber-500" />
                    Consumo
                  </span>
                </td>
              </tr>
              {consumos.length === 0 && !agregandoConsumo && (
                <tr>
                  <td colSpan={7} className="py-1.5 text-muted-foreground">
                    Sin consumos todavía.
                  </td>
                </tr>
              )}
              {consumos.map((d, i) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1 pr-2 font-mono text-muted-foreground">
                    {materialPorId[d.detalle_insumo_id]?.clave ?? d.detalle_insumo_id}
                  </td>
                  <td className="py-1 pr-2">{materialPorId[d.detalle_insumo_id]?.descripcion ?? ""}</td>
                  <td className="py-1 pr-2 text-muted-foreground">
                    {simboloPorUnidadId[materialPorId[d.detalle_insumo_id]?.unidad_id ?? ""] ?? ""}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <input
                      key={`${d.id}-${d.cantidad}`}
                      type="number"
                      min={0}
                      step={0.000001}
                      defaultValue={Number(d.cantidad).toFixed(6)}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== "" && Number(e.target.value) !== Number(d.cantidad)) {
                          void guardarCantidad(d, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="campo-decimal w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums hover:border-border focus:border-border focus:bg-background"
                    />
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">${fmt(d.costo)}</td>
                  <td className="py-1 text-right font-medium tabular-nums">${fmt(d.importe)}</td>
                  <td className="py-1 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        title="Subir"
                        disabled={i === 0}
                        onClick={() => void mover(d, "arriba")}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        title="Bajar"
                        disabled={i === consumos.length - 1}
                        onClick={() => void mover(d, "abajo")}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        title="Quitar"
                        onClick={() => setPendingQuitar(d)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={7} className="pt-1.5">
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
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <Plus size={11} /> Agregar renglón
                    </button>
                  )}
                </td>
              </tr>
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={5} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal consumo
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(String(subtotalConsumo))}</td>
                <td />
              </tr>
            </tbody>

            {/* OPERACIÓN */}
            <tbody>
              <tr>
                <td colSpan={7} className="pt-3 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <HardHat size={12} className="text-violet-500" />
                    Operación
                  </span>
                </td>
              </tr>
              {operaciones.length === 0 && !agregandoOperacion && (
                <tr>
                  <td colSpan={7} className="py-1.5 text-muted-foreground">
                    Sin operación todavía.
                  </td>
                </tr>
              )}
              {operaciones.map((d, i) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1 pr-2 font-mono text-muted-foreground">
                    {(categoriaPorId[d.detalle_insumo_id] ?? cuadrillaPorId[d.detalle_insumo_id])?.clave ??
                      d.detalle_insumo_id}
                  </td>
                  <td className="py-1 pr-2">
                    {(categoriaPorId[d.detalle_insumo_id] ?? cuadrillaPorId[d.detalle_insumo_id])?.descripcion ?? ""}
                  </td>
                  <td className="py-1 pr-2 text-muted-foreground">
                    {simboloPorUnidadId[unidadDeOperacion(d.detalle_insumo_id)] ?? ""}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <input
                      key={`${d.id}-${d.cantidad}`}
                      type="number"
                      min={0}
                      step={0.000001}
                      defaultValue={Number(d.cantidad).toFixed(6)}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== "" && Number(e.target.value) !== Number(d.cantidad)) {
                          void guardarCantidad(d, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="campo-decimal w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums hover:border-border focus:border-border focus:bg-background"
                    />
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">${fmt(d.costo)}</td>
                  <td className="py-1 text-right font-medium tabular-nums">${fmt(d.importe)}</td>
                  <td className="py-1 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        title="Subir"
                        disabled={i === 0}
                        onClick={() => void mover(d, "arriba")}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        title="Bajar"
                        disabled={i === operaciones.length - 1}
                        onClick={() => void mover(d, "abajo")}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        title="Quitar"
                        onClick={() => setPendingQuitar(d)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={7} className="pt-1.5">
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
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <Plus size={11} /> Agregar renglón
                    </button>
                  )}
                </td>
              </tr>
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={5} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal operación
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(String(subtotalOperacion))}</td>
                <td />
              </tr>
            </tbody>
          </table>

          {cargando && detalles.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">Cargando…</p>}
        </div>

        {/* Costo total */}
        <div className="flex items-center justify-between rounded-b-lg border-t-2 border-foreground/20 bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-widest">Costo horario total</span>
          <span className="text-xl font-bold tabular-nums">${fmt(totales.costo_horario_total)}/hr</span>
        </div>
      </div>

      <AlertDialog open={pendingQuitar !== null} onOpenChange={(open) => !open && setPendingQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este renglón del equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingQuitar && `Se quitará "${nombreDetalle(pendingQuitar)}". Esta acción no se puede deshacer.`}
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
