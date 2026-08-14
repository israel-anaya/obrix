import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones, type AccionBarra } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { PlaceholderTab } from "@/components/PlaceholderTab";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  DataGrid,
  type DataGridConfig,
  type DataGridHandle,
  type Row,
} from "@/components/grid/DataGrid";

export interface DetalleConfig<D> {
  grid: DataGridConfig;
  /** Carga el detalle del maestro seleccionado — misma tabla (autorreferencia) u otra distinta, la vista no distingue. */
  cargar: (maestroId: string) => Promise<D[]>;
  aFila: (modelo: D) => Row;
  /** Si se omite, el botón de agregar del panel de detalle queda deshabilitado. Recibe la fila ya editada por el usuario. */
  crear?: (maestroId: string, fila: Row) => void | Promise<void>;
  /** Si se omite, las celdas editables del detalle no persisten (solo cambian visualmente). */
  editar?: (maestroId: string, fila: Row) => void | Promise<void>;
  /** Si se omite, el botón de eliminar del panel de detalle queda deshabilitado. */
  eliminar?: (maestroId: string, ids: string[]) => void | Promise<void>;
}

export interface VistaMaestroDetalleProps<D> {
  maestroGrid: DataGridConfig;
  maestroFilas: Row[];
  /** Recarga `maestroFilas` desde el padre — si se omite, el botón de recargar del panel maestro queda deshabilitado. */
  onRecargarMaestro?: () => void;
  /** `maestroFilas` viene en camino — el detalle lleva su propio estado (ver `cargandoDetalle`). */
  maestroCargando?: boolean;
  /** Si se omite, el botón de agregar del panel maestro queda deshabilitado. Recibe la fila ya editada por el usuario. */
  onAgregarMaestro?: (fila: Row) => void | Promise<void>;
  /** Si se omite, las celdas editables del maestro no persisten (solo cambian visualmente). */
  onEditarMaestro?: (fila: Row) => void | Promise<void>;
  /** Si se omite, el botón de eliminar del panel maestro queda deshabilitado. */
  onEliminarMaestro?: (ids: string[]) => void | Promise<void>;
  /** Íconos extra en la barra del panel maestro, además de agregar/eliminar — para funcionalidad propia de cada vista. */
  accionesExtraMaestro?: AccionBarra[];
  detalle: DetalleConfig<D>;
  /** Íconos extra en la barra del panel de detalle, además de agregar/eliminar. */
  accionesExtraDetalle?: AccionBarra[];
  placeholderDetalle?: string;
}

