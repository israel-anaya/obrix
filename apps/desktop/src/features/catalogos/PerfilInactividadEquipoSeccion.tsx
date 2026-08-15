import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { VerticalGrid, type VerticalGridGroup } from "@/components/grid/VerticalGrid";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createPerfilInactividadEquipo,
  deletePerfilInactividadEquipo,
  listPerfilesInactividadEquipo,
  updatePerfilInactividadEquipo,
} from "@/lib/tauri";
import type { PerfilInactividadEquipo, PerfilInactividadEquipoData } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 180, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 180, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

const CONFIG: DataGridConfig = {
  title: "Perfiles de inactividad de equipo",
  columns: [
    { field: "nombre", header: "Nombre", width: 220 },
    { field: "espera_depreciacion_porcentaje", header: "Espera · Depreciación %", width: 140, numeric: true, suffix: "%" },
    { field: "espera_inversion_porcentaje", header: "Espera · Inversión %", width: 140, numeric: true, suffix: "%" },
    { field: "espera_seguro_porcentaje", header: "Espera · Seguro %", width: 130, numeric: true, suffix: "%" },
    { field: "espera_mantenimiento_porcentaje", header: "Espera · Mantenimiento %", width: 150, numeric: true, suffix: "%" },
    { field: "espera_consumo_porcentaje", header: "Espera · Consumo %", width: 140, numeric: true, suffix: "%" },
    { field: "espera_operacion_porcentaje", header: "Espera · Operación %", width: 140, numeric: true, suffix: "%" },
    { field: "reserva_depreciacion_porcentaje", header: "Reserva · Depreciación %", width: 150, numeric: true, suffix: "%" },
    { field: "reserva_inversion_porcentaje", header: "Reserva · Inversión %", width: 150, numeric: true, suffix: "%" },
    { field: "reserva_seguro_porcentaje", header: "Reserva · Seguro %", width: 140, numeric: true, suffix: "%" },
    { field: "reserva_mantenimiento_porcentaje", header: "Reserva · Mantenimiento %", width: 160, numeric: true, suffix: "%" },
    { field: "reserva_consumo_porcentaje", header: "Reserva · Consumo %", width: 150, numeric: true, suffix: "%" },
    { field: "reserva_operacion_porcentaje", header: "Reserva · Operación %", width: 150, numeric: true, suffix: "%" },
    { field: "activo", header: "Activo", width: 90, boolean: true },
    ...COLUMNAS_CONTROL,
  ],
};

/**
 * El mismo catálogo acostado: cada perfil es una columna y cada porcentaje un
 * renglón. Bajo el título de su grupo ("En espera", "En reserva") el prefijo
 * de la etiqueta sobra, así que se recorta — los campos son exactamente los
 * mismos de `CONFIG`, para que las dos rejillas nunca se separen.
 */
const CONFIG_VERTICAL: DataGridConfig = {
  title: "Perfil",
  columns: CONFIG.columns.map((c) => ({ ...c, header: c.header.replace(/^(Espera|Reserva) · /, "") })),
};

const GRUPOS_VERTICAL: VerticalGridGroup[] = [
  { id: "identificacion", title: "Identificación", fields: ["nombre", "activo"] },
  {
    id: "inactividad",
    title: "Porcentajes de inactividad",
    groups: [
      {
        id: "espera",
        title: "En espera",
        fields: [
          "espera_depreciacion_porcentaje",
          "espera_inversion_porcentaje",
          "espera_seguro_porcentaje",
          "espera_mantenimiento_porcentaje",
          "espera_consumo_porcentaje",
          "espera_operacion_porcentaje",
        ],
      },
      {
        id: "reserva",
        title: "En reserva",
        fields: [
          "reserva_depreciacion_porcentaje",
          "reserva_inversion_porcentaje",
          "reserva_seguro_porcentaje",
          "reserva_mantenimiento_porcentaje",
          "reserva_consumo_porcentaje",
          "reserva_operacion_porcentaje",
        ],
      },
    ],
  },
  { id: "control", title: "Control", fields: COLUMNAS_CONTROL.map((c) => c.field) },
];

/**
 * Grid de `perfil_inactividad_equipo` — receta reutilizable (no cuelga de
 * `insumo`, igual que `factor_salario_real`) para derivar el costo horario
 * en espera y en reserva de un `equipo_costo_horario`, ver diccionario de
 * datos. Un renglón por perfil (p. ej. "CMIC frente / patio 2026"), con sus
 * 12 porcentajes editables en la misma fila — mismo patrón maestro que
 * `HerramientaSeccion`/`EquipoCostoHorarioGridVista`.
 *
 * La vista va partida en dos sobre los mismos datos: arriba el `DataGrid` de
 * siempre (un perfil por renglón, para compararlos de un vistazo) y abajo el
 * `VerticalGrid`, que acuesta la tabla —un perfil por columna, cada porcentaje
 * un renglón agrupado por espera/reserva— porque son 12 campos y a lo ancho
 * obligan a pasearse. Las dos rejillas guardan por los mismos comandos y
 * cualquiera de las dos recarga a las dos.
 */
