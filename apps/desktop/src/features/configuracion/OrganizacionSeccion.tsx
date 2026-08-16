import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { SearchInput } from "@/components/SearchInput";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { toast } from "@/hooks/use-toast";
import { useCatalogoGeneral } from "@/features/configuracion/useCatalogoGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createOrganizacion,
  deleteOrganizacion,
  listMonedas,
  listOrganizaciones,
  listUsuarios,
  updateOrganizacion,
} from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type { Moneda } from "@/lib/types";
import { TIPOS_ORGANIZACION, type TipoOrganizacion } from "@/lib/types";

const ORGANIZACION_API = {
  list: listOrganizaciones,
  crear: createOrganizacion,
  actualizar: updateOrganizacion,
  eliminar: deleteOrganizacion,
};

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

/**
 * Bespoke, igual que `FamiliasInsumoSeccion` — el descriptor genérico de
 * `catalogosGenerales.ts` no puede resolver `moneda_default` porque sus
 * opciones dependen del catálogo `Moneda`, cargado en tiempo de ejecución.
 */
export function OrganizacionSeccion() {
  const gridRef = useRef<DataGridHandle>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const { items, error, cargando, crear, actualizar, eliminar, reload } = useCatalogoGeneral(ORGANIZACION_API);
  // `useCatalogoGeneral` solo refresca su propia lista local (`items`) — el
  // resto de la app lee organizaciones de `OrganizacionContext`, que no se
  // entera de estos cambios por su cuenta (ver `App.recargarOrganizaciones`).
  const { reload: recargarOrganizacionContext } = useOrganizacionActiva();

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const recargarMonedas = () => listMonedas().then(setMonedas).catch(() => {});
  useEffect(() => {
    recargarMonedas();
  }, []);

  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const recargarUsuarios = () =>
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  useEffect(() => {
    recargarUsuarios();
  }, []);

  // Recarga todo lo que se muestra en esta vista — el catálogo en sí, y las
  // dos listas auxiliares (monedas, nombres de usuario) que alimentan sus
  // columnas.
  const recargarTodo = () => {
    void reload();
    void recargarMonedas();
    void recargarUsuarios();
  };

  const codigoPorMonedaId = useMemo(() => Object.fromEntries(monedas.map((m) => [m.id, m.codigo])), [monedas]);
  const monedaIdPorCodigo = useMemo(() => Object.fromEntries(monedas.map((m) => [m.codigo, m.id])), [monedas]);

  const config: DataGridConfig = useMemo(
    () => ({
      title: "Organización",
      columns: [
        { field: "razon_social", header: "Razón social", width: 260 },
        { field: "rfc", header: "RFC", width: 140 },
        { field: "tipo", header: "Tipo", width: 160, options: TIPOS_ORGANIZACION },
        {
          field: "moneda_default",
          header: "Moneda default",
          width: 160,
          options: ordenarPor(monedas, (m) => m.codigo).map((m) => m.codigo),
        },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [monedas],
  );

  const filas: Row[] = useMemo(
    () =>
      items.map((o) => ({
        _id: o.id,
        razon_social: o.razon_social,
        rfc: o.rfc,
        tipo: o.tipo,
        moneda_default: codigoPorMonedaId[o.moneda_default_id] ?? "",
        created_at: o.created_at,
        created_by: nombresPorUsuarioId[o.created_by] ?? o.created_by,
        updated_at: o.updated_at ?? "",
        updated_by: (o.updated_by && nombresPorUsuarioId[o.updated_by]) ?? o.updated_by ?? "",
      })),
    [items, codigoPorMonedaId, nombresPorUsuarioId],
  );

  const filaAOrganizacionData = (fila: Row) => ({
    razon_social: String(fila.razon_social),
    rfc: String(fila.rfc),
    // La celda usa un selector (opciones: TIPOS_ORGANIZACION), así que el
    // valor siempre es uno de los válidos — el cast solo recupera el tipo literal.
    tipo: String(fila.tipo) as TipoOrganizacion,
    // La celda usa un selector (opciones: monedas.map(m => m.codigo)), así
    // que el valor siempre es un código válido salvo en una fila nueva sin
    // tocar todavía — mismo caso límite que ya existe hoy para `tipo`.
    moneda_default_id: monedaIdPorCodigo[String(fila.moneda_default)] ?? "",
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h2 className="text-sm font-semibold">Organización</h2>
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[{ icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() }]}
            menu={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargarTodo },
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
          config={config}
          initialRows={filas}
          loading={cargando}
          selectionMode="single"
          search={busqueda}
          onSearchChange={setBusqueda}
          onSelectionChange={setPuedeEliminar}
          onAddRow={(fila) => crear(filaAOrganizacionData(fila)).then(() => recargarOrganizacionContext())}
          onDeleteRows={(ids) => eliminar(ids).then(() => recargarOrganizacionContext())}
          onEditRow={(fila) =>
            actualizar(fila._id, filaAOrganizacionData(fila)).then(() => recargarOrganizacionContext())
          }
        />
      </div>
    </div>
  );
}