function PanelConAcciones({
  titulo,
  onRecargar,
  onAgregar,
  onEliminar,
  puedeAgregar,
  puedeEliminar,
  accionesExtra,
  busqueda,
  onBusquedaChange,
  children,
}: {
  titulo: string;
  onRecargar?: () => void;
  onAgregar?: () => void;
  onEliminar?: () => void;
  puedeAgregar: boolean;
  puedeEliminar: boolean;
  accionesExtra?: AccionBarra[];
  busqueda: string;
  onBusquedaChange: (busqueda: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <div className="flex items-center gap-2">
          <Buscador value={busqueda} onChange={onBusquedaChange} />
          <BarraAcciones
            acciones={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: () => onRecargar?.(), disabled: !onRecargar },
              { icono: Plus, titulo: "Agregar", onClick: () => onAgregar?.(), disabled: !puedeAgregar },
              { icono: Trash2, titulo: "Eliminar seleccionado", onClick: () => onEliminar?.(), disabled: !puedeEliminar },
              ...(accionesExtra ?? []),
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Vista genérica de dos grids apilados (maestro arriba, detalle abajo), cada
 * uno con selección única por click (siempre hay una fila seleccionada) y
 * navegación con flechas. El detalle se recarga solo cuando cambia el `id`
 * del maestro seleccionado — no en cada edición del maestro — y muestra un
 * placeholder mientras no hay selección, en vez de una tabla vacía ambigua.
 */
export function VistaMaestroDetalle<D>({
  maestroGrid,
  maestroFilas,
  onRecargarMaestro,
  maestroCargando = false,
  onAgregarMaestro,
  onEditarMaestro,
  onEliminarMaestro,
  accionesExtraMaestro,
  detalle,
  accionesExtraDetalle,
  placeholderDetalle = "Selecciona una fila para ver su detalle.",
}: VistaMaestroDetalleProps<D>) {
  const maestroGridRef = useRef<DataGridHandle>(null);
  const detalleGridRef = useRef<DataGridHandle>(null);
  const [maestroSeleccionadoId, setMaestroSeleccionadoId] = useState<string | null>(null);
  const [maestroPuedeEliminar, setMaestroPuedeEliminar] = useState(false);
  const [busquedaMaestro, setBusquedaMaestro] = useState("");
  const [filasDetalle, setFilasDetalle] = useState<Row[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const [detallePuedeEliminar, setDetallePuedeEliminar] = useState(false);
  const [busquedaDetalle, setBusquedaDetalle] = useState("");

  const cargarDetalle = (cancelado: () => boolean) => {
    if (!maestroSeleccionadoId) {
      setFilasDetalle([]);
      setErrorDetalle(null);
      return;
    }
    setCargandoDetalle(true);
    setErrorDetalle(null);
    detalle
      .cargar(maestroSeleccionadoId)
      .then((modelos) => {
        if (!cancelado()) setFilasDetalle(modelos.map(detalle.aFila));
      })
      .catch((e) => {
        if (!cancelado()) setErrorDetalle(String(e));
      })
      .finally(() => {
        if (!cancelado()) setCargandoDetalle(false);
      });
  };

  const recargarDetalle = () => cargarDetalle(() => false);

  // Si el usuario navega rápido entre registros (p. ej. con flechas), no
  // tiene sentido disparar una carga por cada uno que pasa de largo — se
  // espera un momento a que la selección se quede quieta antes de cargar.
  useEffect(() => {
    let cancelado = false;
    const espera = setTimeout(() => cargarDetalle(() => cancelado), 200);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maestroSeleccionadoId]);

  return (
    <ResizablePanelGroup orientation="vertical" className="h-full">
      <ResizablePanel defaultSize="50" minSize="20" className="flex flex-col overflow-hidden">
        <PanelConAcciones
          titulo={maestroGrid.title}
          onRecargar={onRecargarMaestro}
          onAgregar={() => maestroGridRef.current?.addRow()}
          onEliminar={() => maestroGridRef.current?.deleteSelectedRows()}
          puedeAgregar={!!onAgregarMaestro}
          puedeEliminar={!!onEliminarMaestro && maestroPuedeEliminar}
          accionesExtra={accionesExtraMaestro}
          busqueda={busquedaMaestro}
          onBusquedaChange={setBusquedaMaestro}
        >
          <DataGrid
            ref={maestroGridRef}
            config={maestroGrid}
            initialRows={maestroFilas}
            loading={maestroCargando}
            selectionMode="single"
            search={busquedaMaestro}
            onSearchChange={setBusquedaMaestro}
            onSelectionChange={setMaestroPuedeEliminar}
            onRowSelected={(fila) => setMaestroSeleccionadoId(fila?._id ?? null)}
            onAddRow={onAgregarMaestro}
            onEditRow={onEditarMaestro}
            onDeleteRows={onEliminarMaestro}
          />
        </PanelConAcciones>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="50" minSize="20" className="flex flex-col overflow-hidden">
        {maestroSeleccionadoId ? (
          <PanelConAcciones
            titulo={detalle.grid.title}
            onRecargar={recargarDetalle}
            onAgregar={() => detalleGridRef.current?.addRow()}
            onEliminar={() => detalleGridRef.current?.deleteSelectedRows()}
            puedeAgregar={!!detalle.crear}
            puedeEliminar={!!detalle.eliminar && detallePuedeEliminar}
            accionesExtra={accionesExtraDetalle}
            busqueda={busquedaDetalle}
            onBusquedaChange={setBusquedaDetalle}
          >
            {errorDetalle && <p className="px-3 py-1 text-xs text-destructive">{errorDetalle}</p>}
            <DataGrid
              ref={detalleGridRef}
              config={detalle.grid}
              // Antes se vaciaba la rejilla mientras cargaba, que es justo lo
              // que hace que parezca que el maestro no tiene detalle.
              initialRows={filasDetalle}
              loading={cargandoDetalle}
              selectionMode="single"
              search={busquedaDetalle}
              onSearchChange={setBusquedaDetalle}
              onSelectionChange={setDetallePuedeEliminar}
              onAddRow={
                detalle.crear
                  ? (fila) => Promise.resolve(detalle.crear!(maestroSeleccionadoId, fila)).then(recargarDetalle)
                  : undefined
              }
              onEditRow={
                detalle.editar
                  ? (fila) => Promise.resolve(detalle.editar!(maestroSeleccionadoId, fila)).then(recargarDetalle)
                  : undefined
              }
              onDeleteRows={
                detalle.eliminar
                  ? (ids) => Promise.resolve(detalle.eliminar!(maestroSeleccionadoId, ids)).then(recargarDetalle)
                  : undefined
              }
            />
          </PanelConAcciones>
        ) : (
          <PlaceholderTab title={detalle.grid.title} subtitle={placeholderDetalle} />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
