import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { APP_ICONS } from "@/lib/appIcons";
import { ACTION_BAR_SEPARATOR, ActionBar, ActionBarMenu } from "@/components/ActionBar";
import { CsvOperationDialog, type CsvAdapter } from "@/components/csv";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { BasicoAuxiliarComposicionPanel } from "@/features/catalogos/proyecto/basicos-auxiliares/BasicoAuxiliarComposicionPanel";
import { BasicoAuxiliarFormPanel } from "@/features/catalogos/proyecto/basicos-auxiliares/BasicoAuxiliarFormPanel";
import {
  adaptadorExportBasicosAuxiliares,
  adaptadorImportBasicosAuxiliares,
} from "@/features/catalogos/proyecto/basicos-auxiliares/csv/adaptadorBasicosAuxiliares";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createBasicoAuxiliar,
  deleteBasicoAuxiliar,
  listBasicosAuxiliares,
  listFamiliasInsumo,
  listUnidadesMedida,
  listUsuarios,
  updateBasicoAuxiliar,
} from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import { toast } from "@/hooks/use-toast";
import type { BasicoAuxiliar, BasicoAuxiliarData, FamiliaInsumo, UnidadMedida } from "@/lib/types";

const SIN_FAMILIA = "— Sin familia —";
const SIN_SUBFAMILIA = "— Sin sub familia —";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

/**
 * Vista "Grid" de Básicos y Auxiliares — grid de `basico_auxiliar` (extensión
 * de `insumo`) + panel lateral opcional con la receta de primer nivel y
 * ficha de identidad (`BasicoAuxiliarFormPanel`). Los subtotales que se ven
 * en el grid son los de la valuación **nacional** (`basico_auxiliar.costo_nacional`),
 * cache que recalcula el backend a partir de la receta, no editable aquí. El
 * cache por región y el análisis completo se ven en modo análisis (Costo por
 * región). Alternativa a `BasicoAuxiliarAnalisis` (ver `BasicoAuxiliarSeccion`,
 * que alterna entre las dos).
 */
