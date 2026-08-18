import { useEffect, useMemo, useRef, useState } from "react";
import { DollarSign, Download, FileSpreadsheet, FileText, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CsvOperacionDialog, type CsvAdaptador } from "@/components/csv";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { CategoriaFasarFormPanel } from "@/features/catalogos/CategoriaFasarFormPanel";
import { adaptadorExportCategoriasFasar, adaptadorImportCategoriasFasar } from "@/features/catalogos/csv/adaptadorInsumos";
import { adaptadorSalariosLote } from "@/features/catalogos/csv/adaptadorSalariosLote";
import { SalarioCategoriaFasarPanel } from "@/features/catalogos/SalarioCategoriaFasarPanel";
import { SalarioHistorialGrid } from "@/features/catalogos/SalarioHistorialGrid";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { ordenarPor } from "@/lib/ordenar";
import { toast } from "@/hooks/use-toast";
import {
  createCategoriaFasar,
  deleteCategoriaFasar,
  listCategoriasFasar,
  listFamiliasInsumo,
  listUnidadesMedida,
  listUsuarios,
  updateCategoriaFasar,
} from "@/lib/tauri";
import type { CategoriaFasar, CategoriaFasarData, FamiliaInsumo, UnidadMedida } from "@/lib/types";

const SIN_FAMILIA = "— Sin familia —";
const SIN_SUBFAMILIA = "— Sin sub familia —";
const NOMBRE_FAMILIA_MANO_OBRA = "Mano de obra";
const SIMBOLO_UNIDAD_JORNAL = "jor";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

/**
 * Vista del tabulador de salario (mano de obra atómica) — "Tabuladores de
 * Salario" en el panel izquierdo. Grid de `categoria_fasar` (extensión de
 * `insumo`) + panel lateral con las vigencias de `salario_categoria_fasar`
 * de la categoría seleccionada, mismo patrón maestro/detalle que
 * `MaterialesSeccion`/`PreciosMaterialPanel`/`MaterialFormPanel`.
 */
