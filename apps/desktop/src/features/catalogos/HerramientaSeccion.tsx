import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CsvOperacionDialog, type CsvAdaptador } from "@/components/csv";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { HerramientaFormPanel } from "@/features/catalogos/HerramientaFormPanel";
import { adaptadorExportHerramienta, adaptadorImportHerramienta } from "@/features/catalogos/csv/adaptadorInsumos";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createHerramienta,
  deleteHerramienta,
  listFamiliasInsumo,
  listHerramientas,
  listUnidadesMedida,
  listUsuarios,
  updateHerramienta,
} from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import { toast } from "@/hooks/use-toast";
import type { FamiliaInsumo, Herramienta, HerramientaData, UnidadMedida } from "@/lib/types";

const SIN_FAMILIA = "— Sin familia —";
const SIN_SUBFAMILIA = "— Sin sub familia —";
const NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA = "Equipo y herramienta";
const SIMBOLO_UNIDAD_PORCENTAJE_MO = "%mo";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

/**
 * Vista de "Herramienta" (Maquinaria y Equipo → Herramienta) — grid de
 * `herramienta` (extensión de `insumo` cuando `tipo = equipo_herramienta`),
 * mismo patrón maestro/detalle que `MaterialesSeccion`/`MaterialFormPanel`.
 * La herramienta no tiene precio propio: solo un porcentaje por default
 * sobre el costo de mano de obra, editable en la fila o en la ficha.
 */