export function BasicoAuxiliarGridVista() {
  const gridRef = useRef<DataGridHandle>(null);
  const [auxiliares, setAuxiliares] = useState<BasicoAuxiliar[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [csvAdaptador, setCsvAdaptador] = useState<CsvAdapter | null>(null);
  const [panelComposicionAbierto, setPanelComposicionAbierto] = useState(false);
  const [panelFichaAbierto, setPanelFichaAbierto] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const cargar = (marcarCarga: boolean) => {
    if (marcarCarga) setCargando(true);
    return listBasicosAuxiliares()
      .then(setAuxiliares)
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (marcarCarga) setCargando(false);
      });
  };

  const recargarTodo = () => {
    void cargar(true);
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
      title: "Básicos y Auxiliares",
      columns: [
        { field: "clave", header: "Clave", width: 110 },
        { field: "descripcion", header: "Descripción", width: 320 },
        {
          field: "unidad",
          header: "Unidad",
          width: 110,
          options: ordenarPor(unidades, (u) => u.simbolo).map((u) => u.simbolo),
        },
        { field: "costo_nacional", header: "Costo nacional", numeric: true, readOnly: true, width: 140 },
        {
          field: "familia",
          header: "Familia",
          width: 200,
          options: [SIN_FAMILIA, ...ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => f.nombre)],
          default: SIN_FAMILIA,
        },
        {
          field: "subfamilia",
          header: "Sub familia",
          width: 200,
          options: (fila) => {
            const familiaId = raizIdPorNombre[String(fila.familia)];
            const hijas = familiaId ? (hijasPorPadreId[familiaId] ?? []) : [];
            return [SIN_SUBFAMILIA, ...ordenarPor(hijas, (h) => h.nombre).map((h) => h.nombre)];
          },
        },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [unidades, raicesFamilia, hijasPorPadreId, raizIdPorNombre],
  );

  const filas = useMemo(
    () =>
      auxiliares.map((a) => ({
        _id: a.id,
        clave: a.clave,
        descripcion: a.descripcion,
        unidad: simboloPorUnidadId[a.unidad_id] ?? a.unidad_id,
        costo_nacional: a.costo_nacional?.costo_total ?? "0",
        familia: a.familia_id ? (nombrePorFamiliaId[a.familia_id] ?? SIN_FAMILIA) : SIN_FAMILIA,
        subfamilia: a.sub_familia_id ? (nombrePorFamiliaId[a.sub_familia_id] ?? SIN_SUBFAMILIA) : SIN_SUBFAMILIA,
        created_at: a.created_at,
        created_by: nombresPorUsuarioId[a.created_by] ?? a.created_by,
        updated_at: a.updated_at ?? "",
        updated_by: a.updated_by ? (nombresPorUsuarioId[a.updated_by] ?? a.updated_by) : "",
      })),
    [auxiliares, simboloPorUnidadId, nombrePorFamiliaId, nombresPorUsuarioId],
  );

  const filaADatos = (fila: Row): BasicoAuxiliarData => {
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

  const seleccionado = auxiliares.find((a) => a.id === seleccionadoId) ?? null;
  const refrescar = () => cargar(false);

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
                onClick: () => setCsvAdaptador(adaptadorExportBasicosAuxiliares(auxiliares, unidades, familias)),
                disabled: csvAdaptador !== null || auxiliares.length === 0,
              },
              {
                icon: Upload,
                title: "Importar desde CSV",
                onClick: () => setCsvAdaptador(adaptadorImportBasicosAuxiliares()),
                disabled: csvAdaptador !== null,
              },
              ACTION_BAR_SEPARATOR,
              {
                icon: APP_ICONS.grupo_basico_auxiliar.icono,
                title: panelComposicionAbierto ? "Ocultar composición" : "Ver composición",
                onClick: () => setPanelComposicionAbierto((v) => !v),
                disabled: !panelComposicionAbierto && auxiliares.length === 0,
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
            id="basico-auxiliar-principal"
            defaultSize="65"
            minSize="35"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <ResizablePanelGroup orientation="vertical" className="h-full">
              <ResizablePanel
                id="basico-auxiliar-grid"
                defaultSize="10"
                minSize="8"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <DataGrid
                  ref={gridRef}
                  config={config}
                  initialRows={filas}
                  loading={cargando}
                  selectionMode="single"
                  highlightSelection={panelFichaAbierto || panelComposicionAbierto}
                  initialSelectedId={seleccionadoId}
                  search={busqueda}
                  onSearchChange={setBusqueda}
                  onSelectionChange={setPuedeEliminar}
                  onRowSelected={(fila) => setSeleccionadoId(fila?._id ?? null)}
                  onAddRow={(fila) => createBasicoAuxiliar(filaADatos(fila)).then(refrescar)}
                  onEditRow={(fila) => updateBasicoAuxiliar(fila._id, filaADatos(fila)).then(refrescar)}
                  onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteBasicoAuxiliar(id))).then(refrescar)}
                />
              </ResizablePanel>
              {panelComposicionAbierto ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="basico-auxiliar-composicion"
                    defaultSize="90"
                    minSize="40"
                    className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                  >
                    <BasicoAuxiliarComposicionPanel
                      auxiliar={seleccionado}
                      onCerrar={() => setPanelComposicionAbierto(false)}
                      onComposicionCambiada={refrescar}
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
                id="basico-auxiliar-detalle"
                defaultSize="35"
                minSize="22"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <BasicoAuxiliarFormPanel
                  auxiliar={seleccionado}
                  unidades={unidades}
                  familias={familias}
                  nombresPorUsuarioId={nombresPorUsuarioId}
                  onCerrar={() => setPanelFichaAbierto(false)}
                  onGuardado={refrescar}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
      <CsvOperationDialog
        adapter={csvAdaptador}
        onClose={() => setCsvAdaptador(null)}
        onDone={() => void refrescar()}
      />
    </div>
  );
}
