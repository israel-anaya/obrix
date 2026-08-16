import { useEffect, useMemo, useRef, useState } from "react";
import { HardHat, Pencil, Plus, RefreshCcw, Trash2, Wrench } from "lucide-react";
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
import { CuadrillaFichaApu } from "@/features/catalogos/CuadrillaFichaApu";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createCuadrilla,
  deleteCuadrilla,
  listCuadrillas,
  listFamiliasInsumo,
  listUnidadesMedida,
  updateCuadrilla,
} from "@/lib/tauri";
import type { Cuadrilla, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const NOMBRE_FAMILIA_MANO_OBRA = "Mano de obra";

function fmt(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Vista "Ficha" de Cuadrillas de trabajo — un fichero: lista angosta de
 * claves a la izquierda (como el lomo de un rolodex/expediente), tarjeta de
 * análisis de precio unitario a la derecha (`CuadrillaFichaApu`). Enfoque
 * alterno a `CuadrillasGridVista` (grid) — mismos datos y comandos de Tauri
 * por debajo.
 *
 * Agregar/editar/eliminar/recargar viven todos juntos en la barra de
 * acciones del encabezado, junto al buscador — un solo formulario (en la
 * base de la lista) sirve tanto para crear como para editar la cuadrilla
 * seleccionada.
 */
export function CuadrillasFicha() {
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);

  // El mismo formulario sirve para crear y para editar — `editandoId` es
  // `null` cuando se está creando, o el id de la cuadrilla que se está
  // editando (ver `iniciarEdicion`, disparado desde el lápiz de la barra
  // de acciones).
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

  const recargarCuadrillas = () => {
    setCargando(true);
    return listCuadrillas()
      .then((r) => {
        setCuadrillas(r);
        // Si nada está seleccionado (primera carga) arranca en la primera —
        // una ficha vacía es menos útil que abrir directo en la primera hoja.
        setSeleccionadaId((actual) => actual ?? r[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  const recargarTodo = () => {
    void recargarCuadrillas();
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
  };

  const raicesFamilia = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);
  const familiaManoDeObraId = useMemo(
    () => raicesFamilia.find((f) => f.nombre === NOMBRE_FAMILIA_MANO_OBRA)?.id ?? null,
    [raicesFamilia],
  );
  const hijasNueva = nuevaFamiliaId ? (hijasPorPadreId[nuevaFamiliaId] ?? []) : [];

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const cuadrillasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cuadrillas;
    return cuadrillas.filter((c) => c.clave.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q));
  }, [cuadrillas, busqueda]);

  // Navegación con ↑/↓ entre cuadrillas — ignorada si el foco está en un
  // campo de texto/select (el formulario de alta/edición también usa
  // flechas para moverse dentro del valor).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (cuadrillasFiltradas.length === 0) return;
      e.preventDefault();
      const idxActual = cuadrillasFiltradas.findIndex((c) => c.id === seleccionadaId);
      const delta = e.key === "ArrowUp" ? -1 : 1;
      const idxNuevo =
        idxActual === -1 ? 0 : Math.min(Math.max(idxActual + delta, 0), cuadrillasFiltradas.length - 1);
      setSeleccionadaId(cuadrillasFiltradas[idxNuevo].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cuadrillasFiltradas, seleccionadaId]);

  useEffect(() => {
    if (!seleccionadaId) return;
    itemRefs.current.get(seleccionadaId)?.scrollIntoView({ block: "nearest" });
  }, [seleccionadaId]);

  const iniciarCreacion = () => {
    setEditandoId(null);
    setNuevaClave("");
    setNuevaDescripcion("");
    // "jor" (jornada) es la unidad casi universal de una cuadrilla — evita
    // que quien da de alta tenga que buscarla cada vez.
    const unidadJornada = unidades.find((u) => u.simbolo.toLowerCase() === "jor");
    setNuevaUnidadId(unidadJornada?.id ?? unidades[0]?.id ?? "");
    // Una cuadrilla es, por naturaleza, mano de obra — evita que quien da de
    // alta tenga que elegirla cada vez.
    setNuevaFamiliaId(familiaManoDeObraId);
    setNuevaSubfamiliaId(null);
    setError(null);
    setCreando(true);
  };

  const iniciarEdicion = (c: Cuadrilla) => {
    setCreando(false);
    setEditandoId(c.id);
    setNuevaClave(c.clave);
    setNuevaDescripcion(c.descripcion);
    setNuevaUnidadId(c.unidad_id);
    setNuevaFamiliaId(c.familia_id);
    setNuevaSubfamiliaId(c.sub_familia_id);
    setError(null);
  };

  const cancelarFormulario = () => {
    setCreando(false);
    setEditandoId(null);
    setError(null);
  };

  const guardarCuadrilla = async () => {
    if (!nuevaClave.trim() || !nuevaDescripcion.trim() || !nuevaUnidadId) {
      setError("Clave, descripción y unidad son requeridos.");
      return;
    }
    setGuardandoNueva(true);
    setError(null);
    try {
      if (editandoId) {
        const actualizada = await updateCuadrilla(editandoId, {
          clave: nuevaClave.trim(),
          descripcion: nuevaDescripcion.trim(),
          unidad_id: nuevaUnidadId,
          familia_id: nuevaFamiliaId,
          sub_familia_id: nuevaSubfamiliaId,
        });
        await recargarCuadrillas();
        setSeleccionadaId(actualizada.id);
      } else {
        const creada = await createCuadrilla({
          clave: nuevaClave.trim(),
          descripcion: nuevaDescripcion.trim(),
          unidad_id: nuevaUnidadId,
          familia_id: nuevaFamiliaId,
          sub_familia_id: nuevaSubfamiliaId,
        });
        await recargarCuadrillas();
        setSeleccionadaId(creada.id);
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

  const seleccionada = cuadrillas.find((c) => c.id === seleccionadaId) ?? null;

  const confirmarEliminar = async () => {
    if (!seleccionada) return;
    setError(null);
    try {
      await deleteCuadrilla(seleccionada.id);
      setConfirmandoEliminar(false);
      setSeleccionadaId(null);
      cancelarFormulario();
      await recargarCuadrillas();
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
                { icono: Plus, titulo: "Nueva cuadrilla", onClick: iniciarCreacion },
                {
                  icono: Pencil,
                  titulo: "Editar cuadrilla seleccionada",
                  onClick: () => seleccionada && iniciarEdicion(seleccionada),
                  disabled: !seleccionada,
                },
              ]}
              menu={[
                { icono: RefreshCcw, titulo: "Recargar", onClick: recargarTodo },
                {
                  icono: Trash2,
                  titulo: "Eliminar cuadrilla seleccionada",
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
                  {editandoId ? "Editar cuadrilla" : "Nueva cuadrilla"}
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
                    onClick={() => void guardarCuadrilla()}
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
            {cargando && cuadrillas.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Cargando…</p>
            ) : cuadrillasFiltradas.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Sin cuadrillas todavía.</p>
            ) : (
              cuadrillasFiltradas.map((c) => {
                const costo = Number(c.costo_total) || 0;
                const mo = Number(c.sub_total_mano_obra) || 0;
                const he = Number(c.sub_total_herramienta) || 0;
                const pctMo = costo > 0 ? (mo / costo) * 100 : 0;
                const pctHe = costo > 0 ? (he / costo) * 100 : 0;
                return (
                  <button
                    key={c.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(c.id, el);
                      else itemRefs.current.delete(c.id);
                    }}
                    type="button"
                    onClick={() => setSeleccionadaId(c.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2 text-left hover:bg-muted/50",
                      seleccionadaId === c.id && "bg-muted",
                    )}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">{c.clave}</span>
                    <span className="line-clamp-6 w-full text-xs font-medium">{c.descripcion}</span>
                    <div className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="bg-blue-500" style={{ width: `${pctMo}%` }} />
                      <div className="bg-amber-500" style={{ width: `${pctHe}%` }} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <HardHat size={11} className="text-blue-500" />${fmt(c.sub_total_mano_obra)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Wrench size={11} className="text-amber-500" />${fmt(c.sub_total_herramienta)}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-foreground">${fmt(c.costo_total)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4">
          {seleccionada ? (
            <CuadrillaFichaApu cuadrilla={seleccionada} onCambio={recargarCuadrillas} />
          ) : (
            <p className="text-center text-xs text-muted-foreground">Elige una cuadrilla de la lista.</p>
          )}
        </div>
      </div>

      <AlertDialog open={confirmandoEliminar} onOpenChange={setConfirmandoEliminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la cuadrilla seleccionada?</AlertDialogTitle>
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
