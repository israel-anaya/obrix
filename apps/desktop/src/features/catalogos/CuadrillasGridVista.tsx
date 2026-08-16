import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2, Users } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { CuadrillaDetallePanel } from "@/features/catalogos/CuadrillaDetallePanel";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createCuadrilla,
  deleteCuadrilla,
  listCuadrillas,
  listFamiliasInsumo,
  listUnidadesMedida,
  listUsuarios,
  updateCuadrilla,
} from "@/lib/tauri";
import type { Cuadrilla, CuadrillaData, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_FAMILIA = "— Sin familia —";
const SIN_SUBFAMILIA = "— Sin sub familia —";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 180, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 180, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

/**
 * Vista "Grid" de Cuadrillas de trabajo — grid de `cuadrilla` (extensión de
 * `insumo` cuando `tipo = mano_obra`, un equipo de trabajo compuesto) +
 * panel lateral con la composición (integrantes y herramienta) de la
 * cuadrilla seleccionada, mismo patrón maestro/detalle que
 * `CategoriaFasarSeccion`/`SalarioCategoriaFasarPanel`. Los tres subtotales
 * que se ven en el grid son cache: los recalcula el backend a partir de la
 * composición, no son editables aquí. Alternativa a `CuadrillasFicha`
 * (ver `CuadrillasSeccion`, que alterna entre las dos).
 */
export function CuadrillasGridVista() {
  const gridRef = useRef<DataGridHandle>(null);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [panelComposicionAbierto, setPanelComposicionAbierto] = useState(false);
  const [cuadrillaSeleccionadaId, setCuadrillaSeleccionadaId] = useState<string | null>(null);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!guardadoExitoso) return;
    const espera = setTimeout(() => setGuardadoExitoso(false), 3000);
    return () => clearTimeout(espera);
  }, [guardadoExitoso]);

  const recargarCuadrillas = () => {
    setCargando(true);
    return listCuadrillas()
      .then(setCuadrillas)
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

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const simboloPorUnidadId = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    [unidades],
  );
  const unidadIdPorSimbolo = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.simbolo, u.id])),
    [unidades],
  );

  const raicesFamilia = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);
  const nombrePorFamiliaId = useMemo(
    () => Object.fromEntries(familias.map((f) => [f.id, f.nombre])),
    [familias],
  );
  const raizIdPorNombre = useMemo(
    () => Object.fromEntries(raicesFamilia.map((f) => [f.nombre, f.id])),
    [raicesFamilia],
  );

  const config: DataGridConfig = useMemo(
    () => ({
      title: "Cuadrillas de trabajo",
      columns: [
        { field: "clave", header: "Clave", width: 110 },
        { field: "descripcion", header: "Descripción", width: 280 },
        { field: "unidad", header: "Unidad", width: 100, options: unidades.map((u) => u.simbolo) },
        {
          field: "familia",
          header: "Familia",
          width: 180,
          options: [SIN_FAMILIA, ...raicesFamilia.map((f) => f.nombre)],
        },
        {
          field: "subfamilia",
          header: "Sub familia",
          width: 180,
          options: (fila) => {
            const familiaId = raizIdPorNombre[String(fila.familia)];
            const hijas = familiaId ? (hijasPorPadreId[familiaId] ?? []) : [];
            return [SIN_SUBFAMILIA, ...hijas.map((h) => h.nombre)];
          },
        },
        { field: "sub_total_mano_obra", header: "Mano de obra", width: 130, readOnly: true },
        { field: "sub_total_herramienta", header: "Herramienta", width: 130, readOnly: true },
        { field: "costo_total", header: "Costo total", width: 130, readOnly: true },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [unidades, raicesFamilia, hijasPorPadreId, raizIdPorNombre],
  );

  const filas: Row[] = useMemo(
    () =>
      cuadrillas.map((c) => ({
        _id: c.id,
        clave: c.clave,
        descripcion: c.descripcion,
        unidad: simboloPorUnidadId[c.unidad_id] ?? c.unidad_id,
        familia: (c.familia_id && nombrePorFamiliaId[c.familia_id]) || SIN_FAMILIA,
        subfamilia: (c.sub_familia_id && nombrePorFamiliaId[c.sub_familia_id]) || SIN_SUBFAMILIA,
        sub_total_mano_obra: `$${c.sub_total_mano_obra}`,
        sub_total_herramienta: `$${c.sub_total_herramienta}`,
        costo_total: `$${c.costo_total}`,
        created_at: c.created_at,
        created_by: nombresPorUsuarioId[c.created_by] ?? c.created_by,
        updated_at: c.updated_at ?? "",
        updated_by: (c.updated_by && nombresPorUsuarioId[c.updated_by]) ?? c.updated_by ?? "",
      })),
    [cuadrillas, simboloPorUnidadId, nombrePorFamiliaId, nombresPorUsuarioId],
  );

  const filaACuadrillaData = (fila: Row): CuadrillaData => {
    const familiaId = fila.familia === SIN_FAMILIA ? null : raizIdPorNombre[String(fila.familia)] ?? null;
    const subFamiliaId =
      familiaId && fila.subfamilia !== SIN_SUBFAMILIA
        ? (hijasPorPadreId[familiaId] ?? []).find((h) => h.nombre === fila.subfamilia)?.id ?? null
        : null;
    return {
      clave: String(fila.clave),
      descripcion: String(fila.descripcion),
      unidad_id: unidadIdPorSimbolo[String(fila.unidad)] ?? String(fila.unidad),
      familia_id: familiaId,
      sub_familia_id: subFamiliaId,
    };
  };

  const cuadrillaSeleccionada = cuadrillas.find((c) => c.id === cuadrillaSeleccionadaId) ?? null;

  const grid = (
    <DataGrid
      ref={gridRef}
      config={config}
      initialRows={filas}
      loading={cargando}
      selectionMode="single"
      highlightSelection={panelComposicionAbierto}
      initialSelectedId={cuadrillaSeleccionadaId}
      search={busqueda}
      onSearchChange={setBusqueda}
      onSelectionChange={setPuedeEliminar}
      onRowSelected={(fila) => setCuadrillaSeleccionadaId(fila?._id ?? null)}
      onAddRow={(fila) => createCuadrilla(filaACuadrillaData(fila)).then(recargarCuadrillas)}
      onEditRow={(fila) => updateCuadrilla(fila._id, filaACuadrillaData(fila)).then(recargarCuadrillas)}
      onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteCuadrilla(id))).then(recargarCuadrillas)}
      onSaveError={(mensaje) => setError(mensaje)}
      onSaveSuccess={() => setGuardadoExitoso(true)}
      onCancelEdit={() => {
        setError(null);
        setGuardadoExitoso(false);
      }}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <p
            className={cn(
              "text-xs font-medium",
              error ? "text-destructive" : guardadoExitoso ? "text-emerald-600" : "invisible",
            )}
          >
            {error ?? (guardadoExitoso ? "Guardado exitosamente" : "—")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Buscador value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargarTodo },
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icono: Trash2,
                titulo: "Eliminar seleccionado",
                onClick: () => gridRef.current?.deleteSelectedRows(),
                disabled: !puedeEliminar,
              },
              {
                icono: Users,
                titulo: panelComposicionAbierto ? "Ocultar composición" : "Ver composición",
                onClick: () => setPanelComposicionAbierto((v) => !v),
                disabled: !panelComposicionAbierto && cuadrillas.length === 0,
              },
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {/* El grupo vive siempre: si el grid pasa de hijo directo a panel (o
            al revés) React lo desmonta, el virtualizador vuelve a scroll 0 y
            el renglón seleccionado deja de verse. */}
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel
            id="cuadrillas-grid"
            defaultSize="60"
            minSize="35"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            {grid}
          </ResizablePanel>
          {panelComposicionAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="cuadrillas-composicion"
                defaultSize="40"
                minSize="28"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <CuadrillaDetallePanel
                  cuadrilla={cuadrillaSeleccionada}
                  onCerrar={() => setPanelComposicionAbierto(false)}
                  onComposicionCambiada={recargarCuadrillas}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
