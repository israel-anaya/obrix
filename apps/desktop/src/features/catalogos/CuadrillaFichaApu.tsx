import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, HardHat, Plus, RefreshCcw, Users, Wrench, X } from "lucide-react";
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
import {
  createCuadrillaDetalle,
  deleteCuadrillaDetalle,
  listCategoriasFasar,
  listCuadrillaDetalles,
  listHerramientas,
  listUnidadesMedida,
  moveCuadrillaDetalle,
  recalculateCuadrilla,
  updateCuadrillaDetalle,
} from "@/lib/tauri";
import type {
  CategoriaFasar,
  Cuadrilla,
  CuadrillaDetalle,
  DireccionMovimiento,
  Herramienta,
  UnidadMedida,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function fmt(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * "Ficha" de una cuadrilla — reproduce la tarjeta de análisis de precio
 * unitario (APU) que cualquier ingeniero de costos mexicano reconoce de
 * memoria: encabezado con clave/descripción/unidad, dos tablas formales
 * (mano de obra, herramienta) con su subtotal, y el costo total como un
 * renglón final destacado. Las celdas de cantidad se editan directamente en
 * la tabla — sin steppers ni carrito — igual que se captura un análisis en
 * una hoja de cálculo. Enfoque alterno a `CuadrillaDetallePanel` (grid):
 * mismos comandos de Tauri, mismo recálculo de subtotales en el backend.
 *
 * Agregar/editar/eliminar la cuadrilla en sí (no su composición) vive en la
 * barra de acciones de `CuadrillasFicha`, junto al buscador — este
 * componente solo la muestra y administra su composición.
 */
export function CuadrillaFichaApu({
  cuadrilla,
  onCambio,
}: {
  cuadrilla: Cuadrilla;
  onCambio: () => void;
}) {
  const [detalles, setDetalles] = useState<CuadrillaDetalle[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [totales, setTotales] = useState<Cuadrilla>(cuadrilla);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregandoIntegrante, setAgregandoIntegrante] = useState(false);
  const [agregandoHerramienta, setAgregandoHerramienta] = useState(false);
  const [pendingQuitar, setPendingQuitar] = useState<CuadrillaDetalle | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  useEffect(() => {
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listHerramientas().then(setHerramientas).catch(() => {});
    listUnidadesMedida().then(setUnidades).catch(() => {});
  }, []);

  useEffect(() => {
    setTotales(cuadrilla);
  }, [cuadrilla]);

  useEffect(() => {
    setAgregandoIntegrante(false);
    setAgregandoHerramienta(false);
  }, [cuadrilla.id]);

  const cargarDetalles = (id: string) =>
    listCuadrillaDetalles(id)
      .then(setDetalles)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    setCargando(true);
    setError(null);
    cargarDetalles(cuadrilla.id).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuadrilla.id]);

  const trasMutar = async (cuadrillaActualizada: Cuadrilla) => {
    setTotales(cuadrillaActualizada);
    onCambio();
    await cargarDetalles(cuadrilla.id);
  };

  const recalcular = async () => {
    setRecalculando(true);
    setError(null);
    try {
      const actualizada = await recalculateCuadrilla(cuadrilla.id);
      await trasMutar(actualizada);
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
      const actualizada = await createCuadrillaDetalle(cuadrilla.id, { detalle_insumo_id: id, cantidad: "1" });
      await trasMutar(actualizada);
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
      const actualizada = await createCuadrillaDetalle(cuadrilla.id, {
        detalle_insumo_id: id,
        cantidad: String(herramienta?.porcentaje_mano_obra ?? 0),
      });
      await trasMutar(actualizada);
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
    // Mano de obra (número de integrantes, puede ser fraccionario) a 6
    // decimales; herramienta es un porcentaje 0-100, con 2 basta.
    const decimales = detalle.tipo === "categoria_fasar" ? 6 : 2;
    const redondeada = Number(numero.toFixed(decimales));
    if (redondeada === Number(detalle.cantidad)) return;
    setError(null);
    try {
      const actualizada = await updateCuadrillaDetalle(detalle.id, {
        detalle_insumo_id: detalle.detalle_insumo_id,
        cantidad: String(redondeada),
      });
      await trasMutar(actualizada);
    } catch (e) {
      setError(String(e));
    }
  };

  const mover = async (detalle: CuadrillaDetalle, direccion: DireccionMovimiento) => {
    setError(null);
    try {
      const actualizada = await moveCuadrillaDetalle(detalle.id, direccion);
      await trasMutar(actualizada);
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
      const actualizada = await deleteCuadrillaDetalle(pendingQuitar.id);
      setPendingQuitar(null);
      await trasMutar(actualizada);
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
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Users size={11} className="text-emerald-500" />
              Análisis de cuadrilla
            </span>
            <button
              type="button"
              title="Recalcular costos de la cuadrilla desde los insumos vigentes"
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

          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-mono text-lg font-bold tracking-tight">{totales.clave}</span>
            <span className="truncate text-sm text-foreground">{totales.descripcion}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              Unidad: <span className="font-medium text-foreground">{simboloUnidad}</span>
            </span>
          </div>
        </div>

        {error && <p className="px-4 py-1 text-xs text-destructive">{error}</p>}

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
              {integrantes.map((d, i) => (
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
                      value={d.cantidad}
                      onCommit={(v) => void guardarCantidad(d, v)}
                      decimals={6}
                      className="w-24 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
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
                  </td>
                </tr>
              ))}
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
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={5} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal mano de obra
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(totales.sub_total_mano_obra)}</td>
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
              {herramientaDetalles.map((d, i) => (
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
                      value={d.cantidad}
                      onCommit={(v) => void guardarCantidad(d, v)}
                      decimals={2}
                      className="w-16 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
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
                  </td>
                </tr>
              ))}
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
              <tr className="border-t-2 border-foreground/30 font-semibold">
                <td colSpan={5} className="py-1.5 pr-2 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subtotal herramienta
                </td>
                <td className="py-1.5 text-right tabular-nums">${fmt(totales.sub_total_herramienta)}</td>
                <td />
              </tr>
            </tbody>
          </table>

          {cargando && detalles.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">Cargando…</p>}
        </div>

        {/* Costo total */}
        <div className="flex items-center justify-between rounded-b-lg border-t-2 border-foreground/20 bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-widest">Costo directo</span>
          <span className="text-xl font-bold tabular-nums">${fmt(totales.costo_total)}</span>
        </div>
      </div>

      <AlertDialog open={pendingQuitar !== null} onOpenChange={(open) => !open && setPendingQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este renglón de la cuadrilla?</AlertDialogTitle>
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
