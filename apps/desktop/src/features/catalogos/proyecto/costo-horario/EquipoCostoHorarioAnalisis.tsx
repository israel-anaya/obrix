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
import { EquipoCostoHorarioAnalisisInsumo } from "@/features/catalogos/proyecto/costo-horario/EquipoCostoHorarioAnalisisInsumo";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
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
import { useCardRail } from "@/hooks/useCardRail";
import { CardRail } from "@/components/CardRail";
import { IdentidadSheet } from "../shared/analisis-maestro-detalle/IdentidadSheet";

const NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA = "Equipo y herramienta";

/**
 * Vista "Análisis" de Equipo de costo horario — franja de tarjetas
 * horizontal arriba (mismo patrón que `CuadrillasAnalisis`), tarjeta de
 * análisis debajo ocupando todo el ancho (`EquipoCostoHorarioAnalisisInsumo`).
 * Enfoque alterno a `EquipoCostoHorarioGridVista` (grid) — mismos datos y
 * comandos de Tauri por debajo.
 *
 * Agregar/editar/eliminar/recargar viven todos juntos en la barra de
 * acciones del encabezado, junto al buscador — un solo formulario (en un
 * `Sheet`, igual que `CuadrillasAnalisis`) sirve tanto para crear como para
 * editar la identidad del equipo (clave/descripción/unidad/familia).
 * Los 9 valores de captura de cargos fijos viven en el análisis de detalle,
 * no aquí, para que se vea el desglose calculado mientras se ajustan — al
 * guardar solo la identidad hay que arrastrarlos tal cual para no perderlos.
 */
export function EquipoCostoHorarioAnalisis() {
  const [equipos, setEquipos] = useState<EquipoCostoHorario[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

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

  const { search: busqueda, setSearch: setBusqueda, filteredItems: equiposFiltrados, selectedId: seleccionadaId, setSelectedId: setSeleccionadaId, selected: seleccionada, cursorId, scrollRef, virtualizer, selectIfEmpty: seleccionarSiVacia } =
    useCardRail({ items: equipos, locked: creando || !!editandoId });

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const recargarEquipos = () => {
    setCargando(true);
    return listEquiposCostoHorario()
      .then((r) => {
        setEquipos(r);
        // Si nada está seleccionado (primera carga) arranca en el primero por
        // clave — misma hoja que el tope de la lista ordenada. Un análisis
        // vacío es menos útil que abrir directo.
        seleccionarSiVacia(ordenarPor(r, (e) => e.clave)[0]?.id ?? null);
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
        <div className="flex items-center justify-between gap-2 border-b border-border p-2">
          <div className="flex items-center gap-2">
            <ActionBar
              actions={[
                { icon: Plus, title: "Nuevo equipo", onClick: iniciarCreacion },
                {
                  icon: Pencil,
                  title: "Editar equipo seleccionado",
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
                title: "Eliminar equipo seleccionado",
                onClick: () => setConfirmandoEliminar(true),
                disabled: !seleccionadaId,
                destructive: true,
              },
            ]}
          />
        </div>
        <CardRail
          items={equiposFiltrados}
          cursorId={cursorId}
          onSelect={setSeleccionadaId}
          scrollRef={scrollRef}
          virtualizer={virtualizer}
          loading={cargando}
          emptyMessage="Sin equipos todavía."
          totalCost={(e) => e.costo_nacional?.costo_total ?? "0"}
        />

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-2">
          {seleccionada ? (
            <EquipoCostoHorarioAnalisisInsumo equipo={seleccionada} onCambio={recargarEquipos} />
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

      <IdentidadSheet
        open={creando || !!editandoId}
        titulo={editandoId ? "Editar equipo" : "Nuevo equipo"}
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
        onGuardar={() => void guardarEquipo()}
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
