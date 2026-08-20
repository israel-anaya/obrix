import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileText, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { ActionBar } from "@/components/ActionBar";
import { CsvOperationDialog, type CsvAdapter } from "@/components/csv";
import { exportCatalogAdapter, importCatalogAdapter } from "@/components/csv/catalogCsvAdapter";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DataGrid, type DataGridHandle } from "@/components/grid/DataGrid";
import { toast } from "@/hooks/use-toast";
import type { CatalogoGeneralDescriptor } from "@/features/catalogos/compartido/catalogosGenerales";
import { useCatalogGeneral } from "@/hooks/useCatalogGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listUsuarios } from "@/lib/tauri";

export type CatalogoFichaProps<T> = {
  item: T | null;
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CatalogoGeneralSeccion({
  descriptor,
  ficha,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor: CatalogoGeneralDescriptor<any, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ficha?: (props: CatalogoFichaProps<any>) => ReactNode;
}) {
  const gridRef = useRef<DataGridHandle>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const { items, error, loading, create, update, remove, reload, refresh, clearError } = useCatalogGeneral(descriptor.api);
  const [busqueda, setBusqueda] = useState("");
  const [panelFichaAbierto, setPanelFichaAbierto] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [csvAdaptador, setCsvAdaptador] = useState<CsvAdapter | null>(null);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  // La vista abierta se recarga sola cuando cambia la organización activa
  // (evento emitido por `OrganizacionContext` — ver `App.handleCambiarOrganizacion`).
  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    reload();
  }, [organizacionActivaId, reload]);

  // `created_by`/`updated_by` guardan el id del usuario — se resuelven a su
  // nombre aquí para mostrarlos, sin tocar lo que viaja del backend.
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  useEffect(() => {
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  }, []);

  const filas = useMemo(
    () =>
      (descriptor.aFilas ? descriptor.aFilas(items) : items.map(descriptor.aFila)).map((fila) => ({
        ...fila,
        ...("created_by" in fila && {
          created_by: nombresPorUsuarioId[String(fila.created_by)] ?? fila.created_by,
        }),
        ...("updated_by" in fila && {
          updated_by: nombresPorUsuarioId[String(fila.updated_by)] ?? fila.updated_by,
        }),
      })),
    [items, descriptor, nombresPorUsuarioId],
  );

  const itemSeleccionado = items.find((i) => i.id === seleccionadoId) ?? null;
  const conFicha = !!ficha;
  const csv = descriptor.csv;

  const grid = (
    <DataGrid
      ref={gridRef}
      config={descriptor.grid}
      initialRows={filas}
      loading={loading}
      selectionMode="single"
      highlightSelection={conFicha && panelFichaAbierto}
      initialSelectedId={seleccionadoId}
      search={busqueda}
      onSearchChange={setBusqueda}
      onSelectionChange={setPuedeEliminar}
      onRowSelected={conFicha ? (fila) => setSeleccionadoId(fila?._id ?? null) : undefined}
      onAddRow={(fila) => create(descriptor.filaANuevo(fila))}
      onDeleteRows={(ids) => remove(ids)}
      onEditRow={(fila) => update(fila._id, descriptor.filaANuevo(fila))}
      onCancelEdit={clearError}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <ActionBar
            actions={[
              { icon: Plus, title: "Agregar", onClick: () => gridRef.current?.addRow() },
              ...(csv
                ? [
                    {
                      icon: Upload,
                      title: "Importar desde CSV",
                      onClick: () =>
                        setCsvAdaptador(
                          importCatalogAdapter(
                            {
                              title: descriptor.titulo,
                              defaultFile: csv.archivoDefault,
                              fields: csv.campos,
                              naturalKeyFromModel: csv.claveNaturalModelo,
                              naturalKeyFromRow: csv.claveNaturalFila,
                              rowToNew: descriptor.filaANuevo,
                              toRow: descriptor.aFila,
                            },
                            items,
                            descriptor.api,
                          ),
                        ),
                      disabled: csvAdaptador !== null,
                    },
                    {
                      icon: Download,
                      title: "Exportar a CSV",
                      onClick: () =>
                        setCsvAdaptador(
                          exportCatalogAdapter(
                            {
                              title: descriptor.titulo,
                              defaultFile: csv.archivoDefault,
                              fields: csv.campos,
                              naturalKeyFromModel: csv.claveNaturalModelo,
                              naturalKeyFromRow: csv.claveNaturalFila,
                              rowToNew: descriptor.filaANuevo,
                              toRow: descriptor.aFila,
                            },
                            items,
                          ),
                        ),
                      disabled: csvAdaptador !== null || items.length === 0,
                    },
                  ]
                : []),
              ...(conFicha
                ? [
                    {
                      icon: FileText,
                      title: panelFichaAbierto ? "Ocultar ficha" : "Ver ficha",
                      onClick: () => setPanelFichaAbierto((v) => !v),
                    },
                  ]
                : []),
            ]}
            menu={[
              { icon: RefreshCcw, title: "Recargar", onClick: () => reload() },
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
      </div>
      <div className="min-h-0 flex-1">
        {conFicha ? (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel
              id={`${descriptor.id}-grid`}
              defaultSize="65"
              minSize="40"
              className="flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              {grid}
            </ResizablePanel>
            {panelFichaAbierto ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel
                  id={`${descriptor.id}-detalle`}
                  defaultSize="35"
                  minSize="22"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  {ficha({
                    item: itemSeleccionado,
                    nombresPorUsuarioId,
                    onCerrar: () => setPanelFichaAbierto(false),
                    onGuardado: () => void refresh(),
                  })}
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        ) : (
          grid
        )}
      </div>
      <CsvOperationDialog
        adapter={csvAdaptador}
        onClose={() => setCsvAdaptador(null)}
        onDone={() => void refresh()}
      />
    </div>
  );
}
