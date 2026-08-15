import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VerticalGrid, type DataGridColumn, type Row, type VerticalGridGroup } from "@/components/grid/VerticalGrid";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createPerfilInactividadEquipoColumna,
  deletePerfilInactividadEquipoColumna,
  listPerfilesInactividadEquipo,
  updatePerfilInactividadEquipo,
} from "@/lib/tauri";
import type { PerfilInactividadEquipo } from "@/lib/types";

const TIPOS: { id: string; titulo: string }[] = [
  { id: "espera", titulo: "Maquinaria y equipo en espera" },
  { id: "reserva", titulo: "Maquinaria y equipo en reserva" },
];

const SECCIONES: { seccion: string; rubros: { id: string; label: string }[] }[] = [
  {
    seccion: "Costos fijos",
    rubros: [
      { id: "depreciacion", label: "Depreciación" },
      { id: "inversion", label: "Inversión" },
      { id: "seguros", label: "Seguros" },
      { id: "mantenimiento", label: "Mantenimiento" },
    ],
  },
  {
    seccion: "Costos por consumo",
    rubros: [
      { id: "combustibles", label: "Combustibles" },
      { id: "lubricantes", label: "Lubricantes" },
      { id: "llantas", label: "Llantas" },
    ],
  },
  {
    seccion: "Costos por operación",
    rubros: [{ id: "operacion", label: "Operación" }],
  },
];

/** Los 3 perfiles de fábrica van siempre primero, en este orden; el resto (agregados por el usuario) después. */
const PERFIL_BASE_ORDEN = ["cfe", "gcdmx", "cmic"];
const PERFIL_BASE_LABELS: Record<string, string> = { cfe: "CFE", gcdmx: "GCDMX", cmic: "CMIC" };

function labelPerfil(id: string): string {
  return PERFIL_BASE_LABELS[id] ?? id;
}

function llave(tipo: string, rubro: string, perfil: string): string {
  return `${tipo}|${rubro}|${perfil}`;
}

/** Nombre del campo del `Row` transpuesto — un renglón del grid por cada combinación tipo/rubro. */
function campoId(tipo: string, rubro: string): string {
  return `${tipo}_${rubro}`;
}

/**
 * Tabla de referencia: 2 tipos × 8 rubros × N perfiles (3 de fábrica, más
 * los que el usuario agregue). Agregar/quitar un perfil es agregar/quitar
 * una columna completa de la matriz. Fuente de verdad del sembrado inicial
 * en `data/initial/perfil_inactividad_equipo.csv`.
 */
