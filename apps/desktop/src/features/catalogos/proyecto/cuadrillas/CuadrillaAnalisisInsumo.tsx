import { useEffect, useMemo, useState } from "react";
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
import { centavos, fmt, fmtCantidad, fmtPorcentaje } from "../shared/analisis-insumo/formato";
import { ChipDelta } from "../shared/analisis-insumo/Indicadores";
import { useRegionCosts } from "../shared/analisis-insumo/useRegionCosts";
import { CostoPorRegionCard } from "../shared/analisis-insumo/CostoPorRegionCard";
import { EncabezadoAnalisis } from "../shared/analisis-insumo/EncabezadoAnalisis";
import { RecetaGrupoTabla, TablaReceta, type FilaReceta } from "../shared/analisis-insumo/RecetaGrupoTabla";

type TipoCuadrillaDetalle = CuadrillaDetalle["tipo"];

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
export function CuadrillaAnalisisInsumo({
  cuadrilla,
  onCambio,
}: {
  cuadrilla: Cuadrilla;
  onCambio: () => void;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const [detalles, setDetalles] = useState<CuadrillaDetalle[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [agregandoTipo, setAgregandoTipo] = useState<TipoCuadrillaDetalle | null>(null);
  const [pendingQuitar, setPendingQuitar] = useState<CuadrillaDetalle | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [mostrarFechaPrecio, setMostrarFechaPrecio] = useState(false);
  const [destello, setDestello] = useState<{ ticket: number; total: number; filaId: string; fila: number } | null>(null);
  const [gruposColapsados, setGruposColapsados] = useState<Set<TipoCuadrillaDetalle>>(new Set());

  const integrantesParaCobertura = useMemo(() => detalles.filter((d) => d.tipo === "categoria_fasar"), [detalles]);

  const {
    costoDetalles,
    costoSeleccionado,
    regionVistaId,
    zonas,
    coberturaPorCostoId,
    sincronizadoEn,
    cargarCostos,
    verRegion,
  } = useRegionCosts<CuadrillaCosto, CuadrillaCostoDetalle>({
    entityId: cuadrilla.id,
    regiones,
    listCostos: listCuadrillaCostos,
    listCostoDetalles: listCuadrillaCostoDetalles,
    detalleRowId: (cd) => cd.cuadrilla_detalle_id,
    filasCobertura: integrantesParaCobertura,
    onError: (e) => setError(String(e)),
  });

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
    setAgregandoTipo(null);
    setDestello(null);
  }, [cuadrilla.id]);

  useEffect(() => {
    if (!destello) return;
    const t = window.setTimeout(() => setDestello(null), 5000);
    return () => window.clearTimeout(t);
  }, [destello]);

  useEffect(() => {
    setCargando(true);
    setError(null);
    Promise.all([listCuadrillaDetalles(cuadrilla.id), cargarCostos(cuadrilla.id, null)])
      .then(([detallesR]) => setDetalles(detallesR))
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuadrilla.id]);

  const trasMutarReceta = async () => {
    onCambio();
    await listCuadrillaDetalles(cuadrilla.id).then(setDetalles).catch((e) => setError(String(e)));
    await cargarCostos(cuadrilla.id);
  };

  const recalcularZonas = async () => {
    setRecalculando(true);
    setError(null);
    try {
      await recalculateCuadrillaZonas(cuadrilla.id);
      onCambio();
      await cargarCostos(cuadrilla.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setRecalculando(false);
    }
  };

  const costoTotalNum = Number(costoSeleccionado?.costo_total) || 0;
  const pctMo = costoTotalNum > 0 ? ((Number(costoSeleccionado?.sub_total_mano_obra) || 0) / costoTotalNum) * 100 : 0;
  const pctHe = costoTotalNum > 0 ? ((Number(costoSeleccionado?.sub_total_herramienta) || 0) / costoTotalNum) * 100 : 0;

  const simboloUnidad = useMemo(
    () => unidades.find((u) => u.id === cuadrilla.unidad_id)?.simbolo ?? cuadrilla.unidad_id,
    [unidades, cuadrilla.unidad_id],
  );

  const categoriaPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const herramientaPorId = useMemo(() => Object.fromEntries(herramientas.map((h) => [h.id, h])), [herramientas]);
  const simboloPorUnidadId = useMemo(() => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])), [unidades]);
  const costoDetallePorDetalleId = useMemo(
    () => Object.fromEntries(costoDetalles.map((cd) => [cd.cuadrilla_detalle_id, cd])),
    [costoDetalles],
  );

  const idsUsados = useMemo(() => new Set(detalles.map((d) => d.detalle_insumo_id)), [detalles]);
  const opcionesIntegrante = useMemo(
    () =>
      categorias
        .filter((c) => !idsUsados.has(c.id))
        .map((c) => ({ id: c.id, label: `${c.clave} — ${c.descripcion}` })),
    [categorias, idsUsados],
  );
  const opcionesHerramienta = useMemo(
    () =>
      herramientas
        .filter((h) => !idsUsados.has(h.id))
        .map((h) => ({
          id: h.id,
          label: `${h.clave} — ${h.descripcion}${h.porcentaje_mano_obra !== null ? ` (${h.porcentaje_mano_obra}%)` : ""}`,
        })),
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

  const agregarComponente = async (tipo: TipoCuadrillaDetalle, id: string) => {
    setError(null);
    try {
      if (tipo === "categoria_fasar") {
        await createCuadrillaDetalle(cuadrilla.id, { detalle_insumo_id: id, cantidad: "1" });
      } else {
        const herramienta = herramientas.find((h) => h.id === id);
        await createCuadrillaDetalle(cuadrilla.id, {
          detalle_insumo_id: id,
          cantidad: String(herramienta?.porcentaje_mano_obra ?? 0),
        });
      }
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
      await listCuadrillaDetalles(cuadrilla.id).then(setDetalles).catch((e) => setError(String(e)));
      const { costosR, seleccionadoId, porCosto } = await cargarCostos(cuadrilla.id);
      onCambio();
      const nuevosDetalles = seleccionadoId ? (porCosto[seleccionadoId] ?? []) : [];
      const costoTotalNuevo = costosR.find((c) => c.id === seleccionadoId)?.costo_total ?? "0";
      const importeDespues = Number(nuevosDetalles.find((n) => n.cuadrilla_detalle_id === detalle.id)?.importe) || 0;
      const deltaTotal = centavos(Number(costoTotalNuevo) - totalAntes);
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
      ? (categoriaPorId[detalle.detalle_insumo_id] ? `${categoriaPorId[detalle.detalle_insumo_id].clave} — ${categoriaPorId[detalle.detalle_insumo_id].descripcion}` : detalle.detalle_insumo_id)
      : (herramientaPorId[detalle.detalle_insumo_id] ? `${herramientaPorId[detalle.detalle_insumo_id].clave} — ${herramientaPorId[detalle.detalle_insumo_id].descripcion}` : detalle.detalle_insumo_id);

  const aFila = (d: CuadrillaDetalle): FilaReceta => {
    const cd = costoDetallePorDetalleId[d.id];
    if (d.tipo === "categoria_fasar") {
      const categoria = categoriaPorId[d.detalle_insumo_id];
      return {
        id: d.id,
        clave: categoria?.clave ?? d.detalle_insumo_id,
        descripcion: categoria?.descripcion ?? "",
        unidad: simboloPorUnidadId[categoria?.unidad_id ?? ""] ?? "",
        cantidad: d.cantidad,
        costo: cd?.costo ?? "0",
        importe: cd?.importe ?? "0",
        fechaPrecio: cd?.fecha_precio ?? null,
        fechaSalarioVigente: categoria?.salario_vigente?.fecha_vigencia_desde,
      };
    }
    const herramienta = herramientaPorId[d.detalle_insumo_id];
    return {
      id: d.id,
      clave: herramienta?.clave ?? d.detalle_insumo_id,
      descripcion: herramienta?.descripcion ?? "",
      unidad: simboloPorUnidadId[herramienta?.unidad_id ?? ""] ?? "",
      cantidad: d.cantidad,
      costo: cd?.costo ?? "0",
      importe: cd?.importe ?? "0",
      fechaPrecio: cd?.fecha_precio ?? null,
    };
  };

  const etiquetaDetalle = (lista: CuadrillaDetalle[], id: string): RowLabel | null => {
    const detalle = lista.find((d) => d.id === id);
    if (!detalle) return null;
    const fila = aFila(detalle);
    return {
      title: nombreDetalle(detalle),
      quantity: detalle.tipo === "categoria_fasar" ? fmtCantidad(detalle.cantidad) : fmtPorcentaje(detalle.cantidad),
      unit: fila.unidad,
      cost: fila.costo !== "0" ? `$${fmt(fila.costo)}` : undefined,
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
  const dragPorTipo: Record<TipoCuadrillaDetalle, ReturnType<typeof useRowDrag>> = {
    categoria_fasar: dragIntegrantes,
    equipo_herramienta: dragHerramienta,
  };

  const abrirAgregar = (tipo: TipoCuadrillaDetalle) => {
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
      await deleteCuadrillaDetalle(pendingQuitar.id);
      setPendingQuitar(null);
      await trasMutarReceta();
    } catch (e) {
      setPendingQuitar(null);
      setError(String(e));
    }
  };

  const gruposDef: { tipo: TipoCuadrillaDetalle; titulo: string; Icono: typeof APP_ICONS.insumo_categoria_fasar.icono; color: string; opciones: { id: string; label: string }[]; subtotal: string }[] = [
    { tipo: "categoria_fasar", titulo: APP_ICONS.insumo_categoria_fasar.titulo, Icono: APP_ICONS.insumo_categoria_fasar.icono, color: APP_ICONS.insumo_categoria_fasar.color, opciones: opcionesIntegrante, subtotal: costoSeleccionado?.sub_total_mano_obra ?? "0" },
    { tipo: "equipo_herramienta", titulo: APP_ICONS.insumo_herramienta.titulo, Icono: APP_ICONS.insumo_herramienta.icono, color: APP_ICONS.insumo_herramienta.color, opciones: opcionesHerramienta, subtotal: costoSeleccionado?.sub_total_herramienta ?? "0" },
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
          tituloAnalisis="Análisis de cuadrilla"
          IconoTitulo={APP_ICONS.insumo_cuadrilla.icono}
          colorTitulo={APP_ICONS.insumo_cuadrilla.color}
          clave={cuadrilla.clave}
          descripcion={cuadrilla.descripcion}
          simboloUnidad={simboloUnidad}
          regionVistaId={regionVistaId}
          nombreRegionVista={zonas.find((z) => z.regionId === regionVistaId)?.nombre ?? "Nacional"}
          segmentos={[
            { pct: pctMo, Icono: APP_ICONS.insumo_categoria_fasar.icono, color: APP_ICONS.insumo_categoria_fasar.color, bg: APP_ICONS.insumo_categoria_fasar.bg, etiqueta: "MO" },
            { pct: pctHe, Icono: APP_ICONS.insumo_herramienta.icono, color: APP_ICONS.insumo_herramienta.color, bg: APP_ICONS.insumo_herramienta.bg, etiqueta: "Herramienta" },
          ]}
          gruposDef={gruposDef}
          onAbrirAgregar={abrirAgregar}
          onExpandirTodos={() => setGruposColapsados(new Set())}
          onColapsarTodos={() => setGruposColapsados(new Set(gruposDef.map((g) => g.tipo)))}
          recalculando={recalculando}
          sincronizadoEn={sincronizadoEn}
          onRecalcular={() => void recalcularZonas()}
          notaRecalcular="Recalcular todas las regiones con los salarios y la herramienta vigentes."
        />

        <div className="p-4">
          <TablaReceta columnas={{}} mostrarFechaPrecio={mostrarFechaPrecio} onToggleFechaPrecio={() => setMostrarFechaPrecio((v) => !v)}>
            <RecetaGrupoTabla
              titulo={APP_ICONS.insumo_categoria_fasar.titulo}
              Icono={APP_ICONS.insumo_categoria_fasar.icono}
              color={APP_ICONS.insumo_categoria_fasar.color}
              filas={integrantes.map(aFila)}
              columnas={{}}
              agregando={agregandoTipo === "categoria_fasar"}
              onCerrarAgregar={() => setAgregandoTipo(null)}
              opciones={opcionesIntegrante}
              onAgregar={(id) => void agregarComponente("categoria_fasar", id)}
              onQuitar={(fila) => {
                const d = integrantes.find((x) => x.id === fila.id);
                if (d) setPendingQuitar(d);
              }}
              onCommitCantidad={(id, v) => {
                const d = integrantes.find((x) => x.id === id);
                if (d) void guardarCantidad(d, v);
              }}
              mostrarFechaPrecio={mostrarFechaPrecio}
              mostrarDestello
              destello={destello}
              drag={dragPorTipo.categoria_fasar}
              subtotal={costoSeleccionado?.sub_total_mano_obra ?? "0"}
              colapsado={gruposColapsados.has("categoria_fasar") && agregandoTipo !== "categoria_fasar"}
              onToggleColapsado={() =>
                setGruposColapsados((prev) => {
                  const next = new Set(prev);
                  if (next.has("categoria_fasar")) next.delete("categoria_fasar");
                  else next.add("categoria_fasar");
                  return next;
                })
              }
            />
            <RecetaGrupoTabla
              titulo={APP_ICONS.insumo_herramienta.titulo}
              Icono={APP_ICONS.insumo_herramienta.icono}
              color={APP_ICONS.insumo_herramienta.color}
              filas={herramientaDetalles.map(aFila)}
              columnas={{}}
              inputCantidad="porcentaje"
              agregando={agregandoTipo === "equipo_herramienta"}
              onCerrarAgregar={() => setAgregandoTipo(null)}
              opciones={opcionesHerramienta}
              onAgregar={(id) => void agregarComponente("equipo_herramienta", id)}
              onQuitar={(fila) => {
                const d = herramientaDetalles.find((x) => x.id === fila.id);
                if (d) setPendingQuitar(d);
              }}
              onCommitCantidad={(id, v) => {
                const d = herramientaDetalles.find((x) => x.id === id);
                if (d) void guardarCantidad(d, v);
              }}
              mostrarFechaPrecio={mostrarFechaPrecio}
              soportaFechaPrecio={false}
              mostrarDestello
              destello={destello}
              drag={dragPorTipo.equipo_herramienta}
              subtotal={costoSeleccionado?.sub_total_herramienta ?? "0"}
              colapsado={gruposColapsados.has("equipo_herramienta") && agregandoTipo !== "equipo_herramienta"}
              onToggleColapsado={() =>
                setGruposColapsados((prev) => {
                  const next = new Set(prev);
                  if (next.has("equipo_herramienta")) next.delete("equipo_herramienta");
                  else next.add("equipo_herramienta");
                  return next;
                })
              }
            />
          </TablaReceta>

          {cargando && detalles.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">Cargando…</p>}
        </div>

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
            {destello && <ChipDelta key={destello.ticket} valor={destello.total} className="text-sm" />}
            <span className="text-xl font-bold tabular-nums">${fmt(costoSeleccionado?.costo_total ?? "0")}</span>
          </span>
        </div>
      </div>

      <CostoPorRegionCard
        colapsable
        rows={[
          { etiqueta: "Mano de obra", extraer: (c) => c?.sub_total_mano_obra },
          { etiqueta: "Herramienta", extraer: (c) => c?.sub_total_herramienta },
        ]}
        zonas={zonas}
        regionVistaId={regionVistaId}
        onVerRegion={verRegion}
        coberturaPorCostoId={coberturaPorCostoId}
        totalFilas={integrantes.length}
      />

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
