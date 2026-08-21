import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCcw, Trash2, X, type LucideIcon } from "lucide-react";
import { APP_ICONS } from "@/lib/appIcons";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { toast } from "@/hooks/use-toast";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { formatearFecha } from "@/lib/fecha";
import {
  createBasicoAuxiliarComponente,
  deleteBasicoAuxiliarComponente,
  listBasicoAuxiliarComponentes,
  listBasicoAuxiliarCostoDetalles,
  listBasicoAuxiliarCostos,
  listBasicosAuxiliares,
  listCuadrillas,
  listEquiposCostoHorario,
  listMateriales,
  listRegiones,
  listUnidadesMedida,
  moveBasicoAuxiliarComponente,
  recalculateBasicoAuxiliarZonas,
  updateBasicoAuxiliarCostoDetalleCantidad,
  updateBasicoAuxiliarCostoDetalleRendimiento,
} from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type {
  BasicoAuxiliar,
  BasicoAuxiliarComponente,
  BasicoAuxiliarCosto,
  BasicoAuxiliarCostoDetalle,
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

const ELEGIR_MATERIAL = "— Elige un material —";
const ELEGIR_MANO_OBRA = "— Elige una cuadrilla —";
const ELEGIR_EQUIPO = "— Elige un equipo —";
const ELEGIR_AUXILIAR = "— Elige un básico auxiliar —";
const NACIONAL = "Nacional";
const NACIONAL_VALOR = "__nacional__";

function fmt(valor: string, decimales = 2): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/**
 * Panel: composición de un `basico_auxiliar` — cuatro matrices planas
 * (material, mano de obra vía `cuadrilla`, equipo y herramienta, y otros
 * básicos auxiliares, ver diccionario de datos) más los cuatro subtotales de
 * la región elegida. A diferencia de `CuadrillaComposicionPanel`, aquí cantidad
 * y rendimiento sí pueden variar por región — cada edición ocurre sobre el
 * `basico_auxiliar_costo_detalle` de la región vista, no sobre la receta en
 * abstracto. Mismo patrón de matriz plana que `CuadrillaComposicionPanel`.
 */
export function BasicoAuxiliarComposicionPanel({
  auxiliar,
  onCerrar,
  onComposicionCambiada,
}: {
  auxiliar: BasicoAuxiliar | null;
  onCerrar: () => void;
  onComposicionCambiada?: () => void;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const auxiliarId = auxiliar?.id ?? null;
  const materialRef = useRef<DataGridHandle>(null);
  const manoObraRef = useRef<DataGridHandle>(null);
  const equipoRef = useRef<DataGridHandle>(null);
  const auxiliarRef = useRef<DataGridHandle>(null);

  const [componentes, setComponentes] = useState<BasicoAuxiliarComponente[]>([]);
  const [costos, setCostos] = useState<BasicoAuxiliarCosto[]>([]);
  const [costoSeleccionadoId, setCostoSeleccionadoId] = useState<string | null>(null);
  const [costoDetalles, setCostoDetalles] = useState<BasicoAuxiliarCostoDetalle[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [equipos, setEquipos] = useState<EquipoCostoHorario[]>([]);
  const [auxiliaresTodos, setAuxiliaresTodos] = useState<BasicoAuxiliar[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [regionVistaId, setRegionVistaId] = useState<string | null>(null);
  const [materialSeleccionadoId, setMaterialSeleccionadoId] = useState<string | null>(null);
  const [manoObraSeleccionadaId, setManoObraSeleccionadaId] = useState<string | null>(null);
  const [equipoSeleccionadoId, setEquipoSeleccionadoId] = useState<string | null>(null);
  const [auxiliarSeleccionadoId, setAuxiliarSeleccionadoId] = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    listMateriales().then(setMateriales).catch(() => {});
    listCuadrillas().then(setCuadrillas).catch(() => {});
    listEquiposCostoHorario().then(setEquipos).catch(() => {});
    listBasicosAuxiliares().then(setAuxiliaresTodos).catch(() => {});
    listUnidadesMedida().then(setUnidades).catch(() => {});
    listRegiones().then(setRegiones).catch(() => {});
  }, [organizacionActivaId]);

  const cargarComponentes = (id: string) =>
    listBasicoAuxiliarComponentes(id)
      .then(setComponentes)
      .catch((e) => setError(String(e)));

  const cargarCostos = (id: string) =>
    listBasicoAuxiliarCostos(id)
      .then((r) => {
        setCostos(r);
        return r;
      })
      .catch((e) => {
        setError(String(e));
        return [] as BasicoAuxiliarCosto[];
      });

  // Igual que en `CuadrillaComposicionPanel`: se espera un momento a que la
  // selección se quede quieta antes de cargar, para que navegar con flechas
  // por el grid maestro no dispare una consulta por cada fila de paso.
  useEffect(() => {
    if (!auxiliarId) {
      setComponentes([]);
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
    setMaterialSeleccionadoId(null);
    setManoObraSeleccionadaId(null);
    setEquipoSeleccionadoId(null);
    setAuxiliarSeleccionadoId(null);
    const espera = setTimeout(() => {
      Promise.all([listBasicoAuxiliarComponentes(auxiliarId), listBasicoAuxiliarCostos(auxiliarId)])
        .then(([componentesR, costosR]) => {
          if (cancelado) return;
          setComponentes(componentesR);
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
  }, [auxiliarId]);

  useEffect(() => {
    if (!costoSeleccionadoId) {
      setCostoDetalles([]);
      return;
    }
    listBasicoAuxiliarCostoDetalles(costoSeleccionadoId)
      .then(setCostoDetalles)
      .catch((e) => setError(String(e)));
  }, [costoSeleccionadoId]);

  // Toda mutación de la receta devuelve el básico auxiliar recalculado (con
  // la valuación nacional al día) — se refleja en el grid maestro vía
  // `onComposicionCambiada`, y aquí se recargan receta + valuaciones +
  // renglones de la valuación seleccionada, porque el backend puede haber
  // tocado más de una.
  const trasMutarReceta = async () => {
    onComposicionCambiada?.();
    if (!auxiliarId) return;
    await cargarComponentes(auxiliarId);
    const costosR = await cargarCostos(auxiliarId);
    const id =
      costosR.find((c) => (c.region_id ?? null) === regionVistaId)?.id ??
      costosR.find((c) => c.region_id === null)?.id ??
      costosR[0]?.id ??
      null;
    setCostoSeleccionadoId(id);
    if (id) {
      await listBasicoAuxiliarCostoDetalles(id).then(setCostoDetalles).catch(() => {});
    } else {
      setCostoDetalles([]);
    }
  };

  const recalcularZonas = async () => {
    if (!auxiliarId) return;
    setRecalculando(true);
    setError(null);
    try {
      await recalculateBasicoAuxiliarZonas(auxiliarId);
      await trasMutarReceta();
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
  const opcionPorCuadrillaId = useMemo(
    () => Object.fromEntries(cuadrillas.map((c) => [c.id, `${c.clave} — ${c.descripcion}`])),
    [cuadrillas],
  );
  const cuadrillaIdPorOpcion = useMemo(
    () => Object.fromEntries(cuadrillas.map((c) => [`${c.clave} — ${c.descripcion}`, c.id])),
    [cuadrillas],
  );
  const opcionPorEquipoId = useMemo(
    () => Object.fromEntries(equipos.map((e) => [e.id, `${e.clave} — ${e.descripcion}`])),
    [equipos],
  );
  const equipoIdPorOpcion = useMemo(
    () => Object.fromEntries(equipos.map((e) => [`${e.clave} — ${e.descripcion}`, e.id])),
    [equipos],
  );
  const opcionPorAuxiliarId = useMemo(
    () => Object.fromEntries(auxiliaresTodos.map((a) => [a.id, `${a.clave} — ${a.descripcion}`])),
    [auxiliaresTodos],
  );
  const auxiliarIdPorOpcion = useMemo(
    () => Object.fromEntries(auxiliaresTodos.map((a) => [`${a.clave} — ${a.descripcion}`, a.id])),
    [auxiliaresTodos],
  );

  const infoPorId = useMemo(() => {
    const mapa: Record<string, { unidad_id: string }> = {};
    for (const m of materiales) mapa[m.id] = m;
    for (const c of cuadrillas) mapa[c.id] = c;
    for (const e of equipos) mapa[e.id] = e;
    for (const a of auxiliaresTodos) mapa[a.id] = a;
    return mapa;
  }, [materiales, cuadrillas, equipos, auxiliaresTodos]);
  const simboloPorUnidadId = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    [unidades],
  );

  const idsUsados = useMemo(() => {
    const set = new Set(componentes.map((c) => c.componente_insumo_id));
    if (auxiliarId) set.add(auxiliarId);
    return set;
  }, [componentes, auxiliarId]);

  const opcionesMaterial = useMemo(
    () => [ELEGIR_MATERIAL, ...ordenarPor(materiales.filter((m) => !idsUsados.has(m.id)), (m) => m.clave).map((m) => opcionPorMaterialId[m.id])],
    [materiales, idsUsados, opcionPorMaterialId],
  );
  const opcionesManoObra = useMemo(
    () => [ELEGIR_MANO_OBRA, ...ordenarPor(cuadrillas.filter((c) => !idsUsados.has(c.id)), (c) => c.clave).map((c) => opcionPorCuadrillaId[c.id])],
    [cuadrillas, idsUsados, opcionPorCuadrillaId],
  );
  const opcionesEquipo = useMemo(
    () => [ELEGIR_EQUIPO, ...ordenarPor(equipos.filter((e) => !idsUsados.has(e.id)), (e) => e.clave).map((e) => opcionPorEquipoId[e.id])],
    [equipos, idsUsados, opcionPorEquipoId],
  );
  const opcionesAuxiliar = useMemo(
    () => [
      ELEGIR_AUXILIAR,
      ...ordenarPor(
        auxiliaresTodos.filter((a) => a.id !== auxiliarId && !idsUsados.has(a.id)),
        (a) => a.clave,
      ).map((a) => opcionPorAuxiliarId[a.id]),
    ],
    [auxiliaresTodos, auxiliarId, idsUsados, opcionPorAuxiliarId],
  );

  const costoDetallePorComponenteId = useMemo(
    () => Object.fromEntries(costoDetalles.map((cd) => [cd.basico_auxiliar_componente_id, cd])),
    [costoDetalles],
  );

  const porTipo = (tipo: TipoBasicoAuxiliarComponente) =>
    componentes.filter((c) => c.tipo === tipo).sort((a, b) => a.orden - b.orden);
  const materialesComponentes = useMemo(() => porTipo("material"), [componentes]);
  const manoObraComponentes = useMemo(() => porTipo("mano_obra"), [componentes]);
  const equipoComponentes = useMemo(() => porTipo("equipo_herramienta"), [componentes]);
  const auxiliarComponentes = useMemo(() => porTipo("basico_auxiliar"), [componentes]);

  const filaDe = (
    c: BasicoAuxiliarComponente,
    opcion: string,
  ): Row => {
    const cd = costoDetallePorComponenteId[c.id];
    return {
      _id: c.id,
      insumo: opcion,
      unidad: simboloPorUnidadId[infoPorId[c.componente_insumo_id]?.unidad_id ?? ""] ?? "",
      rendimiento: Number(cd?.rendimiento ?? "0"),
      cantidad: Number(cd?.cantidad ?? "0"),
      costo: `$${fmt(cd?.costo ?? "0")}`,
      fecha_precio: cd?.fecha_precio ?? "",
      importe: `$${fmt(cd?.importe ?? "0")}`,
    };
  };

  const columnasBase = (
    campo: string,
    header: string,
    opciones: string[],
  ): DataGridConfig["columns"] => [
    { field: campo, header, width: 240, grow: true, readOnlyOnEdit: true, options: opciones },
    { field: "unidad", header: "Unidad", width: 80, readOnly: true },
    { field: "rendimiento", header: "Rend.", width: 90, numeric: true, decimals: 6 },
    { field: "cantidad", header: "Cantidad", width: 100, numeric: true, decimals: 6 },
    { field: "costo", header: "Costo", width: 120, numeric: true, readOnly: true },
    { field: "fecha_precio", header: "Fecha precio", width: 126, readOnly: true, date: true, hiddenByDefault: true },
    { field: "importe", header: "Importe", width: 110, numeric: true, readOnly: true },
  ];

  const configMaterial: DataGridConfig = useMemo(
    () => ({ title: APP_ICONS.grupo_material.titulo, columns: columnasBase("insumo", "Material", opcionesMaterial) }),
    [opcionesMaterial],
  );
  const configManoObra: DataGridConfig = useMemo(
    () => ({ title: APP_ICONS.grupo_mano_obra.titulo, columns: columnasBase("insumo", "Cuadrilla", opcionesManoObra) }),
    [opcionesManoObra],
  );
  const configEquipo: DataGridConfig = useMemo(
    () => ({ title: APP_ICONS.grupo_equipo_herramienta.titulo, columns: columnasBase("insumo", "Equipo", opcionesEquipo) }),
    [opcionesEquipo],
  );
  const configAuxiliar: DataGridConfig = useMemo(
    () => ({ title: APP_ICONS.grupo_basico_auxiliar.titulo, columns: columnasBase("insumo", "Básico auxiliar", opcionesAuxiliar) }),
    [opcionesAuxiliar],
  );

  const filasMaterial: Row[] = useMemo(
    () => materialesComponentes.map((c) => filaDe(c, opcionPorMaterialId[c.componente_insumo_id] ?? ELEGIR_MATERIAL)),
    [materialesComponentes, opcionPorMaterialId, costoDetallePorComponenteId, simboloPorUnidadId, infoPorId],
  );
  const filasManoObra: Row[] = useMemo(
    () => manoObraComponentes.map((c) => filaDe(c, opcionPorCuadrillaId[c.componente_insumo_id] ?? ELEGIR_MANO_OBRA)),
    [manoObraComponentes, opcionPorCuadrillaId, costoDetallePorComponenteId, simboloPorUnidadId, infoPorId],
  );
  const filasEquipo: Row[] = useMemo(
    () => equipoComponentes.map((c) => filaDe(c, opcionPorEquipoId[c.componente_insumo_id] ?? ELEGIR_EQUIPO)),
    [equipoComponentes, opcionPorEquipoId, costoDetallePorComponenteId, simboloPorUnidadId, infoPorId],
  );
  const filasAuxiliar: Row[] = useMemo(
    () => auxiliarComponentes.map((c) => filaDe(c, opcionPorAuxiliarId[c.componente_insumo_id] ?? ELEGIR_AUXILIAR)),
    [auxiliarComponentes, opcionPorAuxiliarId, costoDetallePorComponenteId, simboloPorUnidadId, infoPorId],
  );

  // Cantidad y rendimiento viven en el `costo_detalle` de la región vista
  // (a diferencia de `cuadrilla`, aquí sí pueden variar por región) — cada
  // edición apunta al renglón de esa valuación.
  const editarCelda = async (componente: BasicoAuxiliarComponente, cantidad: number, rendimiento: number) => {
    const cd = costoDetallePorComponenteId[componente.id];
    if (!cd) return;
    if (Number(cd.cantidad) !== cantidad) {
      await updateBasicoAuxiliarCostoDetalleCantidad(cd.id, String(cantidad)).then(trasMutarReceta);
      return;
    }
    if (Number(cd.rendimiento) !== rendimiento) {
      await updateBasicoAuxiliarCostoDetalleRendimiento(cd.id, String(rendimiento)).then(trasMutarReceta);
    }
  };

  const agregar = (idPorOpcion: Record<string, string>, opcionElegida: string, placeholder: string) => {
    if (!auxiliarId) return Promise.reject(new Error("Selecciona un básico auxiliar."));
    const componenteInsumoId = idPorOpcion[opcionElegida];
    if (!componenteInsumoId || opcionElegida === placeholder) throw new Error("Elige una opción válida.");
    return createBasicoAuxiliarComponente(auxiliarId, { componente_insumo_id: componenteInsumoId, cantidad: "1" }).then(
      trasMutarReceta,
    );
  };

  const indiceMaterial = materialesComponentes.findIndex((c) => c.id === materialSeleccionadoId);
  const indiceManoObra = manoObraComponentes.findIndex((c) => c.id === manoObraSeleccionadaId);
  const indiceEquipo = equipoComponentes.findIndex((c) => c.id === equipoSeleccionadoId);
  const indiceAuxiliar = auxiliarComponentes.findIndex((c) => c.id === auxiliarSeleccionadoId);

  const mover = async (id: string | null, direccion: DireccionMovimiento) => {
    if (!id) return;
    setError(null);
    try {
      await moveBasicoAuxiliarComponente(id, direccion);
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  const eliminar = async (ids: string[]) => {
    for (const id of ids) await deleteBasicoAuxiliarComponente(id);
    await trasMutarReceta();
  };

  const grupos: {
    key: string;
    Icono: LucideIcon;
    color: string;
    titulo: string;
    ref: typeof materialRef;
    config: DataGridConfig;
    filas: Row[];
    indiceSeleccionado: number;
    onSelect: (id: string | null) => void;
    onAdd: (fila: Row) => Promise<void> | void;
    onEditar: (fila: Row, lista: BasicoAuxiliarComponente[]) => Promise<void>;
    onEliminar: () => void;
    onSubir: () => void;
    onBajar: () => void;
  }[] = [
    {
      key: "material",
      Icono: APP_ICONS.grupo_material.icono,
      color: APP_ICONS.grupo_material.color,
      titulo: APP_ICONS.grupo_material.titulo,
      ref: materialRef,
      config: configMaterial,
      filas: filasMaterial,
      indiceSeleccionado: indiceMaterial,
      onSelect: setMaterialSeleccionadoId,
      onAdd: (fila) => agregar(materialIdPorOpcion, String(fila.insumo), ELEGIR_MATERIAL),
      onEditar: async (fila, lista) => {
        const c = lista.find((x) => x.id === fila._id);
        if (c) await editarCelda(c, Number(fila.cantidad), Number(fila.rendimiento));
      },
      onEliminar: () => materialRef.current?.deleteSelectedRows(),
      onSubir: () => void mover(materialSeleccionadoId, "arriba"),
      onBajar: () => void mover(materialSeleccionadoId, "abajo"),
    },
    {
      key: "mano_obra",
      Icono: APP_ICONS.grupo_mano_obra.icono,
      color: APP_ICONS.grupo_mano_obra.color,
      titulo: APP_ICONS.grupo_mano_obra.titulo,
      ref: manoObraRef,
      config: configManoObra,
      filas: filasManoObra,
      indiceSeleccionado: indiceManoObra,
      onSelect: setManoObraSeleccionadaId,
      onAdd: (fila) => agregar(cuadrillaIdPorOpcion, String(fila.insumo), ELEGIR_MANO_OBRA),
      onEditar: async (fila, lista) => {
        const c = lista.find((x) => x.id === fila._id);
        if (c) await editarCelda(c, Number(fila.cantidad), Number(fila.rendimiento));
      },
      onEliminar: () => manoObraRef.current?.deleteSelectedRows(),
      onSubir: () => void mover(manoObraSeleccionadaId, "arriba"),
      onBajar: () => void mover(manoObraSeleccionadaId, "abajo"),
    },
    {
      key: "equipo_herramienta",
      Icono: APP_ICONS.grupo_equipo_herramienta.icono,
      color: APP_ICONS.grupo_equipo_herramienta.color,
      titulo: APP_ICONS.grupo_equipo_herramienta.titulo,
      ref: equipoRef,
      config: configEquipo,
      filas: filasEquipo,
      indiceSeleccionado: indiceEquipo,
      onSelect: setEquipoSeleccionadoId,
      onAdd: (fila) => agregar(equipoIdPorOpcion, String(fila.insumo), ELEGIR_EQUIPO),
      onEditar: async (fila, lista) => {
        const c = lista.find((x) => x.id === fila._id);
        if (c) await editarCelda(c, Number(fila.cantidad), Number(fila.rendimiento));
      },
      onEliminar: () => equipoRef.current?.deleteSelectedRows(),
      onSubir: () => void mover(equipoSeleccionadoId, "arriba"),
      onBajar: () => void mover(equipoSeleccionadoId, "abajo"),
    },
    {
      key: "basico_auxiliar",
      Icono: APP_ICONS.grupo_basico_auxiliar.icono,
      color: APP_ICONS.grupo_basico_auxiliar.color,
      titulo: APP_ICONS.grupo_basico_auxiliar.titulo,
      ref: auxiliarRef,
      config: configAuxiliar,
      filas: filasAuxiliar,
      indiceSeleccionado: indiceAuxiliar,
      onSelect: setAuxiliarSeleccionadoId,
      onAdd: (fila) => agregar(auxiliarIdPorOpcion, String(fila.insumo), ELEGIR_AUXILIAR),
      onEditar: async (fila, lista) => {
        const c = lista.find((x) => x.id === fila._id);
        if (c) await editarCelda(c, Number(fila.cantidad), Number(fila.rendimiento));
      },
      onEliminar: () => auxiliarRef.current?.deleteSelectedRows(),
      onSubir: () => void mover(auxiliarSeleccionadoId, "arriba"),
      onBajar: () => void mover(auxiliarSeleccionadoId, "abajo"),
    },
  ];

  const listaPorTipo: Record<string, BasicoAuxiliarComponente[]> = {
    material: materialesComponentes,
    mano_obra: manoObraComponentes,
    equipo_herramienta: equipoComponentes,
    basico_auxiliar: auxiliarComponentes,
  };

  return (
    <div className="flex h-full min-w-0 flex-col border-l-2 border-l-primary bg-muted/15">
      <div className="border-b-2 border-foreground/20 bg-background/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <APP_ICONS.grupo_basico_auxiliar.icono size={16} className={APP_ICONS.grupo_basico_auxiliar.color} />
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
          {auxiliar ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                title={`Material ${pctMaterial.toFixed(0)}% / MO ${pctManoObra.toFixed(0)}% / Equipo ${pctEquipo.toFixed(0)}% / Básicos ${pctAuxiliar.toFixed(0)}%`}
              >
                <div className={APP_ICONS.grupo_material.bg} style={{ width: `${pctMaterial}%` }} />
                <div className={APP_ICONS.grupo_mano_obra.bg} style={{ width: `${pctManoObra}%` }} />
                <div className={APP_ICONS.grupo_equipo_herramienta.bg} style={{ width: `${pctEquipo}%` }} />
                <div className={APP_ICONS.grupo_basico_auxiliar.bg} style={{ width: `${pctAuxiliar}%` }} />
              </div>
              <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
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
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="h-5 w-px shrink-0 bg-border" />
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title={
                !auxiliarId
                  ? "Selecciona un básico auxiliar para sincronizar"
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
              disabled={!auxiliarId || recalculando}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted",
                (!auxiliarId || recalculando) && "opacity-50",
                !sincronizadoEn && auxiliarId && "border-amber-500/40",
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
      </div>

      {!auxiliarId ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona un básico auxiliar para ver su composición.</p>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {grupos.map((g) => (
            <section key={g.key} className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border">
              <div className="flex items-center justify-between px-3 py-1.5">
                <h4 className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <g.Icono size={14} className={g.color} />
                  {g.titulo}
                </h4>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title={`Agregar ${g.titulo.toLowerCase()}`}
                    onClick={() => g.ref.current?.addRow()}
                    className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus size={16} />
                    <span className="text-[11px]">Agregar</span>
                  </button>
                  <Separator orientation="vertical" />
                  <button
                    type="button"
                    title="Subir"
                    disabled={g.indiceSeleccionado <= 0}
                    onClick={g.onSubir}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    title="Bajar"
                    disabled={g.indiceSeleccionado < 0 || g.indiceSeleccionado >= g.filas.length - 1}
                    onClick={g.onBajar}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <Separator orientation="vertical" />
                  <button
                    type="button"
                    title={`Eliminar ${g.titulo.toLowerCase()}`}
                    disabled={g.indiceSeleccionado < 0}
                    onClick={g.onEliminar}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1">
                <DataGrid
                  ref={g.ref}
                  config={g.config}
                  initialRows={g.filas}
                  loading={cargando || recalculando}
                  selectionMode="single"
                  enableSorting={false}
                  search=""
                  onSearchChange={() => {}}
                  onRowSelected={(row) => g.onSelect(row?._id ?? null)}
                  onAddRow={(fila) => Promise.resolve(g.onAdd(fila))}
                  onEditRow={(fila) => g.onEditar(fila, listaPorTipo[g.key])}
                  onDeleteRows={(ids) => eliminar(ids)}
                  onSaveError={(mensaje) => setError(mensaje)}
                  onSaveSuccess={() => setError(null)}
                />
              </div>
            </section>
          ))}

          <section className="shrink-0 p-3">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Totales</h4>
            <dl className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{APP_ICONS.grupo_material.titulo}</dt>
                <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.sub_total_material ?? "0")}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{APP_ICONS.grupo_mano_obra.titulo}</dt>
                <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.sub_total_mano_obra ?? "0")}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{APP_ICONS.grupo_equipo_herramienta.titulo}</dt>
                <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.sub_total_equipo ?? "0")}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{APP_ICONS.grupo_basico_auxiliar.titulo}</dt>
                <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.sub_total_basico_auxiliar ?? "0")}</dd>
              </div>
              <div className={cn("flex items-center justify-between border-t border-border pt-1")}>
                <dt className="font-semibold">Costo total</dt>
                <dd className="font-semibold tabular-nums">${fmt(costoSeleccionado?.costo_total ?? "0")}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