export function PerfilInactividadEquipoSeccion() {
  const [renglones, setRenglones] = useState<PerfilInactividadEquipo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialogoAgregarAbierto, setDialogoAgregarAbierto] = useState(false);
  const [nombreNuevaColumna, setNombreNuevaColumna] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [errorAgregar, setErrorAgregar] = useState<string | null>(null);
  const [perfilAEliminar, setPerfilAEliminar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const recargar = () => {
    setError(null);
    listPerfilesInactividadEquipo()
      .then(setRenglones)
      .catch((e) => setError(String(e)));
  };

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const perfiles = useMemo(() => {
    const ids = Array.from(new Set(renglones.map((r) => r.perfil)));
    ids.sort((a, b) => {
      const ia = PERFIL_BASE_ORDEN.indexOf(a);
      const ib = PERFIL_BASE_ORDEN.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return labelPerfil(a).localeCompare(labelPerfil(b), "es");
    });
    return ids;
  }, [renglones]);

  const porLlave = useMemo(() => {
    const mapa: Record<string, PerfilInactividadEquipo> = {};
    for (const r of renglones) mapa[llave(r.tipo, r.rubro, r.perfil)] = r;
    return mapa;
  }, [renglones]);

  // Cada combinación tipo×rubro es un campo capturable — un renglón del grid
  // transpuesto. Fijos: no dependen de los perfiles ni de sus valores.
  const columnasGrid: DataGridColumn[] = useMemo(
    () =>
      TIPOS.flatMap((tipo) =>
        SECCIONES.flatMap((seccion) =>
          seccion.rubros.map((rubro) => ({
            field: campoId(tipo.id, rubro.id),
            header: rubro.label,
            width: 100,
            numeric: true,
            suffix: "%",
          })),
        ),
      ),
    [],
  );

  const gruposGrid: VerticalGridGroup[] = useMemo(
    () =>
      TIPOS.map((tipo) => ({
        id: tipo.id,
        title: tipo.titulo,
        titleClassName: "text-sm font-semibold",
        groups: SECCIONES.map((seccion) => ({
          id: `${tipo.id}-${seccion.seccion}`,
          title: seccion.seccion,
          titleClassName: "text-xs font-semibold",
          fields: seccion.rubros.map((rubro) => campoId(tipo.id, rubro.id)),
        })),
      })),
    [],
  );

  // Cada perfil es un registro del grid transpuesto (una columna en pantalla).
  // Sus 16 campos se arman a partir de las entidades individuales que guarda
  // el backend, una por tipo/rubro/perfil (ver `porLlave`).
  const filasGrid: Row[] = useMemo(
    () =>
      perfiles.map((perfil) => {
        const fila: Row = { _id: perfil };
        for (const tipo of TIPOS) {
          for (const seccion of SECCIONES) {
            for (const rubro of seccion.rubros) {
              fila[campoId(tipo.id, rubro.id)] = Number(porLlave[llave(tipo.id, rubro.id, perfil)]?.valor ?? "0");
            }
          }
        }
        return fila;
      }),
    [perfiles, porLlave],
  );

  // Al confirmar (✓) el borrador de un perfil solo se guardan los campos que
  // cambiaron: cada uno es una entidad independiente en el backend
  // (`updatePerfilInactividadEquipo` recibe el id de esa entidad, no el del
  // perfil), así que un registro del grid puede implicar varias llamadas. Los
  // cambios que sí se guardan se aplican al estado aunque alguno falle, para
  // que un reintento no vuelva a mandar los que ya quedaron bien.
  const guardarPerfil = async (fila: Row) => {
    const perfil = fila._id;
    const pendientes: { entidad: PerfilInactividadEquipo; valor: string }[] = [];
    for (const tipo of TIPOS) {
      for (const seccion of SECCIONES) {
        for (const rubro of seccion.rubros) {
          const entidad = porLlave[llave(tipo.id, rubro.id, perfil)];
          if (!entidad) continue;
          const nuevo = String(fila[campoId(tipo.id, rubro.id)] ?? "0");
          if (nuevo !== entidad.valor) pendientes.push({ entidad, valor: nuevo });
        }
      }
    }
    if (pendientes.length === 0) return;
    const resultados = await Promise.allSettled(
      pendientes.map((p) => updatePerfilInactividadEquipo(p.entidad.id, p.valor)),
    );
    const actualizados = resultados
      .filter((r): r is PromiseFulfilledResult<PerfilInactividadEquipo> => r.status === "fulfilled")
      .map((r) => r.value);
    if (actualizados.length > 0) {
      setRenglones((prev) => {
        const porId = new Map(actualizados.map((r) => [r.id, r]));
        return prev.map((r) => porId.get(r.id) ?? r);
      });
    }
    const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (fallo) throw fallo.reason instanceof Error ? fallo.reason : new Error(String(fallo.reason));
  };

  const renderEncabezadoPerfil = (fila: Row) => {
    const perfil = fila._id;
    return (
      <span className="inline-flex items-center justify-center gap-1">
        {labelPerfil(perfil)}
        <button
          type="button"
          title={`Quitar perfil ${labelPerfil(perfil)}`}
          onClick={() => setPerfilAEliminar(perfil)}
          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X size={11} />
        </button>
      </span>
    );
  };

  const abrirDialogoAgregar = () => {
    setNombreNuevaColumna("");
    setErrorAgregar(null);
    setDialogoAgregarAbierto(true);
  };

  const agregarColumna = async () => {
    const nombre = nombreNuevaColumna.trim();
    if (!nombre) {
      setErrorAgregar("El nombre no puede estar vacío.");
      return;
    }
    if (perfiles.some((p) => labelPerfil(p).toLowerCase() === nombre.toLowerCase())) {
      setErrorAgregar(`Ya existe un perfil llamado "${nombre}".`);
      return;
    }
    setAgregando(true);
    setErrorAgregar(null);
    try {
      const nuevos = await createPerfilInactividadEquipoColumna(nombre);
      setRenglones((prev) => [...prev, ...nuevos]);
      setDialogoAgregarAbierto(false);
    } catch (e) {
      setErrorAgregar(String(e));
    } finally {
      setAgregando(false);
    }
  };

  const confirmarEliminarColumna = async () => {
    if (!perfilAEliminar) return;
    setEliminando(true);
    try {
      await deletePerfilInactividadEquipoColumna(perfilAEliminar);
      setRenglones((prev) => prev.filter((r) => r.perfil !== perfilAEliminar));
      setPerfilAEliminar(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto [scrollbar-gutter:stable]">
      <div className="p-4">
        {error && <p className="mb-3 text-xs font-medium text-destructive">{error}</p>}
        <div className="w-fit max-w-full overflow-hidden rounded-lg border-2 border-foreground/20 bg-card shadow-sm">
          <details className="border-b-2 border-foreground/20 text-xs text-muted-foreground open:bg-muted/30">
            <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-foreground">
              Artículo 210 del Reglamento de la Ley de Obras Públicas y Servicios Relacionados con las Mismas
            </summary>
            <div className="flex flex-col gap-2 px-4 pb-3">
              <p className="italic">
                "El costo horario por maquinaria o equipo de construcción en espera y en reserva es el
                correspondiente a las erogaciones derivadas de situaciones no previstas en el contrato.
              </p>
              <p>
                <span className="font-semibold text-foreground">I.</span> Maquinaria o equipo de construcción en
                espera: aquél que por condiciones no previstas en los procedimientos de construcción debe
                permanecer sin desarrollar trabajo alguno, en espera de algún acontecimiento para entrar en
                actividad, considerando al operador, y
              </p>
              <p>
                <span className="font-semibold text-foreground">II.</span> Maquinaria o equipo de construcción en
                reserva: aquél que se encuentra inactivo y que es requerido por orden expresa de la dependencia o
                entidad para enfrentar eventualidades tales como situaciones de seguridad o de posibles
                emergencias, siendo procedente cuando:
              </p>
              <p className="pl-4">
                <span className="font-semibold text-foreground">a)</span> Resulte indispensable para cubrir la
                eventualidad de que se trate debiéndose apoyar en una justificación técnica, y
              </p>
              <p className="pl-4">
                <span className="font-semibold text-foreground">b)</span> Resulten adecuados en cuanto a
                capacidad, potencia y otras características, y sean congruentes con el proceso constructivo."
              </p>
            </div>
          </details>

          <VerticalGrid
            columns={columnasGrid}
            groups={gruposGrid}
            initialRows={filasGrid}
            renderColumnHeader={renderEncabezadoPerfil}
            onEditRow={guardarPerfil}
            onSaveError={(mensaje) => setError(mensaje)}
            onAddColumn={abrirDialogoAgregar}
            addColumnTitle="Agregar perfil (columna)"
          />
        </div>
      </div>

      <Dialog
        open={dialogoAgregarAbierto}
        onOpenChange={(v) => {
          if (!v && !agregando) setDialogoAgregarAbierto(false);
        }}
      >
        <DialogContent className="max-w-sm" showCloseButton={!agregando}>
          <DialogHeader>
            <DialogTitle>Agregar perfil</DialogTitle>
          </DialogHeader>
          <Campo label="Nombre del perfil">
            <input
              autoFocus
              value={nombreNuevaColumna}
              onChange={(e) => setNombreNuevaColumna(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void agregarColumna()}
              placeholder="p. ej. Estado de México"
              className={CAMPO_INPUT_CLASE}
            />
          </Campo>
          {errorAgregar && <p className="text-xs text-destructive">{errorAgregar}</p>}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogoAgregarAbierto(false)} disabled={agregando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void agregarColumna()} disabled={agregando}>
              {agregando ? "Agregando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={perfilAEliminar !== null} onOpenChange={(open) => !open && !eliminando && setPerfilAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el perfil {perfilAEliminar ? labelPerfil(perfilAEliminar) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará esta columna completa de la matriz, en ambas tablas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando} />
            <AlertDialogAction onClick={() => void confirmarEliminarColumna()} disabled={eliminando}>
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
