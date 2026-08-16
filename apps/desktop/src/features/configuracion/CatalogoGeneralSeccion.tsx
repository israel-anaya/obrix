import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { SearchInput } from "@/components/SearchInput";
import { DataGrid, type DataGridHandle } from "@/components/grid/DataGrid";
import { toast } from "@/hooks/use-toast";
import type { CatalogoGeneralDescriptor } from "@/features/configuracion/catalogosGenerales";
import { useCatalogoGeneral } from "@/features/configuracion/useCatalogoGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listUsuarios } from "@/lib/tauri";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CatalogoGeneralSeccion({ descriptor }: { descriptor: CatalogoGeneralDescriptor<any, any> }) {
  const gridRef = useRef<DataGridHandle>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const { items, error, cargando, crear, actualizar, eliminar, reload, limpiarError } = useCatalogoGeneral(descriptor.api);
  const [busqueda, setBusqueda] = useState("");

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[{ icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() }]}
            menu={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: () => reload() },
              {
                icono: Trash2,
                titulo: "Eliminar seleccionado",
                onClick: () => gridRef.current?.deleteSelectedRows(),
                disabled: !puedeEliminar,
                destructivo: true,
              },
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <DataGrid
          ref={gridRef}
          config={descriptor.grid}
          initialRows={filas}
          loading={cargando}
          selectionMode="single"
          search={busqueda}
          onSearchChange={setBusqueda}
          onSelectionChange={setPuedeEliminar}
          onAddRow={(fila) => crear(descriptor.filaANuevo(fila))}
          onDeleteRows={(ids) => eliminar(ids)}
          onEditRow={(fila) => actualizar(fila._id, descriptor.filaANuevo(fila))}
          onCancelEdit={limpiarError}
        />
      </div>
    </div>
  );
}
