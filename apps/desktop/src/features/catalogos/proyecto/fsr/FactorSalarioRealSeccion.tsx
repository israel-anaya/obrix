import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Copy, Plus, RefreshCcw, Sigma, Trash2 } from "lucide-react";
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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionBar } from "@/components/ActionBar";
import { SearchInput } from "@/components/SearchInput";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { toast } from "@/hooks/use-toast";
import { useCatalogGeneral } from "@/hooks/useCatalogGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { createFactorSalarioReal, deleteFactorSalarioReal, listFactoresSalarioReal, listRegiones, listUsuarios, updateFactorSalarioReal } from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type { FactorSalarioRealData, Region } from "@/lib/types";
import { regionesVisibles } from "@/lib/types";

const NACIONAL = "Nacional (sin región)";
/** Valor del Select para un FSR sin región — Radix no admite cadena vacía. */
const REGION_NACIONAL = "__nacional__";

const FACTOR_SALARIO_REAL_API = {
  list: listFactoresSalarioReal,
  create: createFactorSalarioReal,
  update: updateFactorSalarioReal,
  remove: deleteFactorSalarioReal,
};

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
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
  const { items, error, loading, create, update, remove, reload, clearError } = useCatalogGeneral(FACTOR_SALARIO_REAL_API);
  const [busqueda, setBusqueda] = useState("");
  const { organizacionActivaId } = useOrganizacionActiva();

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const [regiones, setRegiones] = useState<Region[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [eligiendoRegion, setEligiendoRegion] = useState(false);
  const [confirmandoDuplicar, setConfirmandoDuplicar] = useState(false);
  const [regionDestinoId, setRegionDestinoId] = useState("");
  const [duplicando, setDuplicando] = useState(false);
  const yendoAConfirmacion = useRef(false);
  const recargarRegiones = () => listRegiones().then(setRegiones).catch(() => {});
  useEffect(() => {
    void reload();
    recargarRegiones();
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  }, [organizacionActivaId, reload]);

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
          readOnlyOnEdit: true,
          options: [NACIONAL, ...ordenarPor(regionesVisibles(regiones), (r) => r.nombre).map((r) => r.nombre)],
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
        created_by: nombresPorUsuarioId[f.created_by] ?? f.created_by,
        updated_at: f.updated_at ?? "",
        updated_by: (f.updated_by && nombresPorUsuarioId[f.updated_by]) ?? f.updated_by ?? "",
      })),
    [items, nombrePorRegionId, nombresPorUsuarioId],
  );

  const filaAFactorData = (fila: Row, previo?: { modelo_calculo_json: string; parametros_json: string }): FactorSalarioRealData => ({
    nombre: String(fila.nombre),
    region_id: String(fila.region) === NACIONAL ? null : (regionIdPorNombre[String(fila.region)] ?? null),
    // Vacío: el backend siembra el modelo de cálculo estándar.
    modelo_calculo_json: previo?.modelo_calculo_json ?? "",
    parametros_json: previo?.parametros_json ?? "",
  });

  const filaSeleccionada = items.find((f) => f.id === seleccionadoId);

  const nombreRegionDestino =
    regionDestinoId === REGION_NACIONAL ? NACIONAL : (nombrePorRegionId[regionDestinoId] ?? "");

  const abrirDuplicar = () => {
    if (!filaSeleccionada) return;
    setRegionDestinoId("");
    setEligiendoRegion(true);
  };

  const pasarAConfirmacion = () => {
    if (!regionDestinoId) return;
    yendoAConfirmacion.current = true;
    setEligiendoRegion(false);
    setTimeout(() => {
      setConfirmandoDuplicar(true);
      yendoAConfirmacion.current = false;
    }, 0);
  };

  const confirmarDuplicar = async () => {
    if (!filaSeleccionada || !regionDestinoId) return;
    setDuplicando(true);
    try {
      await create({
        nombre: filaSeleccionada.nombre,
        region_id: regionDestinoId === REGION_NACIONAL ? null : regionDestinoId,
        modelo_calculo_json: filaSeleccionada.modelo_calculo_json,
        parametros_json: filaSeleccionada.parametros_json,
      });
      toast({ description: `Se duplicó «${filaSeleccionada.nombre}» en ${nombreRegionDestino}.` });
      setConfirmandoDuplicar(false);
      setRegionDestinoId("");
    } catch {
      // El error ya se muestra vía `error` de useCatalogGeneral.
    } finally {
      setDuplicando(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <ActionBar
            actions={[
              { icon: Plus, title: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icon: Copy,
                title: "Duplicar FSR",
                onClick: abrirDuplicar,
                disabled: !filaSeleccionada,
              },
              {
                icon: Calculator,
                title: "Calcular FSR",
                onClick: () => filaSeleccionada && onCalcular(filaSeleccionada.id, filaSeleccionada.nombre),
                disabled: !filaSeleccionada,
              },
              {
                icon: Sigma,
                title: "Editar modelo de cálculo",
                onClick: () => filaSeleccionada && onEditarModelo(filaSeleccionada.id, filaSeleccionada.nombre),
                disabled: !filaSeleccionada,
              },
            ]}
            menu={[
              { icon: RefreshCcw, title: "Recargar", onClick: recargarTodo },
              {
                icon: Trash2,
                title: "Eliminar seleccionado",
                onClick: () => gridRef.current?.deleteSelectedRows(),
                disabled: !filaSeleccionada,
                destructive: true,
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
          loading={loading}
          selectionMode="single"
          search={busqueda}
          onSearchChange={setBusqueda}
          onRowSelected={(fila) => setSeleccionadoId(fila?._id ?? null)}
          onAddRow={(fila) => create(filaAFactorData(fila))}
          onDeleteRows={(ids) => remove(ids)}
          onEditRow={(fila) => {
            const previo = items.find((f) => f.id === fila._id);
            update(fila._id, filaAFactorData(fila, previo));
          }}
          onCancelEdit={clearError}
        />
      </div>

      <Dialog
        open={eligiendoRegion}
        onOpenChange={(open) => {
          setEligiendoRegion(open);
          if (!open && !yendoAConfirmacion.current) setRegionDestinoId("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicar FSR</DialogTitle>
            <DialogDescription>
              Elige la región destino para duplicar «{filaSeleccionada?.nombre ?? ""}».
            </DialogDescription>
          </DialogHeader>
          <Select value={regionDestinoId || undefined} onValueChange={setRegionDestinoId}>
            <SelectTrigger autoFocus size="sm" className="w-full text-xs">
              <SelectValue placeholder="— Región —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={REGION_NACIONAL}>{NACIONAL}</SelectItem>
              {ordenarPor(regionesVisibles(regiones), (r) => r.nombre).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEligiendoRegion(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={pasarAConfirmacion} disabled={!regionDestinoId}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmandoDuplicar}
        onOpenChange={(open) => {
          if (!open && duplicando) return;
          setConfirmandoDuplicar(open);
          if (!open) setRegionDestinoId("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Duplicar este FSR?</AlertDialogTitle>
            <AlertDialogDescription>
              Se duplicará el FSR «{filaSeleccionada?.nombre ?? ""}» en la región «{nombreRegionDestino}».
              Se copiarán el modelo de cálculo y los parámetros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={duplicando} />
            <AlertDialogAction
              className={buttonVariants({ variant: "default" })}
              disabled={duplicando}
              onClick={(e) => {
                e.preventDefault();
                void confirmarDuplicar();
              }}
            >
              Duplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
