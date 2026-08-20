import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileText, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { ActionBar, type BarAction } from "@/components/ActionBar";
import { CsvOperationDialog, type CsvAdapter } from "@/components/csv";
import { SearchInput } from "@/components/SearchInput";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { toast } from "@/hooks/use-toast";
import { adaptadorExportFamilias, adaptadorImportFamilias } from "@/features/catalogos/portafolio/familias-insumo/csv/adaptadorFamilias";
import { FamiliaInsumoFormPanel } from "@/features/catalogos/portafolio/familias-insumo/FamiliaInsumoFormPanel";
import { createFamiliaInsumo, deleteFamiliaInsumo, listFamiliasInsumo, listUsuarios, updateFamiliaInsumo } from "@/lib/tauri";
import type { FamiliaInsumo } from "@/lib/types";

/**
 * El `ResizablePanel` no siempre establece altura para `flex-1` directo: sin
 * este wrapper `h-full min-h-0` el grid se mide por el contenido, el panel lo
 * recorta y la barra de scroll queda a media tabla — tapa la primera columna
 * y solo se ve a partir de la segunda.
 */
function PanelGrid({
  titulo,
  busqueda,
  onBusquedaChange,
  onRecargar,
  onAgregar,
  onEliminar,
  puedeEliminar,
  extraAcciones,
  children,
}: {
  titulo: string;
  busqueda: string;
  onBusquedaChange: (busqueda: string) => void;
  onRecargar: () => void;
  onAgregar: () => void;
  onEliminar: () => void;
  puedeEliminar: boolean;
  extraAcciones?: BarAction[];
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={onBusquedaChange} />
          <ActionBar
            actions={[{ icon: Plus, title: "Agregar", onClick: onAgregar }, ...(extraAcciones ?? [])]}
            menu={[
              { icon: RefreshCcw, title: "Recargar", onClick: onRecargar },
              {
                icon: Trash2,
                title: "Eliminar seleccionado",
                onClick: onEliminar,
                disabled: !puedeEliminar,
                destructive: true,
              },
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

const COLUMNAS_FAMILIA = [
  { field: "nombre", header: "Nombre", width: 240 },
  { field: "icono", header: "Icono", width: 240 },
  { field: "insumos_asociados", header: "Insumos asociados", width: 320 },
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

const GRID_FAMILIA: DataGridConfig = { title: "Familias de insumo", columns: COLUMNAS_FAMILIA };
const GRID_SUBFAMILIA: DataGridConfig = { title: "Sub familias", columns: COLUMNAS_FAMILIA };

function familiaAFila(f: FamiliaInsumo, nombresPorUsuarioId: Record<string, string>): Row {
  return {
    _id: f.id,
    nombre: f.nombre,
    icono: f.icono ?? "",
    insumos_asociados: f.insumos_asociados ?? "",
    created_at: f.created_at,
    created_by: nombresPorUsuarioId[f.created_by] ?? f.created_by,
    updated_at: f.updated_at ?? "",
    updated_by: (f.updated_by && nombresPorUsuarioId[f.updated_by]) ?? f.updated_by ?? "",
  };
}

export function FamiliasInsumoSeccion() {
  const familiaGridRef = useRef<DataGridHandle>(null);
  const subfamiliaGridRef = useRef<DataGridHandle>(null);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [familiaSeleccionadaId, setFamiliaSeleccionadaId] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [panelFichaAbierto, setPanelFichaAbierto] = useState(false);
  const [puedeEliminarFamilia, setPuedeEliminarFamilia] = useState(false);
  const [puedeEliminarSubfamilia, setPuedeEliminarSubfamilia] = useState(false);
  const [busquedaFamilia, setBusquedaFamilia] = useState("");
  const [busquedaSubfamilia, setBusquedaSubfamilia] = useState("");
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [csvAdaptador, setCsvAdaptador] = useState<CsvAdapter | null>(null);

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
  const cargarFamilias = (marcarCarga: boolean) => {
    if (marcarCarga) setCargando(true);
    setError(null);
    return listFamiliasInsumo()
      .then(setFamilias)
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (marcarCarga) setCargando(false);
      });
  };

  const recargar = () => cargarFamilias(true);
  const refrescar = () => cargarFamilias(false);
  const familiaFicha = familias.find((f) => f.id === fichaId) ?? null;

  useEffect(() => {
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  }, []);

  useEffect(() => {
    recargar();
  }, []);

  const filasFamilia = useMemo(
    () => familias.filter((f) => f.parent_id === null).map((f) => familiaAFila(f, nombresPorUsuarioId)),
    [familias, nombresPorUsuarioId],
  );
  const filasSubfamilia = useMemo(
    () =>
      familiaSeleccionadaId
        ? familias.filter((f) => f.parent_id === familiaSeleccionadaId).map((f) => familiaAFila(f, nombresPorUsuarioId))
        : [],
    [familias, familiaSeleccionadaId, nombresPorUsuarioId],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel
            id="familias-grids"
            defaultSize="65"
            minSize="40"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <ResizablePanelGroup orientation="vertical" className="h-full">
              <ResizablePanel defaultSize="50" minSize="20" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <PanelGrid
              titulo="Familias de insumo"
              busqueda={busquedaFamilia}
              onBusquedaChange={setBusquedaFamilia}
              onRecargar={recargar}
              onAgregar={() => familiaGridRef.current?.addRow()}
              onEliminar={() => familiaGridRef.current?.deleteSelectedRows()}
              puedeEliminar={puedeEliminarFamilia}
              extraAcciones={[
                {
                  icon: Upload,
                  title: "Importar desde CSV",
                  onClick: () => setCsvAdaptador(adaptadorImportFamilias(familias)),
                  disabled: csvAdaptador !== null,
                },
                {
                  icon: Download,
                  title: "Exportar a CSV",
                  onClick: () => setCsvAdaptador(adaptadorExportFamilias(familias)),
                  disabled: csvAdaptador !== null || familias.length === 0,
                },
                {
                  icon: FileText,
                  title: panelFichaAbierto ? "Ocultar ficha" : "Ver ficha",
                  onClick: () => setPanelFichaAbierto((v) => !v),
                },
              ]}
            >
              <DataGrid
                ref={familiaGridRef}
                config={GRID_FAMILIA}
                initialRows={filasFamilia}
                loading={cargando}
                selectionMode="single"
                highlightSelection={panelFichaAbierto}
                search={busquedaFamilia}
                onSearchChange={setBusquedaFamilia}
                onSelectionChange={setPuedeEliminarFamilia}
                onRowSelected={(fila) => {
                  setFamiliaSeleccionadaId(fila?._id ?? null);
                  setFichaId(fila?._id ?? null);
                }}
                onAddRow={(fila) =>
                  createFamiliaInsumo({
                    nombre: String(fila.nombre),
                    icono: String(fila.icono) || null,
                    insumos_asociados: String(fila.insumos_asociados) || null,
                  }).then(refrescar)
                }
                onEditRow={(fila) =>
                  updateFamiliaInsumo(fila._id, {
                    nombre: String(fila.nombre),
                    icono: String(fila.icono) || null,
                    insumos_asociados: String(fila.insumos_asociados) || null,
                  }).then(refrescar)
                }
                onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteFamiliaInsumo(id))).then(refrescar)}
                onSaveError={(mensaje) => setError(mensaje)}
              />
            </PanelGrid>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="50" minSize="20" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            {familiaSeleccionadaId ? (
              <PanelGrid
                titulo="Sub familias"
                busqueda={busquedaSubfamilia}
                onBusquedaChange={setBusquedaSubfamilia}
                onRecargar={recargar}
                onAgregar={() => subfamiliaGridRef.current?.addRow()}
                onEliminar={() => subfamiliaGridRef.current?.deleteSelectedRows()}
                puedeEliminar={puedeEliminarSubfamilia}
              >
                <DataGrid
                  ref={subfamiliaGridRef}
                  config={GRID_SUBFAMILIA}
                  initialRows={filasSubfamilia}
                  loading={cargando}
                  selectionMode="single"
                  highlightSelection={panelFichaAbierto}
                  search={busquedaSubfamilia}
                  onSearchChange={setBusquedaSubfamilia}
                  onSelectionChange={setPuedeEliminarSubfamilia}
                  onRowSelected={(fila) => setFichaId(fila?._id ?? null)}
                  onAddRow={(fila) =>
                    createFamiliaInsumo({
                      nombre: String(fila.nombre),
                      parent_id: familiaSeleccionadaId,
                      insumos_asociados: String(fila.insumos_asociados) || null,
                      icono: String(fila.icono) || null,
                    }).then(refrescar)
                  }
                  onEditRow={(fila) =>
                    updateFamiliaInsumo(fila._id, {
                      nombre: String(fila.nombre),
                      insumos_asociados: String(fila.insumos_asociados) || null,
                      icono: String(fila.icono) || null,
                    }).then(refrescar)
                  }
                  onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteFamiliaInsumo(id))).then(refrescar)}
                  onSaveError={(mensaje) => setError(mensaje)}
                />
              </PanelGrid>
            ) : (
              <div className="flex h-full flex-col p-4">
                <h2 className="text-sm font-semibold">Sub familias</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selecciona una familia para ver sus hijos directos.
                </p>
              </div>
            )}
          </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          {panelFichaAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="familias-detalle"
                defaultSize="35"
                minSize="22"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <FamiliaInsumoFormPanel
                  familia={familiaFicha}
                  nombresPorUsuarioId={nombresPorUsuarioId}
                  onCerrar={() => setPanelFichaAbierto(false)}
                  onGuardado={() => void refrescar()}
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
