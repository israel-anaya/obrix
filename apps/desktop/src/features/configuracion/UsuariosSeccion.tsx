import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { SearchInput } from "@/components/SearchInput";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { toast } from "@/hooks/use-toast";
import { useCatalogoGeneral } from "@/features/configuracion/useCatalogoGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createOrganizacionUsuario,
  createUsuario,
  deleteOrganizacionUsuario,
  deleteUsuario,
  listOrganizaciones,
  listOrganizacionesDeUsuario,
  listUsuarios,
  updateOrganizacionUsuario,
  updateUsuario,
} from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import { ROLES_USUARIO, type Organizacion, type OrganizacionMembresia, type RolUsuario } from "@/lib/types";

const USUARIO_API = {
  list: listUsuarios,
  crear: createUsuario,
  actualizar: updateUsuario,
  eliminar: deleteUsuario,
};

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

const MAESTRO_GRID: DataGridConfig = {
  title: "Usuarios",
  columns: [
    { field: "nombre", header: "Nombre", width: 240 },
    { field: "correo", header: "Correo", width: 200 },
    { field: "rol", header: "Rol", width: 130, options: ROLES_USUARIO },
    { field: "activo", header: "Activo", width: 90, boolean: true },
    ...COLUMNAS_CONTROL,
  ],
};

/**
 * Usuarios en Ajustes: arriba el catálogo, abajo las membresías
 * (`organizacion_usuario`) del usuario seleccionado — alta, baja y
 * activo/inactivo de sus organizaciones.
 */
