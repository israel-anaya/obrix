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
import { BasicoAuxiliarAnalisisInsumo } from "@/features/catalogos/proyecto/basicos-auxiliares/BasicoAuxiliarAnalisisInsumo";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
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
import { useCardRail } from "@/hooks/useCardRail";
import { CardRail } from "@/components/CardRail";
import { IdentidadSheet } from "../shared/analisis-maestro-detalle/IdentidadSheet";

/**
 * Vista "Análisis" de Básicos y Auxiliares — franja de tarjetas horizontal
 * arriba, tarjeta de análisis debajo ocupando todo el ancho
 * (`BasicoAuxiliarAnalisisInsumo`, sin cambios). Enfoque alterno a
 * `BasicoAuxiliarGridVista` (grid) — mismos datos y comandos de Tauri por
 * debajo.
 *
 * Agregar/editar/eliminar/recargar viven todos juntos en la barra de
 * acciones del encabezado, junto al buscador — un solo formulario (en un
 * `Sheet`, igual que `CuadrillasAnalisis`) sirve tanto para crear como para
 * editar la identidad del auxiliar (clave/descripción/unidad/familia). La
 * receta (material/mano de obra/equipo/otros auxiliares) vive en el análisis
 * de detalle, no aquí.
 */
export function BasicoAuxiliarAnalisis() {
  const [auxiliares, setAuxiliares] = useState<BasicoAuxiliar[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

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

  const { search: busqueda, setSearch: setBusqueda, filteredItems: auxiliaresFiltrados, selectedId: seleccionadaId, setSelectedId: setSeleccionadaId, selected: seleccionada, cursorId, scrollRef, virtualizer, selectIfEmpty: seleccionarSiVacia } =
    useCardRail({ items: auxiliares, locked: creando || !!editandoId });

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const recargarAuxiliares = () => {
    setCargando(true);
    return listBasicosAuxiliares()
      .then((r) => {
        setAuxiliares(r);
        // Si nada está seleccionado (primera carga) arranca en el primero por
        // clave — misma hoja que el tope de la lista ordenada. Un análisis
        // vacío es menos útil que abrir directo.
        seleccionarSiVacia(ordenarPor(r, (a) => a.clave)[0]?.id ?? null);
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border p-2">
          <div className="flex items-center gap-2">
            <ActionBar
              actions={[
                { icon: Plus, title: "Nuevo básico auxiliar", onClick: iniciarCreacion },
                {
                  icon: Pencil,
                  title: "Editar auxiliar seleccionado",
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
                title: "Eliminar auxiliar seleccionado",
                onClick: () => setConfirmandoEliminar(true),
                disabled: !seleccionadaId,
                destructive: true,
              },
            ]}
          />
        </div>
        <CardRail
          items={auxiliaresFiltrados}
          cursorId={cursorId}
          onSelect={setSeleccionadaId}
          scrollRef={scrollRef}
          virtualizer={virtualizer}
          loading={cargando}
          emptyMessage="Sin básicos ni auxiliares todavía."
          totalCost={(a) => a.costo_nacional?.costo_total ?? "0"}
        />

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-2">
          {seleccionada ? (
            <BasicoAuxiliarAnalisisInsumo auxiliar={seleccionada} onCambio={recargarAuxiliares} />
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

      <IdentidadSheet
        open={creando || !!editandoId}
        titulo={editandoId ? "Editar básico auxiliar" : "Nuevo básico auxiliar"}
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
        onGuardar={() => void guardarAuxiliar()}
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
