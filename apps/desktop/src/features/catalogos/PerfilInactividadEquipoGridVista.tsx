import { useEffect, useRef, useState } from "react";
import { Download, FileText, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CsvOperacionDialog, type CsvAdaptador } from "@/components/csv";
import { SearchInput } from "@/components/SearchInput";
import { DataGrid, type DataGridHandle } from "@/components/grid/DataGrid";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { PerfilInactividadEquipoFormPanel } from "@/features/catalogos/PerfilInactividadEquipoFormPanel";
import { adaptadorExportPerfiles, adaptadorImportPerfiles } from "@/features/catalogos/csv/adaptadorPerfiles";
import { CONFIG, filaADatos, perfilAFila } from "@/features/catalogos/perfilInactividadGrid";
import { toast } from "@/hooks/use-toast";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createPerfilInactividadEquipo,
  deletePerfilInactividadEquipo,
  listPerfilesInactividadEquipo,
  listUsuarios,
  updatePerfilInactividadEquipo,
} from "@/lib/tauri";
import type { PerfilInactividadEquipo } from "@/lib/types";

/**
 * Vista Clásica de `perfil_inactividad_equipo` — un renglón por perfil
 * (p. ej. "CMIC frente / patio 2026"), con sus porcentajes editables en la
 * misma fila. **Ver ficha** abre el panel a la derecha
 * (`PerfilInactividadEquipoFormPanel`) con el registro seleccionado.
 *
 * El catálogo acostado vive en `MatrizPerfilInactividadSeccion` (Modo
 * Matriz), no debajo de esta tabla.
 */
export function PerfilInactividadEquipoGridVista() {
  const gridRef = useRef<DataGridHandle>(null);
  const [perfiles, setPerfiles] = useState<PerfilInactividadEquipo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [panelFichaAbierto, setPanelFichaAbierto] = useState(false);
  const [perfilSeleccionadoId, setPerfilSeleccionadoId] = useState<string | null>(null);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [csvAdaptador, setCsvAdaptador] = useState<CsvAdaptador | null>(null);

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
  const cargarPerfiles = (marcarCarga: boolean) => {
    if (marcarCarga) setCargando(true);
    setError(null);
    return listPerfilesInactividadEquipo()
      .then(setPerfiles)
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (marcarCarga) setCargando(false);
      });
  };

  const recargar = () => cargarPerfiles(true);
  const refrescar = () => cargarPerfiles(false);

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargar();
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const filas = perfiles.map((p) => perfilAFila(p, nombresPorUsuarioId));
  const perfilSeleccionado = perfiles.find((p) => p.id === perfilSeleccionadoId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Perfiles de inactividad de equipo</h2>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icono: Upload,
                titulo: "Importar desde CSV",
                onClick: () => setCsvAdaptador(adaptadorImportPerfiles(perfiles)),
                disabled: csvAdaptador !== null,
              },
              {
                icono: Download,
                titulo: "Exportar a CSV",
                onClick: () => setCsvAdaptador(adaptadorExportPerfiles(perfiles)),
                disabled: csvAdaptador !== null || perfiles.length === 0,
              },
              {
                icono: FileText,
                titulo: panelFichaAbierto ? "Ocultar ficha" : "Ver ficha",
                onClick: () => setPanelFichaAbierto((v) => !v),
              },
            ]}
            menu={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargar },
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
      <details className="border-b border-border px-3 py-2 text-xs text-muted-foreground open:bg-muted/30">
        <summary className="cursor-pointer select-none font-semibold text-foreground">
          Artículo 210 del Reglamento de la Ley de Obras Públicas y Servicios Relacionados con las Mismas
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          <p className="italic">
            "El costo horario por maquinaria o equipo de construcción en espera y en reserva es el correspondiente a
            las erogaciones derivadas de situaciones no previstas en el contrato.
          </p>
          <p>
            <span className="font-semibold text-foreground">I.</span> Maquinaria o equipo de construcción en espera:
            aquél que por condiciones no previstas en los procedimientos de construcción debe permanecer sin
            desarrollar trabajo alguno, en espera de algún acontecimiento para entrar en actividad, considerando al
            operador, y
          </p>
          <p>
            <span className="font-semibold text-foreground">II.</span> Maquinaria o equipo de construcción en
            reserva: aquél que se encuentra inactivo y que es requerido por orden expresa de la dependencia o
            entidad para enfrentar eventualidades tales como situaciones de seguridad o de posibles emergencias,
            siendo procedente cuando:
          </p>
          <p className="pl-4">
            <span className="font-semibold text-foreground">a)</span> Resulte indispensable para cubrir la
            eventualidad de que se trate debiéndose apoyar en una justificación técnica, y
          </p>
          <p className="pl-4">
            <span className="font-semibold text-foreground">b)</span> Resulten adecuados en cuanto a capacidad,
            potencia y otras características, y sean congruentes con el proceso constructivo."
          </p>
        </div>
      </details>
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel
            id="perfiles-inactividad-grid"
            defaultSize="75"
            minSize="40"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <DataGrid
              ref={gridRef}
              config={CONFIG}
              initialRows={filas}
              loading={cargando}
              selectionMode="single"
              highlightSelection={panelFichaAbierto}
              initialSelectedId={perfilSeleccionadoId}
              search={busqueda}
              onSearchChange={setBusqueda}
              onSelectionChange={setPuedeEliminar}
              onRowSelected={(fila) => setPerfilSeleccionadoId(fila?._id ?? null)}
              onAddRow={(fila) => createPerfilInactividadEquipo(filaADatos(fila)).then(refrescar)}
              onEditRow={(fila) => updatePerfilInactividadEquipo(fila._id, filaADatos(fila)).then(refrescar)}
              onDeleteRows={(ids) => Promise.all(ids.map((id) => deletePerfilInactividadEquipo(id))).then(refrescar)}
            />
          </ResizablePanel>
          {panelFichaAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="perfiles-inactividad-ficha"
                defaultSize="25"
                minSize="18"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <PerfilInactividadEquipoFormPanel
                  perfil={perfilSeleccionado}
                  nombresPorUsuarioId={nombresPorUsuarioId}
                  onCerrar={() => setPanelFichaAbierto(false)}
                  onGuardado={refrescar}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
      <CsvOperacionDialog
        adaptador={csvAdaptador}
        onCerrar={() => setCsvAdaptador(null)}
        onTerminado={() => void refrescar()}
      />
    </div>
  );
}