export function CategoriaFasarSeccion() {
  const gridRef = useRef<DataGridHandle>(null);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);

  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [panelSalarioAbierto, setPanelSalarioAbierto] = useState(false);
  const [panelFichaAbierto, setPanelFichaAbierto] = useState(false);
  const [panelHistorialAbierto, setPanelHistorialAbierto] = useState(false);
  const [historialFocoTicket, setHistorialFocoTicket] = useState(0);
  const [historialTicket, setHistorialTicket] = useState(0);
  const [categoriaSeleccionadaId, setCategoriaSeleccionadaId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
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
  const cargarCategorias = (marcarCarga: boolean) => {
    if (marcarCarga) setCargando(true);
    return listCategoriasFasar()
      .then(setCategorias)
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (marcarCarga) setCargando(false);
        setHistorialTicket((n) => n + 1);
      });
  };

  const recargarCategorias = () => cargarCategorias(true);
  const refrescarCategorias = () => cargarCategorias(false);

  const recargarTodo = () => {
    void recargarCategorias();
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    }).catch((e) => setError(String(e)));
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
      title: "Tabuladores de Salario",
      columns: [
        { field: "clave", header: "Clave", width: 110 },
        { field: "descripcion", header: "Categoría", width: 320 },
        {
          field: "unidad",
          header: "Unidad",
          width: 110,
          options: ordenarPor(unidades, (u) => u.simbolo).map((u) => u.simbolo),
          default: unidades.some((u) => u.simbolo === SIMBOLO_UNIDAD_JORNAL) ? SIMBOLO_UNIDAD_JORNAL : "",
        },
        { field: "salario_base_diario", header: "Salario base diario", width: 150, readOnly: true, numeric: true },
        { field: "factor_salario_real", header: "FSR", width: 110, readOnly: true, numeric: true },
        { field: "salario_real_diario", header: "Salario real vigente", width: 160, readOnly: true, numeric: true },
        {
          field: "familia",
          header: "Familia",
          width: 200,
          options: [SIN_FAMILIA, ...ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => f.nombre)],
          default: raicesFamilia.some((f) => f.nombre === NOMBRE_FAMILIA_MANO_OBRA)
            ? NOMBRE_FAMILIA_MANO_OBRA
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
      categorias.map((c) => ({
        _id: c.id,
        clave: c.clave,
        descripcion: c.descripcion,
        unidad: simboloPorUnidadId[c.unidad_id] ?? c.unidad_id,
        salario_base_diario: c.salario_vigente ? `$${c.salario_vigente.salario_base_diario}` : "$0",
        factor_salario_real: c.salario_vigente?.factor_salario_real ?? "0",
        salario_real_diario: c.salario_vigente ? `$${c.salario_vigente.salario_real_diario}` : "$0",
        familia: (c.familia_id && nombrePorFamiliaId[c.familia_id]) || SIN_FAMILIA,
        subfamilia: (c.sub_familia_id && nombrePorFamiliaId[c.sub_familia_id]) || SIN_SUBFAMILIA,
        created_at: c.created_at,
        created_by: nombresPorUsuarioId[c.created_by] ?? c.created_by,
        updated_at: c.updated_at ?? "",
        updated_by: (c.updated_by && nombresPorUsuarioId[c.updated_by]) ?? c.updated_by ?? "",
      })),
    [categorias, simboloPorUnidadId, nombrePorFamiliaId, nombresPorUsuarioId],
  );

  const filaACategoriaData = (fila: Row): CategoriaFasarData => {
    const familiaId = fila.familia === SIN_FAMILIA ? null : raizIdPorNombre[String(fila.familia)] ?? null;
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
    };
  };

  const categoriaSeleccionada = categorias.find((c) => c.id === categoriaSeleccionadaId) ?? null;

  const grid = (
    <DataGrid
      ref={gridRef}
      config={config}
      initialRows={filas}
      loading={cargando}
      selectionMode="single"
      highlightSelection={panelSalarioAbierto || panelFichaAbierto || panelHistorialAbierto}
      initialSelectedId={categoriaSeleccionadaId}
      search={busqueda}
      onSearchChange={setBusqueda}
      onSelectionChange={setPuedeEliminar}
      onRowSelected={(fila) => setCategoriaSeleccionadaId(fila?._id ?? null)}
      onAddRow={(fila) => createCategoriaFasar(filaACategoriaData(fila)).then(refrescarCategorias)}
      onEditRow={(fila) => updateCategoriaFasar(fila._id, filaACategoriaData(fila)).then(refrescarCategorias)}
      onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteCategoriaFasar(id))).then(refrescarCategorias)}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icono: Upload,
                titulo: "Importar desde CSV",
                onClick: () => setCsvAdaptador(adaptadorImportCategoriasFasar(categorias, unidades, familias)),
                disabled: csvAdaptador !== null,
              },
              {
                icono: Download,
                titulo: "Exportar a CSV",
                onClick: () => setCsvAdaptador(adaptadorExportCategoriasFasar(categorias, unidades, familias)),
                disabled: csvAdaptador !== null || categorias.length === 0,
              },
              {
                icono: FileSpreadsheet,
                titulo: "Actualizar salarios en lote",
                onClick: () => setCsvAdaptador(adaptadorSalariosLote(categorias)),
                disabled: csvAdaptador !== null || categorias.length === 0,
              },
              {
                icono: DollarSign,
                titulo: panelSalarioAbierto ? "Ocultar salario" : "Ver salario",
                onClick: () =>
                  setPanelSalarioAbierto((v) => {
                    if (!v) setPanelFichaAbierto(false);
                    else setPanelHistorialAbierto(false);
                    return !v;
                  }),
                disabled: !panelSalarioAbierto && categorias.length === 0,
              },
              {
                icono: FileText,
                titulo: panelFichaAbierto ? "Ocultar ficha" : "Ver ficha",
                onClick: () =>
                  setPanelFichaAbierto((v) => {
                    if (!v) {
                      setPanelSalarioAbierto(false);
                      setPanelHistorialAbierto(false);
                    }
                    return !v;
                  }),
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
        {/* Los grupos viven siempre para no desmontar el grid al abrir salario,
            ficha o historial (si no, el virtualizador vuelve a scroll 0). */}
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel
            id="fasar-principal"
            defaultSize="65"
            minSize="35"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel
                id="fasar-grid"
                defaultSize="65"
                minSize="40"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                {grid}
              </ResizablePanel>
              {panelSalarioAbierto || panelFichaAbierto ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="fasar-detalle"
                    defaultSize="35"
                    minSize="22"
                    className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                  >
                    {panelSalarioAbierto ? (
                      <SalarioCategoriaFasarPanel
                        categoriaId={categoriaSeleccionadaId}
                        categoriaClave={categoriaSeleccionada?.clave}
                        categoriaDescripcion={categoriaSeleccionada?.descripcion}
                        onCerrar={() => {
                          setPanelSalarioAbierto(false);
                          setPanelHistorialAbierto(false);
                        }}
                        onSalarioRegistrado={refrescarCategorias}
                        onVerHistorialCompleto={() => {
                          if (!panelHistorialAbierto) setHistorialFocoTicket((n) => n + 1);
                          setPanelHistorialAbierto((v) => !v);
                        }}
                        historialAbierto={panelHistorialAbierto}
                      />
                    ) : (
                      <CategoriaFasarFormPanel
                        categoria={categoriaSeleccionada}
                        unidades={unidades}
                        familias={familias}
                        nombresPorUsuarioId={nombresPorUsuarioId}
                        onCerrar={() => setPanelFichaAbierto(false)}
                        onGuardado={refrescarCategorias}
                      />
                    )}
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          </ResizablePanel>
          {panelHistorialAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="fasar-historial"
                defaultSize="35"
                minSize="20"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <SalarioHistorialGrid
                  categoriaId={categoriaSeleccionadaId}
                  nombresPorUsuarioId={nombresPorUsuarioId}
                  revision={historialTicket}
                  focoTicket={historialFocoTicket}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
      <CsvOperacionDialog
        adaptador={csvAdaptador}
        onCerrar={() => setCsvAdaptador(null)}
        onTerminado={() => void refrescarCategorias()}
      />
    </div>
  );
}
