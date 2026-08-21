import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { APP_ICONS } from "@/lib/appIcons";
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
import { ActionBar, ActionBarMenu } from "@/components/ActionBar";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { SearchInput } from "@/components/SearchInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { BasicoAuxiliarFichaApu } from "@/features/catalogos/proyecto/basicos-auxiliares/BasicoAuxiliarFichaApu";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { formatearFecha } from "@/lib/fecha";
import { ordenarPor } from "@/lib/ordenar";
import {
  createBasicoAuxiliar,
  deleteBasicoAuxiliar,
  listBasicosAuxiliares,
  listFamiliasInsumo,
  listUnidadesMedida,
  listUsuarios,
  updateBasicoAuxiliar,
} from "@/lib/tauri";
import type { BasicoAuxiliar, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

// Radix no permite un `SelectItem` con value="" — estos "sin X" son null en
// el backend y necesitan un valor propio para poder ofrecerse como opción.
const SIN_FAMILIA_VALOR = "__sin_familia__";
const SIN_SUBFAMILIA_VALOR = "__sin_subfamilia__";

function fmt(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Vista "Ficha" de Básicos y Auxiliares — mismo patrón que `CuadrillasFicha`:
 * fichero angosto a la izquierda, tarjeta de análisis a la derecha
 * (`BasicoAuxiliarFichaApu`). Enfoque alterno a `BasicoAuxiliarGridVista`
 * (grid) — mismos datos y comandos de Tauri por debajo.
 *
 * Agregar/editar/eliminar/recargar viven todos juntos en la barra de
 * acciones del encabezado, junto al buscador — un solo formulario (en un
 * `Sheet`, igual que `CuadrillasFicha`) sirve tanto para crear como para
 * editar la identidad del auxiliar (clave/descripción/unidad/familia). La
 * receta (material/mano de obra/equipo/otros auxiliares) vive en la ficha de
 * detalle, no aquí.
 */
export function BasicoAuxiliarFicha() {
  const [auxiliares, setAuxiliares] = useState<BasicoAuxiliar[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);

  // El mismo formulario sirve para crear y para editar — `editandoId` es
  // `null` cuando se está creando, o el id del auxiliar que se está editando.
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevaUnidadId, setNuevaUnidadId] = useState("");
  const [nuevaFamiliaId, setNuevaFamiliaId] = useState<string | null>(null);
  const [nuevaSubfamiliaId, setNuevaSubfamiliaId] = useState<string | null>(null);
  const [guardandoNueva, setGuardandoNueva] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const recargarAuxiliares = () => {
    setCargando(true);
    return listBasicosAuxiliares()
      .then((r) => {
        setAuxiliares(r);
        // Si nada está seleccionado (primera carga) arranca en el primero por
        // clave — misma hoja que el tope de la lista ordenada. Una ficha
        // vacía es menos útil que abrir directo.
        setSeleccionadaId((actual) => actual ?? ordenarPor(r, (a) => a.clave)[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  const recargarTodo = () => {
    void recargarAuxiliares();
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  };

  const raicesFamilia = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);
  const hijasNueva = nuevaFamiliaId ? (hijasPorPadreId[nuevaFamiliaId] ?? []) : [];

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const auxiliaresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = ordenarPor(auxiliares, (a) => a.clave);
    if (!q) return lista;
    return lista.filter((a) => a.clave.toLowerCase().includes(q) || a.descripcion.toLowerCase().includes(q));
  }, [auxiliares, busqueda]);

  // Navegación con ↑/↓ entre auxiliares — ignorada mientras el formulario de
  // alta/edición está abierto (vive en un `Sheet` modal, y también usa
  // flechas para moverse dentro de sus campos) o si el foco está en un campo
  // de texto suelto en otro lado.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (creando || editandoId) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (auxiliaresFiltrados.length === 0) return;
      e.preventDefault();
      const idxActual = auxiliaresFiltrados.findIndex((a) => a.id === seleccionadaId);
      const delta = e.key === "ArrowUp" ? -1 : 1;
      const idxNuevo =
        idxActual === -1 ? 0 : Math.min(Math.max(idxActual + delta, 0), auxiliaresFiltrados.length - 1);
      setSeleccionadaId(auxiliaresFiltrados[idxNuevo].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [auxiliaresFiltrados, seleccionadaId, creando, editandoId]);

  useEffect(() => {
    if (!seleccionadaId) return;
    itemRefs.current.get(seleccionadaId)?.scrollIntoView({ block: "nearest" });
  }, [seleccionadaId, auxiliaresFiltrados]);

  const iniciarCreacion = () => {
    setEditandoId(null);
    setNuevaClave("");
    setNuevaDescripcion("");
    setNuevaUnidadId(unidades[0]?.id ?? "");
    setNuevaFamiliaId(null);
    setNuevaSubfamiliaId(null);
    setError(null);
    setCreando(true);
  };

  const iniciarEdicion = (a: BasicoAuxiliar) => {
    setCreando(false);
    setEditandoId(a.id);
    setNuevaClave(a.clave);
    setNuevaDescripcion(a.descripcion);
    setNuevaUnidadId(a.unidad_id);
    setNuevaFamiliaId(a.familia_id);
    setNuevaSubfamiliaId(a.sub_familia_id);
    setError(null);
  };

  const cancelarFormulario = () => {
    setCreando(false);
    setEditandoId(null);
    setError(null);
  };

  const guardarAuxiliar = async () => {
    if (!nuevaClave.trim() || !nuevaDescripcion.trim() || !nuevaUnidadId) {
      setError("Clave, descripción y unidad son requeridos.");
      return;
    }
    setGuardandoNueva(true);
    setError(null);
    try {
      if (editandoId) {
        const actualizado = await updateBasicoAuxiliar(editandoId, {
          clave: nuevaClave.trim(),
          descripcion: nuevaDescripcion.trim(),
          unidad_id: nuevaUnidadId,
          familia_id: nuevaFamiliaId,
          sub_familia_id: nuevaSubfamiliaId,
        });
        await recargarAuxiliares();
        setSeleccionadaId(actualizado.id);
      } else {
        const creado = await createBasicoAuxiliar({
          clave: nuevaClave.trim(),
          descripcion: nuevaDescripcion.trim(),
          unidad_id: nuevaUnidadId,
          familia_id: nuevaFamiliaId,
          sub_familia_id: nuevaSubfamiliaId,
        });
        await recargarAuxiliares();
        setSeleccionadaId(creado.id);
      }
      cancelarFormulario();
      setNuevaClave("");
      setNuevaDescripcion("");
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardandoNueva(false);
    }
  };

  const seleccionada = auxiliares.find((a) => a.id === seleccionadaId) ?? null;

  const confirmarEliminar = async () => {
    if (!seleccionada) return;
    setError(null);
    try {
      await deleteBasicoAuxiliar(seleccionada.id);
      setConfirmandoEliminar(false);
      setSeleccionadaId(null);
      cancelarFormulario();
      await recargarAuxiliares();
    } catch (e) {
      setConfirmandoEliminar(false);
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border p-2">
            <div className="flex items-center gap-0.5">
              <ActionBar
                actions={[
                  { icon: Plus, title: "Nuevo básico auxiliar", onClick: iniciarCreacion },
                  {
                    icon: Pencil,
                    title: "Editar auxiliar seleccionado",
                    onClick: () => seleccionada && iniciarEdicion(seleccionada),
                    disabled: !seleccionada,
                  },
                ]}
              />
              <div className="mx-1 h-4 w-px bg-border" />
              <SearchInput value={busqueda} onChange={setBusqueda} />
            </div>
            <ActionBarMenu
              menu={[
                { icon: RefreshCcw, title: "Recargar", onClick: recargarTodo },
                {
                  icon: Trash2,
                  title: "Eliminar auxiliar seleccionado",
                  onClick: () => setConfirmandoEliminar(true),
                  disabled: !seleccionada,
                  destructive: true,
                },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cargando && auxiliares.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Cargando…</p>
            ) : auxiliaresFiltrados.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Sin básicos ni auxiliares todavía.</p>
            ) : (
              auxiliaresFiltrados.map((a) => {
                const activa = seleccionadaId === a.id;
                return (
                  <button
                    key={a.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(a.id, el);
                      else itemRefs.current.delete(a.id);
                    }}
                    type="button"
                    aria-current={activa ? "true" : undefined}
                    onClick={() => setSeleccionadaId(a.id)}
                    className={cn(
                      "relative flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2 text-left outline-none hover:bg-muted/50",
                      activa ? "bg-primary/10" : undefined,
                    )}
                  >
                    {activa ? (
                      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                    ) : null}
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="font-mono text-[15px] font-semibold tabular-nums tracking-tight text-foreground">
                        {a.clave}
                      </span>
                      <span className="shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                        ${fmt(a.costo_nacional?.costo_total ?? "0")}
                      </span>
                    </div>
                    <span className="line-clamp-6 w-full font-mono text-xs font-normal text-muted-foreground">{a.descripcion}</span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <APP_ICONS.grupo_material.icono size={16} className={APP_ICONS.grupo_material.color} />${fmt(a.costo_nacional?.sub_total_material ?? "0")}
                      </span>
                      <span className="flex items-center gap-1">
                        <APP_ICONS.grupo_mano_obra.icono size={16} className={APP_ICONS.grupo_mano_obra.color} />${fmt(a.costo_nacional?.sub_total_mano_obra ?? "0")}
                      </span>
                      <span className="flex items-center gap-1">
                        <APP_ICONS.grupo_equipo_herramienta.icono size={16} className={APP_ICONS.grupo_equipo_herramienta.color} />${fmt(a.costo_nacional?.sub_total_equipo ?? "0")}
                      </span>
                      <span className="flex items-center gap-1">
                        <APP_ICONS.grupo_basico_auxiliar.icono size={16} className={APP_ICONS.grupo_basico_auxiliar.color} />${fmt(a.costo_nacional?.sub_total_basico_auxiliar ?? "0")}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4">
          {seleccionada ? (
            <BasicoAuxiliarFichaApu auxiliar={seleccionada} onCambio={recargarAuxiliares} />
          ) : (
            <p className="text-center text-xs text-muted-foreground">Elige un básico auxiliar de la lista.</p>
          )}
        </div>
      </div>

      <AlertDialog open={confirmandoEliminar} onOpenChange={setConfirmandoEliminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el auxiliar seleccionado?</AlertDialogTitle>
            <AlertDialogDescription>
              {seleccionada &&
                `Se eliminará "${seleccionada.clave}" y toda su composición. Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => void confirmarEliminar()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={creando || !!editandoId} onOpenChange={(open) => !open && cancelarFormulario()}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editandoId ? "Editar básico auxiliar" : "Nuevo básico auxiliar"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Field label="Clave">
              <input
                autoFocus
                value={nuevaClave}
                onChange={(e) => setNuevaClave(e.target.value)}
                className={FIELD_INPUT_CLASS}
              />
            </Field>
            <Field label="Descripción">
              <textarea
                value={nuevaDescripcion}
                onChange={(e) => setNuevaDescripcion(e.target.value)}
                rows={4}
                className={cn(FIELD_INPUT_CLASS, "resize-none")}
              />
            </Field>
            <Field label="Unidad">
              <Select value={nuevaUnidadId} onValueChange={setNuevaUnidadId}>
                <SelectTrigger className={FIELD_INPUT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ordenarPor(unidades, (u) => u.simbolo).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.simbolo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Familia">
              <Select
                value={nuevaFamiliaId ?? SIN_FAMILIA_VALOR}
                onValueChange={(v) => {
                  setNuevaFamiliaId(v === SIN_FAMILIA_VALOR ? null : v);
                  setNuevaSubfamiliaId(null);
                }}
              >
                <SelectTrigger className={FIELD_INPUT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_FAMILIA_VALOR}>— Sin familia —</SelectItem>
                  {ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sub familia">
              <Select
                value={nuevaSubfamiliaId ?? SIN_SUBFAMILIA_VALOR}
                onValueChange={(v) => setNuevaSubfamiliaId(v === SIN_SUBFAMILIA_VALOR ? null : v)}
                disabled={hijasNueva.length === 0}
              >
                <SelectTrigger className={cn(FIELD_INPUT_CLASS, hijasNueva.length === 0 && "opacity-50")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_SUBFAMILIA_VALOR}>— Sin sub familia —</SelectItem>
                  {ordenarPor(hijasNueva, (h) => h.nombre).map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {editandoId && seleccionada && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span>Creado</span>
                <span className="text-right">{formatearFecha(seleccionada.created_at)}</span>
                <span>Creado por</span>
                <span className="truncate text-right">
                  {nombresPorUsuarioId[seleccionada.created_by] ?? seleccionada.created_by}
                </span>
                <span>Actualizado</span>
                <span className="text-right">
                  {seleccionada.updated_at ? formatearFecha(seleccionada.updated_at) : "—"}
                </span>
                <span>Actualizado por</span>
                <span className="truncate text-right">
                  {seleccionada.updated_by ? (nombresPorUsuarioId[seleccionada.updated_by] ?? seleccionada.updated_by) : "—"}
                </span>
              </div>
            )}
          </div>
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={cancelarFormulario}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardarAuxiliar()}
              disabled={guardandoNueva}
              className={cn(
                "rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90",
                guardandoNueva && "opacity-50",
              )}
            >
              {guardandoNueva ? "Guardando…" : "Guardar"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
