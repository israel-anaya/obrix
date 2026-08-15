import { useEffect, useMemo, useRef, useState } from "react";
import { Fuel, HardHat, Pencil, Plus, RefreshCcw, Timer, Trash2 } from "lucide-react";
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
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { EquipoCostoHorarioFichaApu } from "@/features/catalogos/EquipoCostoHorarioFichaApu";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createEquipoCostoHorario,
  deleteEquipoCostoHorario,
  listEquiposCostoHorario,
  listFamiliasInsumo,
  listRegiones,
  listUnidadesMedida,
  updateEquipoCostoHorario,
} from "@/lib/tauri";
import type { EquipoCostoHorario, FamiliaInsumo, Region, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA = "Equipo y herramienta";

function fmt(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Vista "Ficha" de Equipo de costo horario — mismo patrón que
 * `CuadrillasFicha`: fichero angosto a la izquierda, tarjeta de análisis a
 * la derecha (`EquipoCostoHorarioFichaApu`). Enfoque alterno a
 * `EquipoCostoHorarioGridVista` (grid) — mismos datos y comandos de Tauri
 * por debajo.
 *
 * A diferencia de `CuadrillasFicha`, este formulario solo cubre los datos de
 * "identidad" del equipo (clave/descripción/unidad/familia/región/activo) —
 * los 9 valores de captura de cargos fijos viven en la ficha de detalle, no
 * aquí, para que se vea el desglose calculado mientras se ajustan.
 */
export function EquipoCostoHorarioFicha() {
  const [equipos, setEquipos] = useState<EquipoCostoHorario[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
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
  const [nuevaRegionId, setNuevaRegionId] = useState<string | null>(null);
  const [guardandoNueva, setGuardandoNueva] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const recargarEquipos = () => {
    setCargando(true);
    return listEquiposCostoHorario()
      .then((r) => {
        setEquipos(r);
        // Si nada está seleccionado (primera carga) arranca en el primero —
        // una ficha vacía es menos útil que abrir directo en la primera hoja.
        setSeleccionadaId((actual) => actual ?? r[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  const recargarTodo = () => {
    void recargarEquipos();
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listRegiones().then(setRegiones).catch((e) => setError(String(e)));
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
    if (!q) return equipos;
    return equipos.filter((e) => e.clave.toLowerCase().includes(q) || e.descripcion.toLowerCase().includes(q));
  }, [equipos, busqueda]);

  // Navegación con ↑/↓ entre equipos — ignorada si el foco está en un campo
  // de texto/select (el formulario de alta/edición también usa flechas para
  // moverse dentro del valor).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (equiposFiltrados.length === 0) return;
      e.preventDefault();
      const idxActual = equiposFiltrados.findIndex((e) => e.id === seleccionadaId);
      const delta = e.key === "ArrowUp" ? -1 : 1;
      const idxNuevo = idxActual === -1 ? 0 : Math.min(Math.max(idxActual + delta, 0), equiposFiltrados.length - 1);
      setSeleccionadaId(equiposFiltrados[idxNuevo].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [equiposFiltrados, seleccionadaId]);

  useEffect(() => {
    if (!seleccionadaId) return;
    itemRefs.current.get(seleccionadaId)?.scrollIntoView({ block: "nearest" });
  }, [seleccionadaId]);

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
    setNuevaRegionId(null);
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
    setNuevaRegionId(e.region_id);
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
          activo: actual.activo,
          region_id: nuevaRegionId,
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
          activo: true,
          region_id: nuevaRegionId,
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
      {error && (
        <div className="border-b border-border px-3 py-1.5">
          <p className="text-xs font-medium text-destructive">{error}</p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border p-2">
            <Buscador value={busqueda} onChange={setBusqueda} />
            <BarraAcciones
              acciones={[
                { icono: Plus, titulo: "Nuevo equipo", onClick: iniciarCreacion },
                {
                  icono: Pencil,
                  titulo: "Editar equipo seleccionado",
                  onClick: () => seleccionada && iniciarEdicion(seleccionada),
                  disabled: !seleccionada,
                },
              ]}
              menu={[
                { icono: RefreshCcw, titulo: "Recargar", onClick: recargarTodo },
                {
                  icono: Trash2,
                  titulo: "Eliminar equipo seleccionado",
                  onClick: () => setConfirmandoEliminar(true),
                  disabled: !seleccionada,
                  destructivo: true,
                },
              ]}
            />
          </div>
          {(creando || editandoId) && (
            <div className="border-b border-border p-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {editandoId ? "Editar equipo" : "Nuevo equipo"}
                </span>
                <input
                  autoFocus
                  placeholder="Clave"
                  value={nuevaClave}
                  onChange={(e) => setNuevaClave(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                />
                <textarea
                  placeholder="Descripción"
                  value={nuevaDescripcion}
                  onChange={(e) => setNuevaDescripcion(e.target.value)}
                  rows={6}
                  className="resize-none rounded border border-border bg-background px-2 py-1 text-xs"
                />
                <select
                  value={nuevaUnidadId}
                  onChange={(e) => setNuevaUnidadId(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.simbolo}
                    </option>
                  ))}
                </select>
                <select
                  value={nuevaFamiliaId ?? ""}
                  onChange={(e) => {
                    setNuevaFamiliaId(e.target.value || null);
                    setNuevaSubfamiliaId(null);
                  }}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">— Sin familia —</option>
                  {raicesFamilia.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
                <select
                  value={nuevaSubfamiliaId ?? ""}
                  onChange={(e) => setNuevaSubfamiliaId(e.target.value || null)}
                  disabled={hijasNueva.length === 0}
                  className={cn(
                    "rounded border border-border bg-background px-2 py-1 text-xs",
                    hijasNueva.length === 0 && "opacity-50",
                  )}
                >
                  <option value="">— Sin sub familia —</option>
                  {hijasNueva.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.nombre}
                    </option>
                  ))}
                </select>
                <select
                  value={nuevaRegionId ?? ""}
                  onChange={(e) => setNuevaRegionId(e.target.value || null)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">— Nacional —</option>
                  {regiones.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-2">
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
                </div>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cargando && equipos.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Cargando…</p>
            ) : equiposFiltrados.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Sin equipos todavía.</p>
            ) : (
              equiposFiltrados.map((e) => {
                const costo = Number(e.costo_horario_total) || 0;
                const fijo = Number(e.cf_cargo_fijo_hora) || 0;
                const consumo = Number(e.subtotal_consumo) || 0;
                const operacion = Number(e.subtotal_operacion) || 0;
                const pctFijo = costo > 0 ? (fijo / costo) * 100 : 0;
                const pctConsumo = costo > 0 ? (consumo / costo) * 100 : 0;
                const pctOperacion = costo > 0 ? (operacion / costo) * 100 : 0;
                return (
                  <button
                    key={e.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(e.id, el);
                      else itemRefs.current.delete(e.id);
                    }}
                    type="button"
                    onClick={() => setSeleccionadaId(e.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2 text-left hover:bg-muted/50",
                      seleccionadaId === e.id && "bg-muted",
                      !e.activo && "opacity-60",
                    )}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">{e.clave}</span>
                    <span className="line-clamp-6 w-full text-xs font-medium">{e.descripcion}</span>
                    <div className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="bg-blue-500" style={{ width: `${pctFijo}%` }} />
                      <div className="bg-amber-500" style={{ width: `${pctConsumo}%` }} />
                      <div className="bg-violet-500" style={{ width: `${pctOperacion}%` }} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Timer size={11} className="text-blue-500" />${fmt(e.cf_cargo_fijo_hora)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Fuel size={11} className="text-amber-500" />${fmt(e.subtotal_consumo)}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardHat size={11} className="text-violet-500" />${fmt(e.subtotal_operacion)}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-foreground">${fmt(e.costo_horario_total)}/hr</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4">
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
    </div>
  );
}
