import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones, type AccionBarra } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { PlaceholderTab } from "@/components/PlaceholderTab";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  CatalogoGrid,
  type CatalogoGridConfig,
  type CatalogoGridHandle,
  type Fila,
} from "@/features/catalogos/CatalogoGrid";

export interface DetalleConfig<D> {
  grid: CatalogoGridConfig;
  /** Carga el detalle del maestro seleccionado — misma tabla (autorreferencia) u otra distinta, la vista no distingue. */
  cargar: (maestroId: string) => Promise<D[]>;
  aFila: (modelo: D) => Fila;
  /** Si se omite, el botón de agregar del panel de detalle queda deshabilitado. Recibe la fila ya editada por el usuario. */
  crear?: (maestroId: string, fila: Fila) => void | Promise<void>;
  /** Si se omite, las celdas editables del detalle no persisten (solo cambian visualmente). */
  editar?: (maestroId: string, fila: Fila) => void | Promise<void>;
  /** Si se omite, el botón de eliminar del panel de detalle queda deshabilitado. */
  eliminar?: (maestroId: string, ids: string[]) => void | Promise<void>;
}

export interface VistaMaestroDetalleProps<D> {
  maestroGrid: CatalogoGridConfig;
  maestroFilas: Fila[];
  /** Recarga `maestroFilas` desde el padre — si se omite, el botón de recargar del panel maestro queda deshabilitado. */
  onRecargarMaestro?: () => void;
  /** Si se omite, el botón de agregar del panel maestro queda deshabilitado. Recibe la fila ya editada por el usuario. */
  onAgregarMaestro?: (fila: Fila) => void | Promise<void>;
  /** Si se omite, las celdas editables del maestro no persisten (solo cambian visualmente). */
  onEditarMaestro?: (fila: Fila) => void | Promise<void>;
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
  onAgregarMaestro,
  onEditarMaestro,
  onEliminarMaestro,
  accionesExtraMaestro,
  detalle,
  accionesExtraDetalle,
  placeholderDetalle = "Selecciona una fila para ver su detalle.",
}: VistaMaestroDetalleProps<D>) {
  const maestroGridRef = useRef<CatalogoGridHandle>(null);
  const detalleGridRef = useRef<CatalogoGridHandle>(null);
  const [maestroSeleccionadoId, setMaestroSeleccionadoId] = useState<string | null>(null);
  const [maestroPuedeEliminar, setMaestroPuedeEliminar] = useState(false);
  const [busquedaMaestro, setBusquedaMaestro] = useState("");
  const [filasDetalle, setFilasDetalle] = useState<Fila[]>([]);
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
          titulo={maestroGrid.titulo}
          onRecargar={onRecargarMaestro}
          onAgregar={() => maestroGridRef.current?.agregarFila()}
          onEliminar={() => maestroGridRef.current?.eliminarFilaSeleccionada()}
          puedeAgregar={!!onAgregarMaestro}
          puedeEliminar={!!onEliminarMaestro && maestroPuedeEliminar}
          accionesExtra={accionesExtraMaestro}
          busqueda={busquedaMaestro}
          onBusquedaChange={setBusquedaMaestro}
        >
          <CatalogoGrid
            ref={maestroGridRef}
            config={maestroGrid}
            filasIniciales={maestroFilas}
            modoSeleccion="unica"
            busqueda={busquedaMaestro}
            onBusquedaChange={setBusquedaMaestro}
            onSelectionChange={setMaestroPuedeEliminar}
            onFilaSeleccionada={(fila) => setMaestroSeleccionadoId(fila?._id ?? null)}
            onAgregarFila={onAgregarMaestro}
            onCeldaEditada={onEditarMaestro}
            onEliminarFilas={onEliminarMaestro}
          />
        </PanelConAcciones>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="50" minSize="20" className="flex flex-col overflow-hidden">
        {maestroSeleccionadoId ? (
          <PanelConAcciones
            titulo={detalle.grid.titulo}
            onRecargar={recargarDetalle}
            onAgregar={() => detalleGridRef.current?.agregarFila()}
            onEliminar={() => detalleGridRef.current?.eliminarFilaSeleccionada()}
            puedeAgregar={!!detalle.crear}
            puedeEliminar={!!detalle.eliminar && detallePuedeEliminar}
            accionesExtra={accionesExtraDetalle}
            busqueda={busquedaDetalle}
            onBusquedaChange={setBusquedaDetalle}
          >
            {errorDetalle && <p className="px-3 py-1 text-xs text-destructive">{errorDetalle}</p>}
            <CatalogoGrid
              ref={detalleGridRef}
              config={detalle.grid}
              filasIniciales={cargandoDetalle ? [] : filasDetalle}
              modoSeleccion="unica"
              busqueda={busquedaDetalle}
              onBusquedaChange={setBusquedaDetalle}
              onSelectionChange={setDetallePuedeEliminar}
              onAgregarFila={
                detalle.crear
                  ? (fila) => Promise.resolve(detalle.crear!(maestroSeleccionadoId, fila)).then(recargarDetalle)
                  : undefined
              }
              onCeldaEditada={
                detalle.editar
                  ? (fila) => Promise.resolve(detalle.editar!(maestroSeleccionadoId, fila)).then(recargarDetalle)
                  : undefined
              }
              onEliminarFilas={
                detalle.eliminar
                  ? (ids) => Promise.resolve(detalle.eliminar!(maestroSeleccionadoId, ids)).then(recargarDetalle)
                  : undefined
              }
            />
          </PanelConAcciones>
        ) : (
          <PlaceholderTab title={detalle.grid.titulo} subtitle={placeholderDetalle} />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
