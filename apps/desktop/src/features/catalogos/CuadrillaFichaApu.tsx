import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, HardHat, MapPin, Plus, RefreshCcw, Trash2, Users, Wrench, X } from "lucide-react";
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
  }, [cuadrilla.id]);

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
    if (costoSeleccionadoId) await listCuadrillaCostoDetalles(costoSeleccionadoId).then(setCostoDetalles).catch(() => {});
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
      await updateCuadrillaCostoDetalle(cd.id, { cantidad: String(redondeada) });
      await trasMutarCantidad();
    } catch (e) {
      setError(String(e));
    }
  };

  const mover = async (detalle: CuadrillaDetalle, direccion: DireccionMovimiento) => {
    setError(null);
    try {
      await moveCuadrillaDetalle(detalle.id, direccion);
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

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
            <Users size={11} className="text-emerald-500" />
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

          <div className="flex items-center gap-2">
            <MapPin size={11} className="text-muted-foreground" />
            <Select value={costoSeleccionadoId ?? ""} onValueChange={(v) => setCostoSeleccionadoId(v || null)}>
              <SelectTrigger size="sm" className="w-[220px] rounded border border-border bg-background px-1.5 py-0.5 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {costos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.region_id ? (nombrePorRegionId[c.region_id] ?? c.region_id) : NACIONAL}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!esNacional && (
              <button
                type="button"
                title="Eliminar valuación regional"
                onClick={() => setConfirmandoEliminarValuacion(true)}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={12} />
              </button>
            )}
            {!creandoRegion ? (
              regionesSinValuacion.length > 0 && (
                <button
                  type="button"
                  title="Crear valuación regional"
                  onClick={() => setCreandoRegion(true)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus size={12} />
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
            <button
              type="button"
              title="Recalcular costos de la valuación desde los insumos vigentes"
              onClick={() => void recalcular()}
              disabled={recalculando}
              className={cn(
                "ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                recalculando && "opacity-50",
              )}
            >
              <RefreshCcw size={12} className={cn(recalculando && "animate-spin")} />
            </button>
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

            {/* MANO DE OBRA */}
            <tbody>
              <tr>
                <td colSpan={7} className="pt-2 pb-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <HardHat size={12} className="text-blue-500" />
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
                  <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
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
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">${fmt(cd?.costo ?? "0")}</td>
                    <td className="py-1 text-right font-medium tabular-nums">${fmt(cd?.importe ?? "0")}</td>
                    <td className="py-1 text-right">
                      {esNacional && (
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
                            disabled={i === integrantes.length - 1}
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
                      )}
                    </td>
                  </tr>
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
                        className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <Plus size={11} /> Agregar renglón
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
                    <Wrench size={12} className="text-amber-500" />
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
                  <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
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
                    <td className="py-1 text-right font-medium tabular-nums">${fmt(cd?.importe ?? "0")}</td>
                    <td className="py-1 text-right">
                      {esNacional && (
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
                            disabled={i === herramientaDetalles.length - 1}
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
                      )}
                    </td>
                  </tr>
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
                        className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <Plus size={11} /> Agregar renglón
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
        <div className="flex items-center justify-between rounded-b-lg border-t-2 border-foreground/20 bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-widest">Costo directo</span>
          <span className="text-xl font-bold tabular-nums">${fmt(costoSeleccionado?.costo_total ?? "0")}</span>
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
