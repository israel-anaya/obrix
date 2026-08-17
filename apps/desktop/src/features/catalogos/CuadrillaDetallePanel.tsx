import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Users, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
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
  moveCuadrillaDetalle,
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
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ELEGIR_INTEGRANTE = "— Elige un integrante —";
const ELEGIR_HERRAMIENTA = "— Elige una herramienta —";
const NACIONAL = "Nacional";

function fmt(valor: string, decimales = 2): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/**
 * Panel: composición de una `cuadrilla` — dos matrices planas (integrantes de
 * `categoria_fasar` y herramienta de `herramienta`, ver diccionario de
 * datos) más los tres subtotales de la **valuación seleccionada**
 * (`cuadrilla_costo`, ver selector de región). La receta (qué integra el
 * equipo) es la misma en todas las regiones — agregar/quitar/mover renglones
 * solo está disponible viendo la valuación Nacional, que es donde nace la
 * cantidad inicial de un renglón nuevo; el resto de las valuaciones solo
 * editan `cantidad` de renglones que ya existen. Cada mutación recalcula en
 * el backend, este panel solo refleja lo que vuelve de ahí. Pensado para
 * vivir junto al grid de cuadrillas, mismo patrón que
 * `SalarioCategoriaFasarPanel`.
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
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [creandoRegion, setCreandoRegion] = useState(false);
  const [regionNueva, setRegionNueva] = useState("");
  const [confirmandoEliminarValuacion, setConfirmandoEliminarValuacion] = useState(false);
  const [integranteSeleccionadoId, setIntegranteSeleccionadoId] = useState<string | null>(null);
  const [herramientaSeleccionadaId, setHerramientaSeleccionadaId] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listHerramientas().then(setHerramientas).catch(() => {});
    listRegiones().then(setRegiones).catch(() => {});
  }, []);

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
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    setCostoSeleccionadoId(null);
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
    await cargarCostos(cuadrillaId);
    if (costoSeleccionadoId) {
      await listCuadrillaCostoDetalles(costoSeleccionadoId).then(setCostoDetalles).catch(() => {});
    }
  };

  const trasMutarCantidad = async () => {
    onComposicionCambiada?.();
    if (!cuadrillaId) return;
    await cargarCostos(cuadrillaId);
    if (costoSeleccionadoId) {
      await listCuadrillaCostoDetalles(costoSeleccionadoId).then(setCostoDetalles).catch(() => {});
    }
  };

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);
  const costoSeleccionado = costos.find((c) => c.id === costoSeleccionadoId) ?? null;
  const esNacional = costoSeleccionado ? costoSeleccionado.region_id === null : true;
  const regionesSinValuacion = useMemo(
    () => regiones.filter((r) => !costos.some((c) => c.region_id === r.id)),
    [regiones, costos],
  );

  const crearValuacionRegional = async () => {
    if (!cuadrillaId || !regionNueva) return;
    setError(null);
    try {
      const creada = await createCuadrillaCostoRegional(cuadrillaId, regionNueva);
      await cargarCostos(cuadrillaId);
      setCostoSeleccionadoId(creada.id);
      setCreandoRegion(false);
      setRegionNueva("");
    } catch (e) {
      setError(String(e));
    }
  };

  const confirmarEliminarValuacionRegional = async () => {
    setConfirmandoEliminarValuacion(false);
    if (!cuadrillaId || !costoSeleccionado || costoSeleccionado.region_id === null) return;
    setError(null);
    try {
      await deleteCuadrillaCosto(costoSeleccionado.id);
      const restantes = await cargarCostos(cuadrillaId);
      setCostoSeleccionadoId(restantes.find((c) => c.region_id === null)?.id ?? null);
    } catch (e) {
      setError(String(e));
    }
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
          cantidad: Number(cd?.cantidad ?? 0),
          costo: `$${fmt(cd?.costo ?? "0")}`,
          fecha_precio: cd?.fecha_precio ?? "",
          importe: `$${fmt(cd?.importe ?? "0")}`,
        };
      }),
    [integrantes, opcionPorCategoriaId, costoDetallePorDetalleId],
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
          cantidad: Number(cd?.cantidad ?? 0),
          costo: `$${fmt(cd?.costo ?? "0")}`,
          importe: `$${fmt(cd?.importe ?? "0")}`,
        };
      }),
    [herramientaDetalles, opcionPorHerramientaId, costoDetallePorDetalleId],
  );

  // Una edición de celda puede tocar a qué insumo apunta la receta
  // (compartido entre regiones), la cantidad de la valuación en pantalla, o
  // ambas — cada una es una llamada distinta al backend.
  const editarCantidad = async (detalleId: string, cantidad: number) => {
    const cd = costoDetallePorDetalleId[detalleId];
    if (!cd) return;
    if (Number(cd.cantidad) === cantidad) return;
    await updateCuadrillaCostoDetalle(cd.id, { cantidad: String(cantidad) }).then(trasMutarCantidad);
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
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        {cuadrilla ? (
          <>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate font-mono text-base font-bold tracking-tight">{cuadrilla.clave}</span>
              {cuadrillaId ? (
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Select value={costoSeleccionadoId ?? ""} onValueChange={(v) => setCostoSeleccionadoId(v || null)}>
                    <SelectTrigger size="sm" className="w-48 text-xs">
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
                      <Trash2 size={16} />
                    </button>
                  )}
                  {regionesSinValuacion.length > 0 && (
                    <button
                      type="button"
                      title="Crear valuación regional"
                      onClick={() => setCreandoRegion(true)}
                      className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus size={16} />
                      <span className="text-[11px]">Región</span>
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-foreground" title={cuadrilla.descripcion}>
              {cuadrilla.descripcion}
            </p>
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
                {esNacional && (
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
                )}
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
                      cantidad_nacional: String(fila.cantidad),
                    }).then(trasMutarReceta);
                  }}
                  onEditRow={async (fila) => {
                    const detalle = integrantes.find((d) => d.id === fila._id);
                    if (!detalle) return;
                    await editarCantidad(detalle.id, Number(fila.cantidad));
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
                {esNacional && (
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
                )}
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
                      cantidad_nacional: String(fila.cantidad),
                    }).then(trasMutarReceta);
                  }}
                  onEditRow={async (fila) => {
                    const detalle = herramientaDetalles.find((d) => d.id === fila._id);
                    if (!detalle) return;
                    await editarCantidad(detalle.id, Number(fila.cantidad));
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

            {!esNacional && (
              <p className="mx-3 mb-3 shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
                Agregar, quitar o mover integrantes solo está disponible en Nacional — aquí solo se edita la cantidad.
              </p>
            )}
          </div>
        </>
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

      <Dialog
        open={creandoRegion}
        onOpenChange={(open) => {
          setCreandoRegion(open);
          if (!open) setRegionNueva("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva valuación regional</DialogTitle>
            <DialogDescription>
              Crea una valuación independiente para esta cuadrilla en la región elegida, copiando las cantidades
              actuales de la valuación Nacional. Desde ahí podrás editar las cantidades solo para esa región, sin
              afectar a las demás — agregar, quitar o mover integrantes/herramienta seguirá haciéndose desde
              Nacional.
            </DialogDescription>
          </DialogHeader>
          <Select value={regionNueva} onValueChange={setRegionNueva}>
            <SelectTrigger autoFocus size="sm" className="w-full text-xs">
              <SelectValue placeholder="— Región —" />
            </SelectTrigger>
            <SelectContent>
              {ordenarPor(regionesSinValuacion, (r) => r.nombre).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreandoRegion(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void crearValuacionRegional()} disabled={!regionNueva}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
