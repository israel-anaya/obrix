import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Globe2, HardHat, MapPinned, Plus, Trash2, Users, Wrench, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
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
  updateCuadrillaDetalle,
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
import { regionesVisibles } from "@/lib/types";
import { cn } from "@/lib/utils";

const ELEGIR_INTEGRANTE = "— Elige un integrante —";
const ELEGIR_HERRAMIENTA = "— Elige una herramienta —";
const NACIONAL = "Nacional";
const NACIONAL_VALOR = "__nacional__";

function fmt(valor: string, decimales = 2): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/**
 * Panel: composición de una `cuadrilla` — dos matrices planas (integrantes de
 * `categoria_fasar` y herramienta de `herramienta`, ver diccionario de
 * datos) más los tres subtotales de la región elegida. La receta es la
 * misma en todas las regiones; al cambiar la región se muestran costo e
 * importe del cache de esa valuación. Cada mutación recalcula en el backend, este panel solo
 * refleja lo que vuelve de ahí.
 */
export function CuadrillaDetallePanel({
  cuadrilla,
  onCerrar,
  onComposicionCambiada,
}: {
  cuadrilla: Cuadrilla | null;
  onCerrar: () => void;
  onComposicionCambiada?: () => void;
}) {
  const { organizacionActivaId } = useOrganizacionActiva();
  const cuadrillaId = cuadrilla?.id ?? null;
  const integrantesRef = useRef<DataGridHandle>(null);
  const herramientaRef = useRef<DataGridHandle>(null);

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
  const [regionVistaId, setRegionVistaId] = useState<string | null>(null);
  const [integranteSeleccionadoId, setIntegranteSeleccionadoId] = useState<string | null>(null);
  const [herramientaSeleccionadaId, setHerramientaSeleccionadaId] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listHerramientas().then(setHerramientas).catch(() => {});
    listUnidadesMedida().then(setUnidades).catch(() => {});
    listRegiones().then(setRegiones).catch(() => {});
  }, [organizacionActivaId]);

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

  // Igual que en `SalarioCategoriaFasarPanel`: se espera un momento a que la
  // selección se quede quieta antes de cargar, para que navegar con flechas
  // por el grid maestro no dispare una consulta por cada fila de paso.
  useEffect(() => {
    if (!cuadrillaId) {
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
    setIntegranteSeleccionadoId(null);
    setHerramientaSeleccionadaId(null);
    const espera = setTimeout(() => {
      Promise.all([listCuadrillaDetalles(cuadrillaId), listCuadrillaCostos(cuadrillaId)])
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
  }, [cuadrillaId]);

  useEffect(() => {
    if (!costoSeleccionadoId) {
      setCostoDetalles([]);
      return;
    }
    listCuadrillaCostoDetalles(costoSeleccionadoId)
      .then(setCostoDetalles)
      .catch((e) => setError(String(e)));
  }, [costoSeleccionadoId]);

  // Toda mutación de la receta devuelve la cuadrilla recalculada (con la
  // valuación nacional al día) — se refleja en el grid maestro vía
  // `onComposicionCambiada`, y aquí se recargan receta + valuaciones +
  // renglones de la valuación seleccionada, porque el backend puede haber
  // tocado más de una.
  const trasMutarReceta = async () => {
    onComposicionCambiada?.();
    if (!cuadrillaId) return;
    await cargarDetalles(cuadrillaId);
    const costosR = await cargarCostos(cuadrillaId);
    const id =
      costosR.find((c) => (c.region_id ?? null) === regionVistaId)?.id ??
      costosR.find((c) => c.region_id === null)?.id ??
      costosR[0]?.id ??
      null;
    setCostoSeleccionadoId(id);
    if (id) {
      await listCuadrillaCostoDetalles(id).then(setCostoDetalles).catch(() => {});
    } else {
      setCostoDetalles([]);
    }
  };

  const costoSeleccionado = costos.find((c) => c.id === costoSeleccionadoId) ?? null;
  const costoTotalNum = Number(costoSeleccionado?.costo_total) || 0;
  const pctMo = costoTotalNum > 0 ? ((Number(costoSeleccionado?.sub_total_mano_obra) || 0) / costoTotalNum) * 100 : 0;
  const pctHe = costoTotalNum > 0 ? ((Number(costoSeleccionado?.sub_total_herramienta) || 0) / costoTotalNum) * 100 : 0;

  const elegirRegion = (valor: string) => {
    const regionId = valor === NACIONAL_VALOR ? null : valor;
    setRegionVistaId(regionId);
    const id = costos.find((c) => (c.region_id ?? null) === regionId)?.id ?? null;
    setCostoSeleccionadoId(id);
  };

  const opcionPorCategoriaId = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.id, `${c.clave} — ${c.descripcion}`])),
    [categorias],
  );
  const categoriaIdPorOpcion = useMemo(
    () => Object.fromEntries(categorias.map((c) => [`${c.clave} — ${c.descripcion}`, c.id])),
    [categorias],
  );
  const opcionPorHerramientaId = useMemo(
    () => Object.fromEntries(herramientas.map((h) => [h.id, `${h.clave} — ${h.descripcion}`])),
    [herramientas],
  );
  const herramientaIdPorOpcion = useMemo(
    () => Object.fromEntries(herramientas.map((h) => [`${h.clave} — ${h.descripcion}`, h.id])),
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

  const integrantes = useMemo(() => detalles.filter((d) => d.tipo === "categoria_fasar"), [detalles]);
  const herramientaDetalles = useMemo(() => detalles.filter((d) => d.tipo === "equipo_herramienta"), [detalles]);

  const configIntegrantes: DataGridConfig = useMemo(
    () => ({
      title: "Integrantes",
      columns: [
        {
          field: "integrante",
          header: "Integrante (categoría FASAR)",
          width: 260,
          grow: true,
          readOnlyOnEdit: true,
          options: [ELEGIR_INTEGRANTE, ...categorias.map((c) => `${c.clave} — ${c.descripcion}`)],
        },
        { field: "unidad", header: "Unidad", width: 80, readOnly: true },
        { field: "cantidad", header: "Cantidad", width: 110, numeric: true, decimals: 6 },
        { field: "costo", header: "Salario real", width: 140, numeric: true, readOnly: true },
        { field: "fecha_precio", header: "Fecha precio", width: 126, readOnly: true, date: true, hiddenByDefault: true },
        { field: "importe", header: "Importe", width: 110, numeric: true, readOnly: true },
      ],
    }),
    [categorias],
  );

  const filasIntegrantes: Row[] = useMemo(
    () =>
      integrantes.map((d) => {
        const cd = costoDetallePorDetalleId[d.id];
        return {
          _id: d.id,
          integrante: opcionPorCategoriaId[d.detalle_insumo_id] ?? ELEGIR_INTEGRANTE,
          unidad: simboloPorUnidadId[categoriaPorId[d.detalle_insumo_id]?.unidad_id ?? ""] ?? "",
          cantidad: Number(d.cantidad),
          costo: `$${fmt(cd?.costo ?? "0")}`,
          fecha_precio: cd?.fecha_precio ?? "",
          importe: `$${fmt(cd?.importe ?? "0")}`,
        };
      }),
    [integrantes, opcionPorCategoriaId, categoriaPorId, simboloPorUnidadId, costoDetallePorDetalleId],
  );

  const configHerramienta: DataGridConfig = useMemo(
    () => ({
      title: "Herramienta",
      columns: [
        {
          field: "herramienta",
          header: "Herramienta",
          width: 260,
          grow: true,
          readOnlyOnEdit: true,
          options: [ELEGIR_HERRAMIENTA, ...herramientas.map((h) => `${h.clave} — ${h.descripcion}`)],
        },
        { field: "unidad", header: "Unidad", width: 80, readOnly: true },
        { field: "cantidad", header: "% mano de obra", width: 110, numeric: true, suffix: "%" },
        { field: "costo", header: "Base (mano de obra)", width: 140, numeric: true, readOnly: true },
        { field: "importe", header: "Importe", width: 110, numeric: true, readOnly: true },
      ],
    }),
    [herramientas],
  );

  const filasHerramienta: Row[] = useMemo(
    () =>
      herramientaDetalles.map((d) => {
        const cd = costoDetallePorDetalleId[d.id];
        return {
          _id: d.id,
          herramienta: opcionPorHerramientaId[d.detalle_insumo_id] ?? ELEGIR_HERRAMIENTA,
          unidad: simboloPorUnidadId[herramientaPorId[d.detalle_insumo_id]?.unidad_id ?? ""] ?? "",
          cantidad: Number(d.cantidad),
          costo: `$${fmt(cd?.costo ?? "0")}`,
          importe: `$${fmt(cd?.importe ?? "0")}`,
        };
      }),
    [herramientaDetalles, opcionPorHerramientaId, herramientaPorId, simboloPorUnidadId, costoDetallePorDetalleId],
  );

  // Una edición de celda puede tocar a qué insumo apunta la receta o su
  // cantidad (compartidos entre regiones). Cada una va al mismo comando.
  const editarCantidad = async (detalle: CuadrillaDetalle, cantidad: number) => {
    if (Number(detalle.cantidad) === cantidad) return;
    await updateCuadrillaDetalle(detalle.id, {
      detalle_insumo_id: detalle.detalle_insumo_id,
      cantidad: String(cantidad),
    }).then(trasMutarReceta);
  };

  // `integrantes`/`herramientaDetalles` ya vienen en orden de `orden`
  // ascendente (el backend los entrega así) — el índice dentro del arreglo es
  // la posición real, sin necesidad de ordenar de nuevo aquí.
  const indiceIntegranteSeleccionado = integrantes.findIndex((d) => d.id === integranteSeleccionadoId);
  const indiceHerramientaSeleccionada = herramientaDetalles.findIndex((d) => d.id === herramientaSeleccionadaId);

  const moverIntegrante = async (direccion: DireccionMovimiento) => {
    if (!integranteSeleccionadoId) return;
    setError(null);
    try {
      await moveCuadrillaDetalle(integranteSeleccionadoId, direccion);
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  const moverHerramienta = async (direccion: DireccionMovimiento) => {
    if (!herramientaSeleccionadaId) return;
    setError(null);
    try {
      await moveCuadrillaDetalle(herramientaSeleccionadaId, direccion);
      await trasMutarReceta();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col border-l-2 border-l-primary bg-muted/15">
      <div className="border-b-2 border-foreground/20 bg-background/80 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Users size={16} className="text-emerald-500" />
            Composición
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Select value={regionVistaId ?? NACIONAL_VALOR} onValueChange={elegirRegion}>
              <SelectTrigger className="h-7 w-[9.5rem] border-border bg-background px-2 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NACIONAL_VALOR}>
                  <span className="flex items-center gap-1.5">
                    <Globe2 size={14} className="text-primary" />
                    {NACIONAL}
                  </span>
                </SelectItem>
                {ordenarPor(regionesVisibles(regiones), (r) => r.nombre).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex items-center gap-1.5">
                      <MapPinned size={14} className="text-teal-600 dark:text-teal-400" />
                      {r.nombre}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        {cuadrilla ? (
          <>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate font-mono text-base font-bold tracking-tight">{cuadrilla.clave}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-foreground" title={cuadrilla.descripcion}>
              {cuadrilla.descripcion}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div
                className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                title={`MO ${pctMo.toFixed(0)}% / Herramienta ${pctHe.toFixed(0)}%`}
              >
                <div className="bg-blue-500" style={{ width: `${pctMo}%` }} />
                <div className="bg-amber-500" style={{ width: `${pctHe}%` }} />
              </div>
              <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <HardHat size={16} className="text-blue-500" />
                  {pctMo.toFixed(0)}%
                </span>
                <span className="flex items-center gap-1">
                  <Wrench size={16} className="text-amber-500" />
                  {pctHe.toFixed(0)}%
                </span>
              </span>
            </div>
          </>
        ) : null}
      </div>

      {!cuadrillaId ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona una cuadrilla para ver su composición.</p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <section className="flex min-h-0 flex-1 flex-col border-b border-border">
              <div className="flex items-center justify-between px-3 py-1.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Integrantes (mano de obra)
                </h4>
                <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      title="Agregar integrante"
                      onClick={() => integrantesRef.current?.addRow()}
                      className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus size={16} />
                      <span className="text-[11px]">Agregar</span>
                    </button>
                    <Separator orientation="vertical" />
                    <button
                      type="button"
                      title="Subir"
                      disabled={indiceIntegranteSeleccionado <= 0}
                      onClick={() => void moverIntegrante("arriba")}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      title="Bajar"
                      disabled={indiceIntegranteSeleccionado < 0 || indiceIntegranteSeleccionado >= integrantes.length - 1}
                      onClick={() => void moverIntegrante("abajo")}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <Separator orientation="vertical" />
                    <button
                      type="button"
                      title="Eliminar integrante"
                      disabled={indiceIntegranteSeleccionado < 0}
                      onClick={() => integrantesRef.current?.deleteSelectedRows()}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
              </div>
              <div className="min-h-0 flex-1">
                <DataGrid
                  ref={integrantesRef}
                  config={configIntegrantes}
                  initialRows={filasIntegrantes}
                  loading={cargando}
                  selectionMode="single"
                  enableSorting={false}
                  search=""
                  onSearchChange={() => {}}
                  onRowSelected={(row) => setIntegranteSeleccionadoId(row?._id ?? null)}
                  onAddRow={(fila) => {
                    const detalleInsumoId = categoriaIdPorOpcion[String(fila.integrante)];
                    if (!detalleInsumoId) throw new Error("Elige un integrante válido.");
                    return createCuadrillaDetalle(cuadrillaId, {
                      detalle_insumo_id: detalleInsumoId,
                      cantidad: String(fila.cantidad),
                    }).then(trasMutarReceta);
                  }}
                  onEditRow={async (fila) => {
                    const detalle = integrantes.find((d) => d.id === fila._id);
                    if (!detalle) return;
                    await editarCantidad(detalle, Number(fila.cantidad));
                  }}
                  onDeleteRows={async (ids) => {
                    for (const id of ids) await deleteCuadrillaDetalle(id);
                    await trasMutarReceta();
                  }}
                  onSaveError={(mensaje) => setError(mensaje)}
                  onSaveSuccess={() => setError(null)}
                />
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col border-b border-border">
              <div className="flex items-center justify-between px-3 py-1.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Herramienta</h4>
                <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      title="Agregar herramienta"
                      onClick={() => herramientaRef.current?.addRow()}
                      className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus size={16} />
                      <span className="text-[11px]">Agregar</span>
                    </button>
                    <Separator orientation="vertical" />
                    <button
                      type="button"
                      title="Subir"
                      disabled={indiceHerramientaSeleccionada <= 0}
                      onClick={() => void moverHerramienta("arriba")}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      title="Bajar"
                      disabled={
                        indiceHerramientaSeleccionada < 0 ||
                        indiceHerramientaSeleccionada >= herramientaDetalles.length - 1
                      }
                      onClick={() => void moverHerramienta("abajo")}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <Separator orientation="vertical" />
                    <button
                      type="button"
                      title="Eliminar herramienta"
                      disabled={indiceHerramientaSeleccionada < 0}
                      onClick={() => herramientaRef.current?.deleteSelectedRows()}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
              </div>
              <div className="min-h-0 flex-1">
                <DataGrid
                  ref={herramientaRef}
                  config={configHerramienta}
                  initialRows={filasHerramienta}
                  loading={cargando}
                  selectionMode="single"
                  enableSorting={false}
                  search=""
                  onSearchChange={() => {}}
                  onRowSelected={(row) => setHerramientaSeleccionadaId(row?._id ?? null)}
                  onAddRow={(fila) => {
                    const detalleInsumoId = herramientaIdPorOpcion[String(fila.herramienta)];
                    if (!detalleInsumoId) throw new Error("Elige una herramienta válida.");
                    return createCuadrillaDetalle(cuadrillaId, {
                      detalle_insumo_id: detalleInsumoId,
                      cantidad: String(fila.cantidad),
                    }).then(trasMutarReceta);
                  }}
                  onEditRow={async (fila) => {
                    const detalle = herramientaDetalles.find((d) => d.id === fila._id);
                    if (!detalle) return;
                    await editarCantidad(detalle, Number(fila.cantidad));
                  }}
                  onDeleteRows={async (ids) => {
                    for (const id of ids) await deleteCuadrillaDetalle(id);
                    await trasMutarReceta();
                  }}
                  onSaveError={(mensaje) => setError(mensaje)}
                  onSaveSuccess={() => setError(null)}
                />
              </div>
            </section>

            <section className="shrink-0 p-3">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Totales</h4>
              <dl className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Mano de obra</dt>
                  <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.sub_total_mano_obra ?? "0")}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Herramienta</dt>
                  <dd className="font-medium tabular-nums">${fmt(costoSeleccionado?.sub_total_herramienta ?? "0")}</dd>
                </div>
                <div className={cn("flex items-center justify-between border-t border-border pt-1")}>
                  <dt className="font-semibold">Costo total</dt>
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