export function PerfilInactividadEquipoSeccion() {
  const gridRef = useRef<DataGridHandle>(null);
  const verticalRef = useRef<DataGridHandle>(null);
  const [perfiles, setPerfiles] = useState<PerfilInactividadEquipo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [puedeEliminarVertical, setPuedeEliminarVertical] = useState(false);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaVertical, setBusquedaVertical] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!guardadoExitoso) return;
    const espera = setTimeout(() => setGuardadoExitoso(false), 3000);
    return () => clearTimeout(espera);
  }, [guardadoExitoso]);

  const recargar = () => {
    setCargando(true);
    setError(null);
    return listPerfilesInactividadEquipo()
      .then(setPerfiles)
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const filas: Row[] = perfiles.map((p) => ({
    _id: p.id,
    nombre: p.nombre,
    espera_depreciacion_porcentaje: p.espera_depreciacion_porcentaje,
    espera_inversion_porcentaje: p.espera_inversion_porcentaje,
    espera_seguro_porcentaje: p.espera_seguro_porcentaje,
    espera_mantenimiento_porcentaje: p.espera_mantenimiento_porcentaje,
    espera_consumo_porcentaje: p.espera_consumo_porcentaje,
    espera_operacion_porcentaje: p.espera_operacion_porcentaje,
    reserva_depreciacion_porcentaje: p.reserva_depreciacion_porcentaje,
    reserva_inversion_porcentaje: p.reserva_inversion_porcentaje,
    reserva_seguro_porcentaje: p.reserva_seguro_porcentaje,
    reserva_mantenimiento_porcentaje: p.reserva_mantenimiento_porcentaje,
    reserva_consumo_porcentaje: p.reserva_consumo_porcentaje,
    reserva_operacion_porcentaje: p.reserva_operacion_porcentaje,
    activo: p.activo,
    created_at: p.created_at,
    created_by: p.created_by,
    updated_at: p.updated_at ?? "",
    updated_by: p.updated_by ?? "",
  }));

  const filaADatos = (fila: Row): PerfilInactividadEquipoData => ({
    nombre: String(fila.nombre),
    espera_depreciacion_porcentaje: String(fila.espera_depreciacion_porcentaje ?? "0"),
    espera_inversion_porcentaje: String(fila.espera_inversion_porcentaje ?? "0"),
    espera_seguro_porcentaje: String(fila.espera_seguro_porcentaje ?? "0"),
    espera_mantenimiento_porcentaje: String(fila.espera_mantenimiento_porcentaje ?? "0"),
    espera_consumo_porcentaje: String(fila.espera_consumo_porcentaje ?? "0"),
    espera_operacion_porcentaje: String(fila.espera_operacion_porcentaje ?? "0"),
    reserva_depreciacion_porcentaje: String(fila.reserva_depreciacion_porcentaje ?? "0"),
    reserva_inversion_porcentaje: String(fila.reserva_inversion_porcentaje ?? "0"),
    reserva_seguro_porcentaje: String(fila.reserva_seguro_porcentaje ?? "0"),
    reserva_mantenimiento_porcentaje: String(fila.reserva_mantenimiento_porcentaje ?? "0"),
    reserva_consumo_porcentaje: String(fila.reserva_consumo_porcentaje ?? "0"),
    reserva_operacion_porcentaje: String(fila.reserva_operacion_porcentaje ?? "0"),
    activo: Boolean(fila.activo),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Perfiles de inactividad de equipo</h2>
          <p
            className={cn(
              "text-xs font-medium",
              error ? "text-destructive" : guardadoExitoso ? "text-emerald-600" : "invisible",
            )}
          >
            {error ?? (guardadoExitoso ? "Guardado exitosamente" : "—")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Buscador value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargar },
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icono: Trash2,
                titulo: "Eliminar seleccionado",
                onClick: () => gridRef.current?.deleteSelectedRows(),
                disabled: !puedeEliminar,
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
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel defaultSize="55" minSize="20" className="flex flex-col overflow-hidden">
            <DataGrid
              ref={gridRef}
              config={CONFIG}
              initialRows={filas}
              loading={cargando}
              selectionMode="single"
              search={busqueda}
              onSearchChange={setBusqueda}
              onSelectionChange={setPuedeEliminar}
              onAddRow={(fila) => createPerfilInactividadEquipo(filaADatos(fila)).then(recargar)}
              onEditRow={(fila) => updatePerfilInactividadEquipo(fila._id, filaADatos(fila)).then(recargar)}
              onDeleteRows={(ids) => Promise.all(ids.map((id) => deletePerfilInactividadEquipo(id))).then(recargar)}
              onSaveError={(mensaje) => setError(mensaje)}
              onSaveSuccess={() => setGuardadoExitoso(true)}
              onCancelEdit={() => {
                setError(null);
                setGuardadoExitoso(false);
              }}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="45" minSize="20" className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <h3 className="text-sm font-semibold">Perfiles acostados</h3>
              <div className="flex items-center gap-2">
                <Buscador value={busquedaVertical} onChange={setBusquedaVertical} />
                <BarraAcciones
                  acciones={[
                    { icono: Plus, titulo: "Agregar", onClick: () => verticalRef.current?.addRow() },
                    {
                      icono: Trash2,
                      titulo: "Eliminar seleccionado",
                      onClick: () => verticalRef.current?.deleteSelectedRows(),
                      disabled: !puedeEliminarVertical,
                    },
                  ]}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <VerticalGrid
                ref={verticalRef}
                config={CONFIG_VERTICAL}
                groups={GRUPOS_VERTICAL}
                initialRows={filas}
                loading={cargando}
                selectionMode="single"
                search={busquedaVertical}
                onSearchChange={setBusquedaVertical}
                onSelectionChange={setPuedeEliminarVertical}
                onAddRow={(fila) => createPerfilInactividadEquipo(filaADatos(fila)).then(recargar)}
                onEditRow={(fila) => updatePerfilInactividadEquipo(fila._id, filaADatos(fila)).then(recargar)}
                onDeleteRows={(ids) => Promise.all(ids.map((id) => deletePerfilInactividadEquipo(id))).then(recargar)}
                onSaveError={(mensaje) => setError(mensaje)}
                onSaveSuccess={() => setGuardadoExitoso(true)}
                onCancelEdit={() => {
                  setError(null);
                  setGuardadoExitoso(false);
                }}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
