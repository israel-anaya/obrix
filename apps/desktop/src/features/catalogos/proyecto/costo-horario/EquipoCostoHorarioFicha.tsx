import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
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
import { APP_ICONS } from "@/lib/appIcons";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { SearchInput } from "@/components/SearchInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { EquipoCostoHorarioFichaApu } from "@/features/catalogos/proyecto/costo-horario/EquipoCostoHorarioFichaApu";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { formatearFecha } from "@/lib/fecha";
import { ordenarPor } from "@/lib/ordenar";
import {
  createEquipoCostoHorario,
  deleteEquipoCostoHorario,
  listEquiposCostoHorario,
  listFamiliasInsumo,
  listUnidadesMedida,
  listUsuarios,
  updateEquipoCostoHorario,
} from "@/lib/tauri";
import type { EquipoCostoHorario, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA = "Equipo y herramienta";
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
 * Vista "Ficha" de Equipo de costo horario — franja de fichas horizontal
 * arriba (mismo patrón que `CuadrillasFicha`), tarjeta de análisis debajo
 * ocupando todo el ancho (`EquipoCostoHorarioFichaApu`). Enfoque alterno a
 * `EquipoCostoHorarioGridVista` (grid) — mismos datos y comandos de Tauri
 * por debajo.
 *
 * Agregar/editar/eliminar/recargar viven todos juntos en la barra de
 * acciones del encabezado, junto al buscador — un solo formulario (en un
 * `Sheet`, igual que `CuadrillasFicha`) sirve tanto para crear como para
 * editar la identidad del equipo (clave/descripción/unidad/familia).
 * Los 9 valores de captura de cargos fijos viven en la ficha de detalle, no
 * aquí, para que se vea el desglose calculado mientras se ajustan.
 */
export function EquipoCostoHorarioFicha() {
  const [equipos, setEquipos] = useState<EquipoCostoHorario[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);

  // El mismo formulario sirve para crear y para editar — `editandoId` es
  // `null` cuando se está creando, o el id del equipo que se está editando.
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

  const recargarEquipos = () => {
    setCargando(true);
    return listEquiposCostoHorario()
      .then((r) => {
        setEquipos(r);
        // Si nada está seleccionado (primera carga) arranca en el primero por
        // clave — misma hoja que el tope de la lista ordenada. Una ficha
        // vacía es menos útil que abrir directo.
        setSeleccionadaId((actual) => actual ?? ordenarPor(r, (e) => e.clave)[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  const recargarTodo = () => {
    void recargarEquipos();
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
  const familiaEquipoHerramientaId = useMemo(
    () => raicesFamilia.find((f) => f.nombre === NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA)?.id ?? null,
    [raicesFamilia],
  );

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const equiposFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = ordenarPor(equipos, (e) => e.clave);
    if (!q) return lista;
    return lista.filter((e) => e.clave.toLowerCase().includes(q) || e.descripcion.toLowerCase().includes(q));
  }, [equipos, busqueda]);

  // Navegación con ←/→ entre equipos — ignorada mientras el formulario de
  // alta/edición está abierto (vive en un `Sheet` modal, y también usa
  // flechas para moverse dentro de sus campos) o si el foco está en un campo
  // de texto suelto en otro lado.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (creando || editandoId) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (equiposFiltrados.length === 0) return;
      e.preventDefault();
      const idxActual = equiposFiltrados.findIndex((e) => e.id === seleccionadaId);
      const delta = e.key === "ArrowLeft" ? -1 : 1;
      const idxNuevo = idxActual === -1 ? 0 : Math.min(Math.max(idxActual + delta, 0), equiposFiltrados.length - 1);
      setSeleccionadaId(equiposFiltrados[idxNuevo].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [equiposFiltrados, seleccionadaId, creando, editandoId]);

  useEffect(() => {
    if (!seleccionadaId) return;
    itemRefs.current.get(seleccionadaId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [seleccionadaId, equiposFiltrados]);

  const iniciarCreacion = () => {
    setEditandoId(null);
    setNuevaClave("");
    setNuevaDescripcion("");
    // "hr" (hora) es la unidad casi universal de un equipo de costo
    // horario — evita que quien da de alta tenga que buscarla cada vez.
    const unidadHora = unidades.find((u) => u.simbolo.toLowerCase() === "hr");
    setNuevaUnidadId(unidadHora?.id ?? unidades[0]?.id ?? "");
    // Un equipo de costo horario es, por naturaleza, equipo y herramienta —
    // evita que quien da de alta tenga que elegirla cada vez.
    setNuevaFamiliaId(familiaEquipoHerramientaId);
    setNuevaSubfamiliaId(null);
    setError(null);
    setCreando(true);
  };

  const iniciarEdicion = (e: EquipoCostoHorario) => {
    setCreando(false);
    setEditandoId(e.id);
    setNuevaClave(e.clave);
    setNuevaDescripcion(e.descripcion);
    setNuevaUnidadId(e.unidad_id);
    setNuevaFamiliaId(e.familia_id);
    setNuevaSubfamiliaId(e.sub_familia_id);
    setError(null);
  };

  const cancelarFormulario = () => {
    setCreando(false);
    setEditandoId(null);
    setError(null);
  };

  const guardarEquipo = async () => {
    if (!nuevaClave.trim() || !nuevaDescripcion.trim() || !nuevaUnidadId) {
      setError("Clave, descripción y unidad son requeridos.");
      return;
    }
    setGuardandoNueva(true);
    setError(null);
    try {
      if (editandoId) {
        const actual = equipos.find((e) => e.id === editandoId);
        if (!actual) throw new Error("equipo no encontrado");
        const actualizado = await updateEquipoCostoHorario(editandoId, {
          clave: nuevaClave.trim(),
          descripcion: nuevaDescripcion.trim(),
          unidad_id: nuevaUnidadId,
          familia_id: nuevaFamiliaId,
          sub_familia_id: nuevaSubfamiliaId,
          cf_costo_maquina: actual.cf_costo_maquina,
          cf_valor_llantas: actual.cf_valor_llantas,
          cf_valor_piezas_especiales: actual.cf_valor_piezas_especiales,
          cf_valor_rescate_porcentaje: actual.cf_valor_rescate_porcentaje,
          cf_vida_economica_anios: actual.cf_vida_economica_anios,
          cf_horas_uso_anual: actual.cf_horas_uso_anual,
          cf_tasa_interes_anual_porcentaje: actual.cf_tasa_interes_anual_porcentaje,
          cf_tasa_seguros_anual_porcentaje: actual.cf_tasa_seguros_anual_porcentaje,
          cf_mantenimiento_porcentaje: actual.cf_mantenimiento_porcentaje,
        });
        await recargarEquipos();
        setSeleccionadaId(actualizado.id);
      } else {
        const creado = await createEquipoCostoHorario({
          clave: nuevaClave.trim(),
          descripcion: nuevaDescripcion.trim(),
          unidad_id: nuevaUnidadId,
          familia_id: nuevaFamiliaId,
          sub_familia_id: nuevaSubfamiliaId,
          cf_costo_maquina: "0",
          cf_valor_llantas: "0",
          cf_valor_piezas_especiales: "0",
          cf_valor_rescate_porcentaje: "0",
          cf_vida_economica_anios: "1",
          cf_horas_uso_anual: "1",
          cf_tasa_interes_anual_porcentaje: "0",
          cf_tasa_seguros_anual_porcentaje: "0",
          cf_mantenimiento_porcentaje: "0",
        });
        await recargarEquipos();
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

  const seleccionada = equipos.find((e) => e.id === seleccionadaId) ?? null;

  const confirmarEliminar = async () => {
    if (!seleccionada) return;
    setError(null);
    try {
      await deleteEquipoCostoHorario(seleccionada.id);
      setConfirmandoEliminar(false);
      setSeleccionadaId(null);
      cancelarFormulario();
      await recargarEquipos();
    } catch (e) {
      setConfirmandoEliminar(false);
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ActionBar
                actions={[
                  { icon: Plus, title: "Nuevo equipo", onClick: iniciarCreacion },
                  {
                    icon: Pencil,
                    title: "Editar equipo seleccionado",
                    onClick: () => seleccionada && iniciarEdicion(seleccionada),
                    disabled: !seleccionada,
                  },
                ]}
              />
              <SearchInput value={busqueda} onChange={setBusqueda} />
            </div>
            <ActionBarMenu
              menu={[
                { icon: RefreshCcw, title: "Recargar", onClick: recargarTodo },
                {
                  icon: Trash2,
                  title: "Eliminar equipo seleccionado",
                  onClick: () => setConfirmandoEliminar(true),
                  disabled: !seleccionada,
                  destructive: true,
                },
              ]}
            />
          </div>

          <div className="min-w-0">
            {cargando && equipos.length === 0 ? (
              <p className="py-1.5 text-xs text-muted-foreground">Cargando…</p>
            ) : equiposFiltrados.length === 0 ? (
              <p className="py-1.5 text-xs text-muted-foreground">Sin equipos todavía.</p>
            ) : (
              <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
                {equiposFiltrados.map((e) => {
                  const activa = seleccionadaId === e.id;
                  return (
                    <button
                      key={e.id}
                      ref={(el) => {
                        if (el) itemRefs.current.set(e.id, el);
                        else itemRefs.current.delete(e.id);
                      }}
                      type="button"
                      aria-current={activa ? "true" : undefined}
                      onClick={() => setSeleccionadaId(e.id)}
                      className={cn(
                        "relative flex w-64 shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left outline-none hover:bg-muted/50",
                        activa ? "border-primary bg-primary/10" : "border-border",
                      )}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="font-mono text-[15px] font-semibold tabular-nums tracking-tight text-foreground">
                          {e.clave}
                        </span>
                        <span className="shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                          ${fmt(e.costo_nacional?.costo_total ?? "0")}
                        </span>
                      </div>
                      <span className="line-clamp-2 w-full font-mono text-xs font-normal text-muted-foreground">{e.descripcion}</span>
                      <div className="mt-0.5 flex w-full items-center justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <APP_ICONS.grupo_cargos_fijos.icono size={16} className={APP_ICONS.grupo_cargos_fijos.color} />$
                          {fmt(e.cf_cargo_fijo_hora)}
                        </span>
                        <span className="flex items-center gap-1">
                          <APP_ICONS.grupo_consumo.icono size={16} className={APP_ICONS.grupo_consumo.color} />$
                          {fmt(e.costo_nacional?.subtotal_consumo ?? "0")}
                        </span>
                        <span className="flex items-center gap-1">
                          <APP_ICONS.grupo_operacion.icono size={16} className={APP_ICONS.grupo_operacion.color} />$
                          {fmt(e.costo_nacional?.subtotal_operacion ?? "0")}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-2">
          {seleccionada ? (
            <EquipoCostoHorarioFichaApu equipo={seleccionada} onCambio={recargarEquipos} />
          ) : (
            <p className="text-center text-xs text-muted-foreground">Elige un equipo de la lista.</p>
          )}
        </div>
      </div>

      <AlertDialog open={confirmandoEliminar} onOpenChange={setConfirmandoEliminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el equipo seleccionado?</AlertDialogTitle>
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
            <SheetTitle>{editandoId ? "Editar equipo" : "Nuevo equipo"}</SheetTitle>
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
              onClick={() => void guardarEquipo()}
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
