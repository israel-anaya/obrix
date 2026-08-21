import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { ACTION_BAR_SEPARATOR, ActionBar, ActionBarMenu } from "@/components/ActionBar";
import { APP_ICONS } from "@/lib/appIcons";
import { CsvOperationDialog, type CsvAdapter } from "@/components/csv";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { CuadrillaDetallePanel } from "@/features/catalogos/proyecto/cuadrillas/CuadrillaDetallePanel";
import { CuadrillaFormPanel } from "@/features/catalogos/proyecto/cuadrillas/CuadrillaFormPanel";
import { adaptadorExportCuadrillas, adaptadorImportCuadrillas } from "@/features/catalogos/proyecto/cuadrillas/csv/adaptadorCuadrillas";
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
import { ordenarPor } from "@/lib/ordenar";
import { toast } from "@/hooks/use-toast";
import type { Cuadrilla, CuadrillaData, FamiliaInsumo, UnidadMedida } from "@/lib/types";

const SIN_FAMILIA = "— Sin familia —";
const SIN_SUBFAMILIA = "— Sin sub familia —";
const NOMBRE_FAMILIA_MANO_OBRA = "Mano de obra";
const SIMBOLO_UNIDAD_JORNAL = "jor";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

/**
 * Vista "Grid" de Cuadrillas de trabajo — grid de `cuadrilla` (extensión de
 * `insumo` cuando `tipo = mano_obra`, un equipo de trabajo compuesto) +
 * panel lateral con la composición (integrantes y herramienta) de la
 * cuadrilla seleccionada y ficha de identidad (`CuadrillaFormPanel`),
 * mismo patrón maestro/detalle que
 * `CategoriaFasarSeccion`/`SalarioCategoriaFasarPanel`/`CategoriaFasarFormPanel`. Los tres subtotales
 * que se ven en el grid son los de la valuación **nacional**
 * (`cuadrilla.costo_nacional`) — cache que recalcula el backend a partir de
 * la composición, no son editables aquí. El cache por región se ve en modo
 * ficha (Costo por región). Alternativa a `CuadrillasFicha`
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
  const [csvAdaptador, setCsvAdaptador] = useState<CsvAdapter | null>(null);
  const [panelComposicionAbierto, setPanelComposicionAbierto] = useState(false);
  const [panelFichaAbierto, setPanelFichaAbierto] = useState(false);
  const [cuadrillaSeleccionadaId, setCuadrillaSeleccionadaId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  /**
   * `marcarCarga` decide si el grid pinta el esqueleto mientras llega la
   * respuesta. Solo lo hacen las cargas completas —la primera vista y el botón
   * Recargar—, donde no hay nada válido en pantalla que perder. El refresco que
   * sigue a guardar o borrar trae los mismos registros que ya se están viendo:
   * marcarlo dejaría el grid en blanco y devolvería el scroll al inicio después
   * de cada ✓, y el guardado ya avisa por su cuenta.
   */
  const cargarCuadrillas = (marcarCarga: boolean) => {
    if (marcarCarga) setCargando(true);
    return listCuadrillas()
      .then(setCuadrillas)
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (marcarCarga) setCargando(false);
      });
  };

  const recargarCuadrillas = () => cargarCuadrillas(true);
  const refrescarCuadrillas = () => cargarCuadrillas(false);

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
        {
          field: "unidad",
          header: "Unidad",
          width: 100,
          options: ordenarPor(unidades, (u) => u.simbolo).map((u) => u.simbolo),
          default: unidades.some((u) => u.simbolo === SIMBOLO_UNIDAD_JORNAL) ? SIMBOLO_UNIDAD_JORNAL : "",
        },
        {
          field: "familia",
          header: "Familia",
          width: 180,
          options: [SIN_FAMILIA, ...ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => f.nombre)],
          default: raicesFamilia.some((f) => f.nombre === NOMBRE_FAMILIA_MANO_OBRA)
            ? NOMBRE_FAMILIA_MANO_OBRA
            : SIN_FAMILIA,
        },
        {
          field: "subfamilia",
          header: "Sub familia",
          width: 180,
          options: (fila) => {
            const familiaId = raizIdPorNombre[String(fila.familia)];
            const hijas = familiaId ? (hijasPorPadreId[familiaId] ?? []) : [];
            return [SIN_SUBFAMILIA, ...ordenarPor(hijas, (h) => h.nombre).map((h) => h.nombre)];
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
        sub_total_mano_obra: `$${c.costo_nacional?.sub_total_mano_obra ?? "0"}`,
        sub_total_herramienta: `$${c.costo_nacional?.sub_total_herramienta ?? "0"}`,
        costo_total: `$${c.costo_nacional?.costo_total ?? "0"}`,
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
      highlightSelection={panelComposicionAbierto || panelFichaAbierto}
      initialSelectedId={cuadrillaSeleccionadaId}
      search={busqueda}
      onSearchChange={setBusqueda}
      onSelectionChange={setPuedeEliminar}
      onRowSelected={(fila) => setCuadrillaSeleccionadaId(fila?._id ?? null)}
      onAddRow={(fila) => createCuadrilla(filaACuadrillaData(fila)).then(refrescarCuadrillas)}
      onEditRow={(fila) => updateCuadrilla(fila._id, filaACuadrillaData(fila)).then(refrescarCuadrillas)}
      onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteCuadrilla(id))).then(refrescarCuadrillas)}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-0.5">
          <ActionBar
            actions={[
              { icon: Plus, title: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icon: FileText,
                title: panelFichaAbierto ? "Ocultar ficha" : "Ver ficha",
                onClick: () => setPanelFichaAbierto((v) => !v),
              },
              ACTION_BAR_SEPARATOR,
              {
                icon: Download,
                title: "Exportar a CSV",
                onClick: () => setCsvAdaptador(adaptadorExportCuadrillas(cuadrillas, unidades, familias)),
                disabled: csvAdaptador !== null || cuadrillas.length === 0,
              },
              {
                icon: Upload,
                title: "Importar desde CSV",
                onClick: () => setCsvAdaptador(adaptadorImportCuadrillas()),
                disabled: csvAdaptador !== null,
              },
              ACTION_BAR_SEPARATOR,
              {
                icon: APP_ICONS.insumo_cuadrilla.icono,
                title: panelComposicionAbierto ? "Ocultar composición" : "Ver composición",
                onClick: () => setPanelComposicionAbierto((v) => !v),
                disabled: !panelComposicionAbierto && cuadrillas.length === 0,
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
              title: "Eliminar seleccionado",
              onClick: () => gridRef.current?.deleteSelectedRows(),
              disabled: !puedeEliminar,
              destructive: true,
            },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1">
        {/* Los grupos viven siempre: si el grid pasa de hijo directo a panel
            (o al revés) React lo desmonta y el virtualizador vuelve a scroll 0. */}
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel
            id="cuadrillas-principal"
            defaultSize="65"
            minSize="40"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <ResizablePanelGroup orientation="vertical" className="h-full">
              <ResizablePanel
                id="cuadrillas-grid"
                defaultSize="25"
                minSize="15"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                {grid}
              </ResizablePanel>
              {panelComposicionAbierto ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="cuadrillas-composicion"
                    defaultSize="75"
                    minSize="40"
                    className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                  >
                    <CuadrillaDetallePanel
                      cuadrilla={cuadrillaSeleccionada}
                      onCerrar={() => setPanelComposicionAbierto(false)}
                      onComposicionCambiada={refrescarCuadrillas}
                    />
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          </ResizablePanel>
          {panelFichaAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="cuadrillas-ficha"
                defaultSize="35"
                minSize="22"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <CuadrillaFormPanel
                  cuadrilla={cuadrillaSeleccionada}
                  unidades={unidades}
                  familias={familias}
                  nombresPorUsuarioId={nombresPorUsuarioId}
                  onCerrar={() => setPanelFichaAbierto(false)}
                  onGuardado={refrescarCuadrillas}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
      <CsvOperationDialog
        adapter={csvAdaptador}
        onClose={() => setCsvAdaptador(null)}
        onDone={() => void refrescarCuadrillas()}
      />
    </div>
  );
}
