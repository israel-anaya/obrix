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
import { cn } from "@/lib/utils";
import { listUnidadesMedida } from "@/lib/tauri";
import { APP_ICONS } from "@/lib/appIcons";
import { centavos, fmt, fmtCantidad } from "../shared/analisis-insumo/formato";
import { ChipDelta } from "../shared/analisis-insumo/Indicadores";
import { useRegionCosts } from "../shared/analisis-insumo/useRegionCosts";
import { CostoPorRegionCard } from "../shared/analisis-insumo/CostoPorRegionCard";
import { EncabezadoAnalisis } from "../shared/analisis-insumo/EncabezadoAnalisis";
import { RecetaGrupoTabla, TablaReceta, type FilaReceta } from "../shared/analisis-insumo/RecetaGrupoTabla";

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
export function BasicoAuxiliarAnalisisInsumo({
  auxiliar,
  onCambio,
}: {
  auxiliar: BasicoAuxiliar;
  onCambio: () => void;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const [componentes, setComponentes] = useState<BasicoAuxiliarComponente[]>([]);
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
  const [destello, setDestello] = useState<{ ticket: number; total: number; filaId: string; fila: number } | null>(null);
  const [gruposColapsados, setGruposColapsados] = useState<Set<TipoBasicoAuxiliarComponente>>(new Set());
  const todosLosTipos: TipoBasicoAuxiliarComponente[] = ["material", "mano_obra", "equipo_herramienta", "basico_auxiliar"];

  const {
    costoDetalles,
    costoSeleccionado,
    regionVistaId,
    zonas,
    coberturaPorCostoId,
    sincronizadoEn,
    cargarCostos,
    verRegion,
  } = useRegionCosts<BasicoAuxiliarCosto, BasicoAuxiliarCostoDetalle>({
    entityId: auxiliar.id,
    regiones,
    listCostos: listBasicoAuxiliarCostos,
    listCostoDetalles: listBasicoAuxiliarCostoDetalles,
    detalleRowId: (cd) => cd.basico_auxiliar_componente_id,
    filasCobertura: componentes,
    onError: (e) => setError(String(e)),
  });

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

  useEffect(() => {
    setCargando(true);
    setError(null);
    Promise.all([listBasicoAuxiliarComponentes(auxiliar.id), cargarCostos(auxiliar.id, null)])
      .then(([componentesR]) => {
        setComponentes(componentesR);
        const tiposConFilas = new Set(componentesR.map((c) => c.tipo));
        setGruposColapsados(new Set(todosLosTipos.filter((t) => !tiposConFilas.has(t))));
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
    const { porCosto } = await cargarCostos(auxiliar.id);
    onCambio();
    const nuevosDetalles = porCosto[costoActualizado.id] ?? [];
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

  const aFila = (c: BasicoAuxiliarComponente): FilaReceta => {
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

  const gruposDef: { tipo: TipoBasicoAuxiliarComponente; titulo: string; Icono: typeof APP_ICONS.grupo_material.icono; color: string; opciones: { id: string; label: string }[]; subtotal: string }[] = [
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

        <EncabezadoAnalisis
          tituloAnalisis="Análisis de básico auxiliar"
          IconoTitulo={APP_ICONS.grupo_basico_auxiliar.icono}
          colorTitulo={APP_ICONS.grupo_basico_auxiliar.color}
          clave={auxiliar.clave}
          descripcion={auxiliar.descripcion}
          simboloUnidad={simboloUnidad}
          regionVistaId={regionVistaId}
          nombreRegionVista={zonas.find((z) => z.regionId === regionVistaId)?.nombre ?? "Nacional"}
          segmentos={[
            { pct: pctMaterial, Icono: APP_ICONS.grupo_material.icono, color: APP_ICONS.grupo_material.color, bg: APP_ICONS.grupo_material.bg, etiqueta: "Material" },
            { pct: pctManoObra, Icono: APP_ICONS.grupo_mano_obra.icono, color: APP_ICONS.grupo_mano_obra.color, bg: APP_ICONS.grupo_mano_obra.bg, etiqueta: "MO" },
            { pct: pctEquipo, Icono: APP_ICONS.grupo_equipo_herramienta.icono, color: APP_ICONS.grupo_equipo_herramienta.color, bg: APP_ICONS.grupo_equipo_herramienta.bg, etiqueta: "Equipo" },
            { pct: pctAuxiliar, Icono: APP_ICONS.grupo_basico_auxiliar.icono, color: APP_ICONS.grupo_basico_auxiliar.color, bg: APP_ICONS.grupo_basico_auxiliar.bg, etiqueta: "Otros" },
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

        <div className="p-4">
          <TablaReceta
            columnas={{ mostrarRendimiento: true }}
            mostrarFechaPrecio={mostrarFechaPrecio}
            onToggleFechaPrecio={() => setMostrarFechaPrecio((v) => !v)}
          >
            {gruposDef.map((g) => (
              <RecetaGrupoTabla
                key={g.tipo}
                titulo={g.titulo}
                Icono={g.Icono}
                color={g.color}
                filas={componentesPorTipo[g.tipo].map(aFila)}
                columnas={{ mostrarRendimiento: true }}
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
                mostrarDestello
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
          </TablaReceta>

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

      <CostoPorRegionCard
        colapsable
        rows={[
          { etiqueta: APP_ICONS.grupo_material.titulo, extraer: (c) => c?.sub_total_material },
          { etiqueta: APP_ICONS.grupo_mano_obra.titulo, extraer: (c) => c?.sub_total_mano_obra },
          { etiqueta: APP_ICONS.grupo_equipo_herramienta.titulo, extraer: (c) => c?.sub_total_equipo },
          { etiqueta: APP_ICONS.grupo_basico_auxiliar.titulo, extraer: (c) => c?.sub_total_basico_auxiliar },
        ]}
        zonas={zonas}
        regionVistaId={regionVistaId}
        onVerRegion={verRegion}
        coberturaPorCostoId={coberturaPorCostoId}
        totalFilas={componentes.length}
      />

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
