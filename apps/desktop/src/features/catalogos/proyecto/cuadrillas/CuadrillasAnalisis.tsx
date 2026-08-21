import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { ActionBar, ActionBarMenu } from "@/components/ActionBar";
import { SearchInput } from "@/components/SearchInput";
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
import { CuadrillaAnalisisInsumo } from "@/features/catalogos/proyecto/cuadrillas/CuadrillaAnalisisInsumo";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
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
import { useCardRail } from "@/hooks/useCardRail";
import { CardRail } from "@/components/CardRail";
import { IdentidadSheet } from "../shared/analisis-maestro-detalle/IdentidadSheet";

const NOMBRE_FAMILIA_MANO_OBRA = "Mano de obra";

/**
 * Vista "Análisis" de Cuadrillas de trabajo — franja de tarjetas horizontal
 * arriba (mismo patrón que `BasicoAuxiliarAnalisis`), tarjeta de análisis de
 * precio unitario debajo ocupando todo el ancho (`CuadrillaAnalisisInsumo`).
 * Enfoque alterno a `CuadrillasGridVista` (grid) — mismos datos y comandos
 * de Tauri por debajo.
 *
 * Agregar/editar/eliminar/recargar viven todos juntos en la barra de
 * acciones del encabezado, junto al buscador — un solo formulario (en un
 * `Sheet`) sirve tanto para crear como para editar la cuadrilla
 * seleccionada.
 */
export function CuadrillasAnalisis() {
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

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

  const { search: busqueda, setSearch: setBusqueda, filteredItems: cuadrillasFiltradas, selectedId: seleccionadaId, setSelectedId: setSeleccionadaId, selected: seleccionada, cursorId, scrollRef, virtualizer, selectIfEmpty: seleccionarSiVacia } =
    useCardRail({ items: cuadrillas, locked: creando || !!editandoId });

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const recargarCuadrillas = () => {
    setCargando(true);
    return listCuadrillas()
      .then((r) => {
        setCuadrillas(r);
        // Si nada está seleccionado (primera carga) arranca en la primera por
        // clave — misma hoja que el tope de la lista ordenada. Un análisis
        // vacío es menos útil que abrir directo.
        seleccionarSiVacia(ordenarPor(r, (c) => c.clave)[0]?.id ?? null);
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border p-2">
          <div className="flex items-center gap-2">
            <ActionBar
              actions={[
                { icon: Plus, title: "Nueva cuadrilla", onClick: iniciarCreacion },
                {
                  icon: Pencil,
                  title: "Editar cuadrilla seleccionada",
                  onClick: () => seleccionada && iniciarEdicion(seleccionada),
                  disabled: !seleccionadaId,
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
                title: "Eliminar cuadrilla seleccionada",
                onClick: () => setConfirmandoEliminar(true),
                disabled: !seleccionadaId,
                destructive: true,
              },
            ]}
          />
        </div>
        <CardRail
          items={cuadrillasFiltradas}
          cursorId={cursorId}
          onSelect={setSeleccionadaId}
          scrollRef={scrollRef}
          virtualizer={virtualizer}
          loading={cargando}
          emptyMessage="Sin cuadrillas todavía."
          totalCost={(c) => c.costo_nacional?.costo_total ?? "0"}
        />

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-2">
          {seleccionada ? (
            <CuadrillaAnalisisInsumo cuadrilla={seleccionada} onCambio={recargarCuadrillas} />
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

      <IdentidadSheet
        open={creando || !!editandoId}
        titulo={editandoId ? "Editar cuadrilla" : "Nueva cuadrilla"}
        clave={nuevaClave}
        onClaveChange={setNuevaClave}
        descripcion={nuevaDescripcion}
        onDescripcionChange={setNuevaDescripcion}
        unidadId={nuevaUnidadId}
        onUnidadIdChange={setNuevaUnidadId}
        unidades={unidades}
        familiaId={nuevaFamiliaId}
        onFamiliaIdChange={setNuevaFamiliaId}
        familiasRaiz={raicesFamilia}
        subfamiliaId={nuevaSubfamiliaId}
        onSubfamiliaIdChange={setNuevaSubfamiliaId}
        subfamiliasDisponibles={hijasNueva}
        error={error}
        guardando={guardandoNueva}
        onGuardar={() => void guardarCuadrilla()}
        onCancelar={cancelarFormulario}
        auditoria={
          editandoId && seleccionada
            ? {
                creadoEn: seleccionada.created_at,
                creadoPor: nombresPorUsuarioId[seleccionada.created_by] ?? seleccionada.created_by,
                actualizadoEn: seleccionada.updated_at,
                actualizadoPor: seleccionada.updated_by
                  ? (nombresPorUsuarioId[seleccionada.updated_by] ?? seleccionada.updated_by)
                  : null,
              }
            : null
        }
      />
    </div>
  );
}
