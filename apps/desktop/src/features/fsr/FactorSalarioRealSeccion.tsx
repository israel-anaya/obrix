import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Plus, RefreshCcw, Sigma, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { useCatalogoGeneral } from "@/features/configuracion/useCatalogoGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { createFactorSalarioReal, deleteFactorSalarioReal, listFactoresSalarioReal, listRegiones, updateFactorSalarioReal } from "@/lib/tauri";
import type { FactorSalarioRealData, Region } from "@/lib/types";
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional (sin región)";

const FACTOR_SALARIO_REAL_API = {
  list: listFactoresSalarioReal,
  crear: createFactorSalarioReal,
  actualizar: updateFactorSalarioReal,
  eliminar: deleteFactorSalarioReal,
};

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 160, readOnly: true, date: true },
  { field: "updated_at", header: "Actualizado", width: 160, readOnly: true, date: true },
];

export function FactorSalarioRealSeccion({
  onCalcular,
  onEditarModelo,
}: {
  onCalcular: (id: string, nombre: string) => void;
  onEditarModelo: (id: string, nombre: string) => void;
}) {
  const gridRef = useRef<DataGridHandle>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const { items, error, crear, actualizar, eliminar, reload, limpiarError } = useCatalogoGeneral(FACTOR_SALARIO_REAL_API);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    reload();
  }, [organizacionActivaId, reload]);

  useEffect(() => {
    if (!guardadoExitoso) return;
    const espera = setTimeout(() => setGuardadoExitoso(false), 3000);
    return () => clearTimeout(espera);
  }, [guardadoExitoso]);

  const [regiones, setRegiones] = useState<Region[]>([]);
  const recargarRegiones = () => listRegiones().then(setRegiones).catch(() => {});
  useEffect(() => {
    recargarRegiones();
  }, []);

  const recargarTodo = () => {
    void reload();
    void recargarRegiones();
  };

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);
  const regionIdPorNombre = useMemo(() => Object.fromEntries(regiones.map((r) => [r.nombre, r.id])), [regiones]);

  const config: DataGridConfig = useMemo(
    () => ({
      title: "FRS",
      columns: [
        { field: "nombre", header: "Nombre", width: 260 },
        {
          field: "region",
          header: "Región",
          width: 180,
          options: [NACIONAL, ...regiones.map((r) => r.nombre)],
        },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [regiones],
  );

  const filas: Row[] = useMemo(
    () =>
      items.map((f) => ({
        _id: f.id,
        nombre: f.nombre,
        region: f.region_id ? (nombrePorRegionId[f.region_id] ?? "") : NACIONAL,
        created_at: f.created_at,
        updated_at: f.updated_at ?? "",
      })),
    [items, nombrePorRegionId],
  );

  const filaAFactorData = (fila: Row, previo?: { modelo_calculo_json: string; parametros_json: string }): FactorSalarioRealData => ({
    nombre: String(fila.nombre),
    region_id: String(fila.region) === NACIONAL ? null : (regionIdPorNombre[String(fila.region)] ?? null),
    // Vacío: el backend siembra el modelo de cálculo estándar.
    modelo_calculo_json: previo?.modelo_calculo_json ?? "",
    parametros_json: previo?.parametros_json ?? "",
  });

  const filaSeleccionada = items.find((f) => f.id === seleccionadoId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <p
          className={cn(
            "text-xs font-medium",
            error ? "text-destructive" : guardadoExitoso ? "text-emerald-600" : "invisible",
          )}
        >
          {error ?? (guardadoExitoso ? "Guardado exitosamente" : "—")}
        </p>
        <div className="flex items-center gap-2">
          <Buscador value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargarTodo },
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icono: Calculator,
                titulo: "Calcular FSR",
                onClick: () => filaSeleccionada && onCalcular(filaSeleccionada.id, filaSeleccionada.nombre),
                disabled: !filaSeleccionada,
              },
              {
                icono: Sigma,
                titulo: "Editar modelo de cálculo",
                onClick: () => filaSeleccionada && onEditarModelo(filaSeleccionada.id, filaSeleccionada.nombre),
                disabled: !filaSeleccionada,
              },
              {
                icono: Trash2,
                titulo: "Eliminar seleccionado",
                onClick: () => gridRef.current?.deleteSelectedRows(),
                disabled: !filaSeleccionada,
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
          selectionMode="single"
          search={busqueda}
          onSearchChange={setBusqueda}
          onRowSelected={(fila) => setSeleccionadoId(fila?._id ?? null)}
          onAddRow={(fila) => crear(filaAFactorData(fila))}
          onDeleteRows={(ids) => eliminar(ids)}
          onEditRow={(fila) => {
            const previo = items.find((f) => f.id === fila._id);
            actualizar(fila._id, filaAFactorData(fila, previo));
          }}
          onSaveSuccess={() => setGuardadoExitoso(true)}
          onCancelEdit={() => {
            limpiarError();
            setGuardadoExitoso(false);
          }}
        />
      </div>
    </div>
  );
}
