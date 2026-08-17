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
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import { SearchInput } from "@/components/SearchInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { CuadrillaFichaApu } from "@/features/catalogos/CuadrillaFichaApu";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { formatearFecha } from "@/lib/fecha";
import { ordenarPor } from "@/lib/ordenar";
import {
  createCuadrilla,
  deleteCuadrilla,
  listCuadrillas,
  listFamiliasInsumo,
  listUnidadesMedida,
  listUsuarios,
  updateCuadrilla,
} from "@/lib/tauri";
import type { Cuadrilla, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const NOMBRE_FAMILIA_MANO_OBRA = "Mano de obra";
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
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const recargarCuadrillas = () => {
    setCargando(true);
    return listCuadrillas()
      .then((r) => {
        setCuadrillas(r);
        // Si nada está seleccionado (primera carga) arranca en la primera por
        // clave — misma hoja que el tope de la lista ordenada. Una ficha
        // vacía es menos útil que abrir directo.
        setSeleccionadaId((actual) => actual ?? ordenarPor(r, (c) => c.clave)[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  const recargarTodo = () => {
    void recargarCuadrillas();
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
    const lista = ordenarPor(cuadrillas, (c) => c.clave);
    if (!q) return lista;
    return lista.filter((c) => c.clave.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q));
  }, [cuadrillas, busqueda]);

  // Navegación con ↑/↓ entre cuadrillas — ignorada mientras el formulario de
  // alta/edición está abierto (vive en un `Sheet` modal, y también usa
  // flechas para moverse dentro de sus campos) o si el foco está en un campo
  // de texto suelto en otro lado.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (creando || editandoId) return;
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
  }, [cuadrillasFiltradas, seleccionadaId, creando, editandoId]);

  useEffect(() => {
    if (!seleccionadaId) return;
    itemRefs.current.get(seleccionadaId)?.scrollIntoView({ block: "nearest" });
  }, [seleccionadaId, cuadrillasFiltradas]);

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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border p-2">
            <SearchInput value={busqueda} onChange={setBusqueda} />
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
          <div
            className="flex items-center gap-2 border-b border-border px-3 py-1 text-[10px] text-muted-foreground"
            title="Proporción del costo: mano de obra (azul) vs. herramienta (ámbar)"
          >
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 shrink-0 rounded-sm bg-blue-500" aria-hidden />
              MO
            </span>
            <span aria-hidden>/</span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 shrink-0 rounded-sm bg-amber-500" aria-hidden />
              Herramienta
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cargando && cuadrillas.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Cargando…</p>
            ) : cuadrillasFiltradas.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Sin cuadrillas todavía.</p>
            ) : (
              cuadrillasFiltradas.map((c) => {
                const costo = Number(c.costo_nacional?.costo_total) || 0;
                const mo = Number(c.costo_nacional?.sub_total_mano_obra) || 0;
                const he = Number(c.costo_nacional?.sub_total_herramienta) || 0;
                const pctMo = costo > 0 ? (mo / costo) * 100 : 0;
                const pctHe = costo > 0 ? (he / costo) * 100 : 0;
                const activa = seleccionadaId === c.id;
                return (
                  <button
                    key={c.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(c.id, el);
                      else itemRefs.current.delete(c.id);
                    }}
                    type="button"
                    aria-current={activa ? "true" : undefined}
                    onClick={() => setSeleccionadaId(c.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b border-border/50 border-l-2 px-3 py-2 text-left hover:bg-muted/50",
                      activa
                        ? "border-l-primary bg-primary/10"
                        : "border-l-transparent",
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="font-mono text-[15px] font-semibold tabular-nums tracking-tight text-foreground">
                        {c.clave}
                      </span>
                      <span className="shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
                        ${fmt(c.costo_nacional?.costo_total ?? "0")}
                      </span>
                    </div>
                    <span className="line-clamp-6 w-full font-mono text-xs font-normal text-muted-foreground">{c.descripcion}</span>
                    <div
                      className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      title={`MO ${pctMo.toFixed(0)}% / Herramienta ${pctHe.toFixed(0)}%`}
                    >
                      <div className="bg-blue-500" style={{ width: `${pctMo}%` }} />
                      <div className="bg-amber-500" style={{ width: `${pctHe}%` }} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <HardHat size={16} className="text-blue-500" />${fmt(c.costo_nacional?.sub_total_mano_obra ?? "0")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Wrench size={16} className="text-amber-500" />${fmt(c.costo_nacional?.sub_total_herramienta ?? "0")}
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

      <Sheet open={creando || !!editandoId} onOpenChange={(open) => !open && cancelarFormulario()}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editandoId ? "Editar cuadrilla" : "Nueva cuadrilla"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Campo label="Clave">
              <input
                autoFocus
                value={nuevaClave}
                onChange={(e) => setNuevaClave(e.target.value)}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="Descripción">
              <textarea
                value={nuevaDescripcion}
                onChange={(e) => setNuevaDescripcion(e.target.value)}
                rows={4}
                className={cn(CAMPO_INPUT_CLASE, "resize-none")}
              />
            </Campo>
            <Campo label="Unidad">
              <Select value={nuevaUnidadId} onValueChange={setNuevaUnidadId}>
                <SelectTrigger className={CAMPO_INPUT_CLASE}>
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
            </Campo>
            <Campo label="Familia">
              <Select
                value={nuevaFamiliaId ?? SIN_FAMILIA_VALOR}
                onValueChange={(v) => {
                  setNuevaFamiliaId(v === SIN_FAMILIA_VALOR ? null : v);
                  setNuevaSubfamiliaId(null);
                }}
              >
                <SelectTrigger className={CAMPO_INPUT_CLASE}>
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
            </Campo>
            <Campo label="Sub familia">
              <Select
                value={nuevaSubfamiliaId ?? SIN_SUBFAMILIA_VALOR}
                onValueChange={(v) => setNuevaSubfamiliaId(v === SIN_SUBFAMILIA_VALOR ? null : v)}
                disabled={hijasNueva.length === 0}
              >
                <SelectTrigger className={cn(CAMPO_INPUT_CLASE, hijasNueva.length === 0 && "opacity-50")}>
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
            </Campo>

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
              onClick={() => void guardarCuadrilla()}
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
