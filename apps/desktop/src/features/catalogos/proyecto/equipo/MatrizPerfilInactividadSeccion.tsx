import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { ActionBar } from "@/components/ActionBar";
import { SearchInput } from "@/components/SearchInput";
import type { DataGridHandle } from "@/components/grid/DataGrid";
import { VerticalGrid, type VerticalGridGroup } from "@/components/grid/VerticalGrid";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  CONFIG_VERTICAL,
  GRUPOS_VERTICAL,
  camposDeGrupo,
  contarCampos,
  filaADatos,
  perfilAFila,
  promedioPorcentaje,
} from "@/features/catalogos/proyecto/equipo/perfilInactividadGrid";
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
import { cn } from "@/lib/utils";

type Pasillo = "todo" | "espera" | "reserva";

const IDENTIFICACION = GRUPOS_VERTICAL.find((g) => g.id === "identificacion")!;
const GRUPO_ESPERA = GRUPOS_VERTICAL.find((g) => g.id === "equipo_espera")!;
const GRUPO_RESERVA = GRUPOS_VERTICAL.find((g) => g.id === "equipo_reserva")!;
const GRUPO_CONTROL = GRUPOS_VERTICAL.find((g) => g.id === "control")!;

/** Control (auditoría) no es un rubro: va siempre, al final, filtren o no. */
function gruposDe(pasillo: Pasillo): VerticalGridGroup[] {
  if (pasillo === "todo") return GRUPOS_VERTICAL;
  if (pasillo === "espera") return [IDENTIFICACION, GRUPO_ESPERA, GRUPO_CONTROL];
  return [IDENTIFICACION, GRUPO_RESERVA, GRUPO_CONTROL];
}

/**
 * Catálogo acostado: rubros en filas, perfiles en columnas. Cada celda es el
 * % de ese rubro en espera o reserva. Es el "Modo Matriz" de Inactividad de
 * equipo (ver `PerfilInactividadEquipoSeccion`); no sustituye al grid ni a
 * su ficha.
 */
export function MatrizPerfilInactividadSeccion() {
  const gridRef = useRef<DataGridHandle>(null);
  const [perfiles, setPerfiles] = useState<PerfilInactividadEquipo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pasillo, setPasillo] = useState<Pasillo>("todo");
  const [cargando, setCargando] = useState(true);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

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

  const camposPromedio =
    pasillo === "espera"
      ? camposDeGrupo(GRUPO_ESPERA)
      : pasillo === "reserva"
        ? camposDeGrupo(GRUPO_RESERVA)
        : [...camposDeGrupo(GRUPO_ESPERA), ...camposDeGrupo(GRUPO_RESERVA)];
  const filas = perfiles.map((p) => {
    const fila = perfilAFila(p, nombresPorUsuarioId);
    return { ...fila, promedio_porcentaje: promedioPorcentaje(fila, camposPromedio) };
  });
  const grupos = gruposDe(pasillo);
  const nEspera = contarCampos([GRUPO_ESPERA]);
  const nReserva = contarCampos([GRUPO_RESERVA]);
  const nTodo = nEspera + nReserva;
  const nRubros = pasillo === "espera" ? nEspera : pasillo === "reserva" ? nReserva : nTodo;

  const pasillos: { id: Pasillo; nombre: string; n: number }[] = [
    { id: "todo", nombre: "Todos los rubros", n: nTodo },
    { id: "espera", nombre: "En espera", n: nEspera },
    { id: "reserva", nombre: "En reserva", n: nReserva },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">Matriz perfil × rubro</h2>
          <p
            className={cn("truncate text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}
            title={error ? undefined : "Un perfil por columna; cada rubro es un renglón"}
          >
            {error ??
              `${perfiles.length} ${perfiles.length === 1 ? "perfil" : "perfiles"} · ${nRubros} ${nRubros === 1 ? "rubro" : "rubros"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <ActionBar
            actions={[{ icon: Plus, title: "Agregar", onClick: () => gridRef.current?.addRow() }]}
            menu={[
              { icon: RefreshCcw, title: "Recargar", onClick: recargar },
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
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel id="matriz-inactividad-rubros" defaultSize="23" minSize="16" className="flex min-h-0 flex-col">
            <div className="border-b border-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Rubros
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1 [scrollbar-gutter:stable]">
              {pasillos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPasillo(p.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    pasillo === p.id && "bg-muted text-foreground",
                  )}
                >
                  <span className="truncate">{p.nombre}</span>
                  <span className="num shrink-0 text-[11px]">{p.n}</span>
                </button>
              ))}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id="matriz-inactividad-tablero"
            defaultSize="77"
            minSize="32"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <VerticalGrid
              ref={gridRef}
              config={CONFIG_VERTICAL}
              groups={grupos}
              zebra
              labelWidth={150}
              recordWidth={86}
              // Encabezado en blanco: el nombre del perfil ya es el primer
              // renglón, repetirlo arriba no agrega nada. Va `""` y no `null`
              // porque el grid solo cae al valor por omisión cuando esto es
              // nulo (ver `renderRecordHeader`).
              renderRecordHeader={() => ""}
              initialRows={filas}
              loading={cargando}
              selectionMode="single"
              search={busqueda}
              onSearchChange={setBusqueda}
              onSelectionChange={setPuedeEliminar}
              onAddRow={(fila) => createPerfilInactividadEquipo(filaADatos(fila)).then(refrescar)}
              onEditRow={(fila) => updatePerfilInactividadEquipo(fila._id, filaADatos(fila)).then(refrescar)}
              onDeleteRows={(ids) => Promise.all(ids.map((id) => deletePerfilInactividadEquipo(id))).then(refrescar)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