export function UsuariosSeccion() {
  const usuarioGridRef = useRef<DataGridHandle>(null);
  const membresiaGridRef = useRef<DataGridHandle>(null);
  const { items, error, cargando, crear, actualizar, eliminar, reload } = useCatalogoGeneral(USUARIO_API);
  // Igual que en `OrganizacionSeccion` — el sidebar (switcher, default de
  // moneda, etc.) lee la lista de organizaciones de `OrganizacionContext`,
  // que no se entera por su cuenta cuando cambia una membresía desde acá.
  const { reload: recargarOrganizacionContext } = useOrganizacionActiva();

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [usuarioSeleccionadoId, setUsuarioSeleccionadoId] = useState<string | null>(null);
  const [membresias, setMembresias] = useState<OrganizacionMembresia[]>([]);
  const [cargandoMembresias, setCargandoMembresias] = useState(false);
  const [errorMembresias, setErrorMembresias] = useState<string | null>(null);
  const [puedeEliminarUsuario, setPuedeEliminarUsuario] = useState(false);
  const [puedeEliminarMembresia, setPuedeEliminarMembresia] = useState(false);
  const [busquedaUsuario, setBusquedaUsuario] = useState("");
  const [busquedaMembresia, setBusquedaMembresia] = useState("");

  useEffect(() => {
    listOrganizaciones().then(setOrganizaciones).catch(() => {});
  }, []);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  useEffect(() => {
    if (errorMembresias) toast({ description: errorMembresias, variant: "destructive" });
  }, [errorMembresias]);

  const recargarMembresias = () => {
    if (!usuarioSeleccionadoId) {
      setMembresias([]);
      setErrorMembresias(null);
      return Promise.resolve();
    }
    setCargandoMembresias(true);
    setErrorMembresias(null);
    return listOrganizacionesDeUsuario(usuarioSeleccionadoId)
      .then(setMembresias)
      .catch((e) => setErrorMembresias(String(e)))
      .finally(() => setCargandoMembresias(false));
  };

  useEffect(() => {
    recargarMembresias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioSeleccionadoId]);

  const idPorRazonSocial = useMemo(
    () => Object.fromEntries(organizaciones.map((o) => [o.razon_social, o.id])),
    [organizaciones],
  );

  const detalleGrid: DataGridConfig = useMemo(
    () => ({
      title: "Organizaciones",
      columns: [
        {
          field: "organizacion",
          header: "Organización",
          width: 260,
          options: ordenarPor(organizaciones, (o) => o.razon_social).map((o) => o.razon_social),
        },
        { field: "activo", header: "Activo", width: 90, boolean: true },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [organizaciones],
  );

  const nombrePorUsuarioId = useMemo(() => Object.fromEntries(items.map((u) => [u.id, u.nombre])), [items]);

  const filasUsuario: Row[] = useMemo(
    () =>
      items.map((u) => ({
        _id: u.id,
        nombre: u.nombre,
        correo: u.correo,
        rol: u.rol,
        activo: u.activo,
        created_at: u.created_at,
        created_by: (u.created_by && nombrePorUsuarioId[u.created_by]) ?? u.created_by ?? "",
        updated_at: u.updated_at ?? "",
        updated_by: (u.updated_by && nombrePorUsuarioId[u.updated_by]) ?? u.updated_by ?? "",
      })),
    [items, nombrePorUsuarioId],
  );

  const filasMembresia: Row[] = useMemo(
    () =>
      membresias.map((m) => ({
        _id: m.membresia_id,
        organizacion: m.razon_social,
        activo: m.activo,
        created_at: m.created_at,
        created_by: nombrePorUsuarioId[m.created_by] ?? m.created_by,
        updated_at: m.updated_at ?? "",
        updated_by: (m.updated_by && nombrePorUsuarioId[m.updated_by]) ?? m.updated_by ?? "",
      })),
    [membresias, nombrePorUsuarioId],
  );

  const filaAUsuarioData = (fila: Row) => ({
    nombre: String(fila.nombre),
    correo: String(fila.correo),
    // La celda usa un selector (opciones: ROLES_USUARIO), así que el valor
    // siempre es uno de los válidos — el cast solo recupera el tipo literal.
    rol: String(fila.rol) as RolUsuario,
    activo: Boolean(fila.activo),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel defaultSize="50" minSize="20" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
                <h2 className="text-sm font-semibold">Usuarios</h2>
                <div className="flex items-center gap-2">
                  <SearchInput value={busquedaUsuario} onChange={setBusquedaUsuario} />
                  <BarraAcciones
                    acciones={[{ icono: Plus, titulo: "Agregar", onClick: () => usuarioGridRef.current?.addRow() }]}
                    menu={[
                      { icono: RefreshCcw, titulo: "Recargar", onClick: () => reload() },
                      {
                        icono: Trash2,
                        titulo: "Eliminar seleccionado",
                        onClick: () => usuarioGridRef.current?.deleteSelectedRows(),
                        disabled: !puedeEliminarUsuario,
                        destructivo: true,
                      },
                    ]}
                  />
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <DataGrid
                  ref={usuarioGridRef}
                  config={MAESTRO_GRID}
                  initialRows={filasUsuario}
                  loading={cargando}
                  selectionMode="single"
                  search={busquedaUsuario}
                  onSearchChange={setBusquedaUsuario}
                  onSelectionChange={setPuedeEliminarUsuario}
                  onRowSelected={(fila) => setUsuarioSeleccionadoId(fila?._id ?? null)}
                  onAddRow={(fila) => crear(filaAUsuarioData(fila))}
                  onEditRow={(fila) => actualizar(fila._id, filaAUsuarioData(fila))}
                  onDeleteRows={eliminar}
                />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="50" minSize="20" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            {usuarioSeleccionadoId ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
                  <h2 className="text-sm font-semibold">Organizaciones</h2>
                  <div className="flex items-center gap-2">
                    <SearchInput value={busquedaMembresia} onChange={setBusquedaMembresia} />
                    <BarraAcciones
                      acciones={[{ icono: Plus, titulo: "Agregar", onClick: () => membresiaGridRef.current?.addRow() }]}
                      menu={[
                        { icono: RefreshCcw, titulo: "Recargar", onClick: recargarMembresias },
                        {
                          icono: Trash2,
                          titulo: "Eliminar seleccionado",
                          onClick: () => membresiaGridRef.current?.deleteSelectedRows(),
                          disabled: !puedeEliminarMembresia,
                          destructivo: true,
                        },
                      ]}
                    />
                  </div>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  <DataGrid
                    ref={membresiaGridRef}
                    config={detalleGrid}
                    initialRows={filasMembresia}
                    loading={cargandoMembresias}
                    selectionMode="single"
                    search={busquedaMembresia}
                    onSearchChange={setBusquedaMembresia}
                    onSelectionChange={setPuedeEliminarMembresia}
                    onAddRow={(fila) =>
                      createOrganizacionUsuario(
                        usuarioSeleccionadoId,
                        idPorRazonSocial[String(fila.organizacion)] ?? "",
                      )
                        .then(() => recargarOrganizacionContext())
                        .then(recargarMembresias)
                    }
                    onEditRow={(fila) =>
                      updateOrganizacionUsuario(
                        fila._id,
                        usuarioSeleccionadoId,
                        idPorRazonSocial[String(fila.organizacion)] ?? "",
                        Boolean(fila.activo),
                      )
                        .then(() => recargarOrganizacionContext())
                        .then(recargarMembresias)
                    }
                    onDeleteRows={(ids) =>
                      Promise.all(ids.map(deleteOrganizacionUsuario))
                        .then(() => recargarOrganizacionContext())
                        .then(recargarMembresias)
                    }
                    onSaveError={(mensaje) => setErrorMembresias(mensaje)}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col p-4">
                <h2 className="text-sm font-semibold">Organizaciones</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selecciona un usuario para ver sus organizaciones.
                </p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
