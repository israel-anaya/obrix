import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CatalogoGrid, type CatalogoGridHandle } from "@/features/catalogos/CatalogoGrid";
import type { CatalogoGeneralDescriptor } from "@/features/configuracion/catalogosGenerales";
import { useCatalogoGeneral } from "@/features/configuracion/useCatalogoGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listUsuarios } from "@/lib/tauri";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CatalogoGeneralSeccion({ descriptor }: { descriptor: CatalogoGeneralDescriptor<any, any> }) {
  const gridRef = useRef<CatalogoGridHandle>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const { items, error, crear, actualizar, eliminar, reload, limpiarError } = useCatalogoGeneral(descriptor.api);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);

  useEffect(() => {
    if (!guardadoExitoso) return;
    const espera = setTimeout(() => setGuardadoExitoso(false), 3000);
    return () => clearTimeout(espera);
  }, [guardadoExitoso]);

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
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{descriptor.titulo}</h2>
          <p
            className={cn(
              "text-xs font-medium",
              error ? "text-destructive" : guardadoExitoso ? "text-emerald-600" : "invisible",
            )}
          >
            {error ?? (guardadoExitoso ? "Guardado exitosamente" : "—")}
          </p>
        </div>
        <BarraAcciones
          acciones={[
            { icono: RefreshCcw, titulo: "Recargar", onClick: () => reload() },
            { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.agregarFila() },
            {
              icono: Trash2,
              titulo: "Eliminar seleccionado",
              onClick: () => gridRef.current?.eliminarFilaSeleccionada(),
              disabled: !puedeEliminar,
            },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1">
        <CatalogoGrid
          ref={gridRef}
          config={descriptor.grid}
          filasIniciales={filas}
          modoSeleccion="unica"
          onSelectionChange={setPuedeEliminar}
          onAgregarFila={(fila) => crear(descriptor.filaANuevo(fila))}
          onEliminarFilas={(ids) => eliminar(ids)}
          onCeldaEditada={(fila) => actualizar(fila._id, descriptor.filaANuevo(fila))}
          onGuardadoExitoso={() => setGuardadoExitoso(true)}
          onEdicionCancelada={() => {
            limpiarError();
            setGuardadoExitoso(false);
          }}
        />
      </div>
    </div>
  );
}