export function HerramientaSeccion() {
  const gridRef = useRef<DataGridHandle>(null);
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [panelFichaAbierto, setPanelFichaAbierto] = useState(false);
  const [herramientaSeleccionadaId, setHerramientaSeleccionadaId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);
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
  const cargarHerramientas = (marcarCarga: boolean) => {
    if (marcarCarga) setCargando(true);
    return listHerramientas()
      .then(setHerramientas)
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (marcarCarga) setCargando(false);
      });
  };

  const recargarHerramientas = () => cargarHerramientas(true);
  const refrescarHerramientas = () => cargarHerramientas(false);

  const recargarTodo = () => {
    void recargarHerramientas();
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  };

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const simboloPorUnidadId = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    [unidades],
  );
  const unidadIdPorSimbolo = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.simbolo, u.id])),
    [unidades],
  );

  const raicesFamilia = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);
  const nombrePorFamiliaId = useMemo(
    () => Object.fromEntries(familias.map((f) => [f.id, f.nombre])),
    [familias],
  );
  const raizIdPorNombre = useMemo(
    () => Object.fromEntries(raicesFamilia.map((f) => [f.nombre, f.id])),
    [raicesFamilia],
  );

  const config: DataGridConfig = useMemo(
    () => ({
      title: "Herramienta",
      columns: [
        { field: "clave", header: "Clave", width: 110 },
        { field: "descripcion", header: "Descripción", width: 320 },
        {
          field: "unidad",
          header: "Unidad",
          width: 110,
          options: ordenarPor(unidades, (u) => u.simbolo).map((u) => u.simbolo),
          default: unidades.some((u) => u.simbolo === SIMBOLO_UNIDAD_PORCENTAJE_MO) ? SIMBOLO_UNIDAD_PORCENTAJE_MO : "",
        },
        { field: "porcentaje_mano_obra", header: "% Mano de obra", numeric: true, suffix: "%", width: 140 },
        {
          field: "familia",
          header: "Familia",
          width: 200,
          options: [SIN_FAMILIA, ...ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => f.nombre)],
          default: raicesFamilia.some((f) => f.nombre === NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA)
            ? NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA
            : SIN_FAMILIA,
        },
        {
          field: "subfamilia",
          header: "Sub familia",
          width: 200,
          options: (fila) => {
            const familiaId = raizIdPorNombre[String(fila.familia)];
            const hijas = familiaId ? (hijasPorPadreId[familiaId] ?? []) : [];
            return [SIN_SUBFAMILIA, ...ordenarPor(hijas, (h) => h.nombre).map((h) => h.nombre)];
          },
        },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [unidades, raicesFamilia, hijasPorPadreId, raizIdPorNombre],
  );

  const filas: Row[] = useMemo(
    () =>
      herramientas.map((h) => ({
        _id: h.id,
        clave: h.clave,
        descripcion: h.descripcion,
        unidad: simboloPorUnidadId[h.unidad_id] ?? h.unidad_id,
        porcentaje_mano_obra: h.porcentaje_mano_obra ?? 0,
        familia: (h.familia_id && nombrePorFamiliaId[h.familia_id]) || SIN_FAMILIA,
        subfamilia: (h.sub_familia_id && nombrePorFamiliaId[h.sub_familia_id]) || SIN_SUBFAMILIA,
        created_at: h.created_at,
        created_by: nombresPorUsuarioId[h.created_by] ?? h.created_by,
        updated_at: h.updated_at ?? "",
        updated_by: (h.updated_by && nombresPorUsuarioId[h.updated_by]) ?? h.updated_by ?? "",
      })),
    [herramientas, simboloPorUnidadId, nombrePorFamiliaId, nombresPorUsuarioId],
  );

  const filaAHerramientaData = (fila: Row): HerramientaData => {
    const familiaId = fila.familia === SIN_FAMILIA ? null : raizIdPorNombre[String(fila.familia)] ?? null;
    // La subfamilia solo es válida si es hija de la familia elegida en esta
    // misma fila — si no calza (p. ej. se cambió la familia después), se descarta.
    const subFamiliaId =
      familiaId && fila.subfamilia !== SIN_SUBFAMILIA
        ? (hijasPorPadreId[familiaId] ?? []).find((h) => h.nombre === fila.subfamilia)?.id ?? null
        : null;
    return {
      clave: String(fila.clave),
      descripcion: String(fila.descripcion),
      unidad_id: unidadIdPorSimbolo[String(fila.unidad)] ?? String(fila.unidad),
      familia_id: familiaId,
      sub_familia_id: subFamiliaId,
      // 0 a 100, redondeado — la celda es de texto libre y puede traer decimales o basura.
      porcentaje_mano_obra: Math.min(100, Math.max(0, Math.round(Number(fila.porcentaje_mano_obra)) || 0)),
    };
  };

  const herramientaSeleccionada = herramientas.find((h) => h.id === herramientaSeleccionadaId) ?? null;

  const grid = (
    <DataGrid
      ref={gridRef}
      config={config}
      initialRows={filas}
      loading={cargando}
      selectionMode="single"
      highlightSelection={panelFichaAbierto}
      initialSelectedId={herramientaSeleccionadaId}
      search={busqueda}
      onSearchChange={setBusqueda}
      onSelectionChange={setPuedeEliminar}
      onRowSelected={(fila) => setHerramientaSeleccionadaId(fila?._id ?? null)}
      onAddRow={(fila) => createHerramienta(filaAHerramientaData(fila)).then(refrescarHerramientas)}
      onEditRow={(fila) => updateHerramienta(fila._id, filaAHerramientaData(fila)).then(refrescarHerramientas)}
      onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteHerramienta(id))).then(refrescarHerramientas)}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Herramienta</h2>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icono: Upload,
                titulo: "Importar desde CSV",
                onClick: () => setCsvAdaptador(adaptadorImportHerramienta()),
                disabled: csvAdaptador !== null,
              },
              {
                icono: Download,
                titulo: "Exportar a CSV",
                onClick: () => setCsvAdaptador(adaptadorExportHerramienta(herramientas, unidades, familias)),
                disabled: csvAdaptador !== null || herramientas.length === 0,
              },
              {
                icono: FileText,
                titulo: panelFichaAbierto ? "Ocultar ficha" : "Ver ficha",
                onClick: () => setPanelFichaAbierto((v) => !v),
              },
            ]}
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
        {/* El grupo vive siempre: si el grid pasa de hijo directo a panel (o
            al revés) React lo desmonta, el virtualizador vuelve a scroll 0 y
            el renglón seleccionado deja de verse. */}
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel
            id="herramienta-grid"
            defaultSize="65"
            minSize="40"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            {grid}
          </ResizablePanel>
          {panelFichaAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="herramienta-detalle"
                defaultSize="35"
                minSize="22"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <HerramientaFormPanel
                  herramienta={herramientaSeleccionada}
                  unidades={unidades}
                  familias={familias}
                  nombresPorUsuarioId={nombresPorUsuarioId}
                  onCerrar={() => setPanelFichaAbierto(false)}
                  onGuardado={refrescarHerramientas}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
      <CsvOperacionDialog
        adaptador={csvAdaptador}
        onCerrar={() => setCsvAdaptador(null)}
        onTerminado={() => void refrescarHerramientas()}
      />
    </div>
  );
}
