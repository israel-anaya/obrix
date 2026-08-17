import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { DollarSign, FileSpreadsheet, FileText, Plus, RefreshCcw, Trash2, Upload, X } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import {
  ActualizarCostosMaterialesLoteDialog,
  type EstadoActualizacionLoteMateriales,
} from "@/features/catalogos/ActualizarCostosMaterialesLoteDialog";
import { MaterialFormPanel } from "@/features/catalogos/MaterialFormPanel";
import { PrecioHistorialGrid } from "@/features/catalogos/PrecioHistorialGrid";
import { PreciosMaterialPanel } from "@/features/catalogos/PreciosMaterialPanel";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { validarCsvCostoMaterial } from "@/lib/csvPrecioMaterial";
import {
  createMaterial,
  deleteMaterial,
  importarMaterialesCsv,
  leerArchivoTexto,
  listFamiliasInsumo,
  listMateriales,
  listProveedores,
  listUnidadesMedida,
  listUsuarios,
  updateMaterial,
} from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import { toast } from "@/hooks/use-toast";
import type { FamiliaInsumo, Material, MaterialData, Proveedor, ResultadoImportacion, UnidadMedida } from "@/lib/types";

const SIN_PROVEEDOR = "— Sin proveedor —";
const SIN_FAMILIA = "— Sin familia —";
const SIN_SUBFAMILIA = "— Sin sub familia —";
const FILTRO_CSV = [{ name: "CSV", extensions: ["csv"] }];

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

export function MaterialesSeccion({ onProgreso }: { onProgreso?: (mensaje: string | null) => void }) {
  const gridRef = useRef<DataGridHandle>(null);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultadoImportacion, setResultadoImportacion] = useState<ResultadoImportacion | null>(null);
  const [panelPreciosAbierto, setPanelPreciosAbierto] = useState(false);
  const [panelFichaAbierto, setPanelFichaAbierto] = useState(false);
  const [panelHistorialAbierto, setPanelHistorialAbierto] = useState(false);
  const [historialTicket, setHistorialTicket] = useState(0);
  const [historialFocoTicket, setHistorialFocoTicket] = useState(0);
  const [materialSeleccionadoId, setMaterialSeleccionadoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);
  const [estadoLote, setEstadoLote] = useState<EstadoActualizacionLoteMateriales | null>(null);
  const [importandoLote, setImportandoLote] = useState(false);
  const [noEncontradosLote, setNoEncontradosLote] = useState<string[] | null>(null);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const recargarMateriales = () => {
    setCargando(true);
    return listMateriales()
      .then(setMateriales)
      .catch((e) => setError(String(e)))
      .finally(() => {
        setCargando(false);
        setHistorialTicket((n) => n + 1);
      });
  };

  // Recarga todo lo que se muestra en esta vista — el catálogo en sí, y las
  // listas auxiliares (unidades, proveedores, familias, nombres de usuario)
  // que alimentan sus columnas.
  const recargarTodo = () => {
    void recargarMateriales();
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
    listProveedores().then(setProveedores).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  };

  const importarCsv = async () => {
    const path = await open({ filters: FILTRO_CSV, multiple: false });
    if (!path || Array.isArray(path)) return;
    setImportando(true);
    setResultadoImportacion(null);
    onProgreso?.("Importando materiales…");
    try {
      const resultado = await importarMaterialesCsv(path);
      setResultadoImportacion(resultado);
      await recargarMateriales();
    } catch (e) {
      setError(String(e));
    } finally {
      setImportando(false);
      onProgreso?.(null);
    }
  };

  const actualizarCostosLote = async () => {
    const path = await open({ filters: FILTRO_CSV, multiple: false });
    if (!path || Array.isArray(path)) return;
    setImportandoLote(true);
    setError(null);
    setNoEncontradosLote(null);
    onProgreso?.("Leyendo archivo de costos…");
    try {
      const contenido = await leerArchivoTexto(path);
      setEstadoLote(validarCsvCostoMaterial(contenido, materiales));
    } catch (e) {
      setError(String(e));
    } finally {
      setImportandoLote(false);
      onProgreso?.(null);
    }
  };

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  // Los selectores de la grid muestran texto (símbolo/razón social), no ids
  // — estos mapas convierten en ambas direcciones al leer/guardar filas.
  const simboloPorUnidadId = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    [unidades],
  );
  const unidadIdPorSimbolo = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.simbolo, u.id])),
    [unidades],
  );
  const nombrePorProveedorId = useMemo(
    () => Object.fromEntries(proveedores.map((p) => [p.id, p.razon_social])),
    [proveedores],
  );
  const proveedorIdPorNombre = useMemo(
    () => Object.fromEntries(proveedores.map((p) => [p.razon_social, p.id])),
    [proveedores],
  );

  // `familia` en la grid solo permite elegir raíces (sin `parent_id`) — sus
  // hijos son las opciones de `subfamilia`, filtradas según cuál se eligió.
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
      title: "Materiales",
      columns: [
        { field: "clave", header: "Clave", width: 110 },
        { field: "descripcion", header: "Descripción", width: 320 },
        { field: "unidad", header: "Unidad", width: 110, options: ordenarPor(unidades, (u) => u.simbolo).map((u) => u.simbolo) },
        { field: "costo_actual", header: "Costo actual", width: 130, readOnly: true, numeric: true },
        {
          field: "familia",
          header: "Familia",
          width: 200,
          options: [SIN_FAMILIA, ...ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => f.nombre)],
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
        {
          field: "proveedor",
          header: "Proveedor",
          width: 220,
          options: [SIN_PROVEEDOR, ...ordenarPor(proveedores, (p) => p.razon_social).map((p) => p.razon_social)],
        },
        { field: "marca", header: "Marca", width: 160 },
        { field: "merma_porcentaje", header: "Merma", numeric: true, suffix: "%", width: 110 },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [unidades, proveedores, raicesFamilia, hijasPorPadreId, raizIdPorNombre],
  );

  const filas: Row[] = useMemo(
    () =>
      materiales.map((m) => ({
        _id: m.id,
        clave: m.clave,
        descripcion: m.descripcion,
        unidad: simboloPorUnidadId[m.unidad_id] ?? m.unidad_id,
        familia: (m.familia_id && nombrePorFamiliaId[m.familia_id]) || SIN_FAMILIA,
        subfamilia: (m.sub_familia_id && nombrePorFamiliaId[m.sub_familia_id]) || SIN_SUBFAMILIA,
        proveedor: (m.proveedor_id && nombrePorProveedorId[m.proveedor_id]) || SIN_PROVEEDOR,
        marca: m.marca ?? "",
        costo_actual: m.precio_vigente ? `$${m.precio_vigente}` : "$0",
        merma_porcentaje: m.merma_porcentaje ?? 0,
        created_at: m.created_at,
        created_by: nombresPorUsuarioId[m.created_by] ?? m.created_by,
        updated_at: m.updated_at ?? "",
        updated_by: (m.updated_by && nombresPorUsuarioId[m.updated_by]) ?? m.updated_by ?? "",
      })),
    [materiales, simboloPorUnidadId, nombrePorFamiliaId, nombrePorProveedorId, nombresPorUsuarioId],
  );

  const filaAMaterialData = (fila: Row): MaterialData => {
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
      proveedor_id: fila.proveedor === SIN_PROVEEDOR ? null : proveedorIdPorNombre[String(fila.proveedor)] ?? null,
      // 0 a 100, redondeado — la celda es de texto libre y puede traer decimales o basura.
      merma_porcentaje: Math.min(100, Math.max(0, Math.round(Number(fila.merma_porcentaje)) || 0)),
      marca: String(fila.marca) || null,
    };
  };

  const materialSeleccionado = materiales.find((m) => m.id === materialSeleccionadoId) ?? null;

  const grid = (
    <DataGrid
      ref={gridRef}
      config={config}
      initialRows={filas}
      loading={cargando}
      selectionMode="single"
      highlightSelection={panelPreciosAbierto || panelFichaAbierto || panelHistorialAbierto}
      initialSelectedId={materialSeleccionadoId}
      search={busqueda}
      onSearchChange={setBusqueda}
      onSelectionChange={setPuedeEliminar}
      onRowSelected={(fila) => setMaterialSeleccionadoId(fila?._id ?? null)}
      onAddRow={(fila) => createMaterial(filaAMaterialData(fila)).then(recargarMateriales)}
      onEditRow={(fila) => updateMaterial(fila._id, filaAMaterialData(fila)).then(recargarMateriales)}
      onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteMaterial(id))).then(recargarMateriales)}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Materiales</h2>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() },
              {
                icono: Upload,
                titulo: importando ? "Importando…" : "Importar desde CSV",
                onClick: () => void importarCsv(),
                disabled: importando,
              },
              {
                icono: FileSpreadsheet,
                titulo: importandoLote ? "Leyendo archivo…" : "Actualizar costos en lote",
                onClick: () => void actualizarCostosLote(),
                disabled: importandoLote,
              },
              {
                icono: DollarSign,
                titulo: panelPreciosAbierto ? "Ocultar precios" : "Ver precios",
                onClick: () =>
                  setPanelPreciosAbierto((v) => {
                    if (!v) setPanelFichaAbierto(false);
                    else setPanelHistorialAbierto(false);
                    return !v;
                  }),
              },
              {
                icono: FileText,
                titulo: panelFichaAbierto ? "Ocultar ficha" : "Ver ficha",
                onClick: () =>
                  setPanelFichaAbierto((v) => {
                    if (!v) {
                      setPanelPreciosAbierto(false);
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
      {resultadoImportacion && (
        <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">
              Importación completa: {resultadoImportacion.importados} material
              {resultadoImportacion.importados === 1 ? "" : "es"} importado
              {resultadoImportacion.importados === 1 ? "" : "s"}
              {resultadoImportacion.errores.length > 0 && `, ${resultadoImportacion.errores.length} con problemas`}.
            </p>
            <button
              type="button"
              title="Cerrar"
              onClick={() => setResultadoImportacion(null)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
          {resultadoImportacion.aviso && <p className="mt-1 text-muted-foreground">{resultadoImportacion.aviso}</p>}
          {resultadoImportacion.errores.length > 0 && (
            <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-auto pl-4 text-muted-foreground">
              {resultadoImportacion.errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {noEncontradosLote && (
        <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">
              {noEncontradosLote.length} material{noEncontradosLote.length === 1 ? "" : "es"} del archivo no{" "}
              {noEncontradosLote.length === 1 ? "se encontró" : "se encontraron"} en el catálogo y no se actualizó
              {noEncontradosLote.length === 1 ? "" : "n"}:
            </p>
            <button
              type="button"
              title="Cerrar"
              onClick={() => setNoEncontradosLote(null)}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
          <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-auto pl-4 text-muted-foreground">
            {noEncontradosLote.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {/* Los grupos viven siempre para no desmontar el grid al abrir precios,
            ficha o historial (si no, el virtualizador vuelve a scroll 0). */}
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel
            id="materiales-principal"
            defaultSize="65"
            minSize="35"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel
                id="materiales-grid"
                defaultSize="65"
                minSize="40"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                {grid}
              </ResizablePanel>
              {panelPreciosAbierto || panelFichaAbierto ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="materiales-detalle"
                    defaultSize="35"
                    minSize="22"
                    className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                  >
                    {panelPreciosAbierto ? (
                      <PreciosMaterialPanel
                        materialId={materialSeleccionadoId}
                        materialClave={materialSeleccionado?.clave}
                        materialDescripcion={materialSeleccionado?.descripcion}
                        onCerrar={() => {
                          setPanelPreciosAbierto(false);
                          setPanelHistorialAbierto(false);
                        }}
                        onPrecioRegistrado={recargarMateriales}
                        onVerHistorialCompleto={() => {
                          if (!panelHistorialAbierto) setHistorialFocoTicket((n) => n + 1);
                          setPanelHistorialAbierto((v) => !v);
                        }}
                        historialAbierto={panelHistorialAbierto}
                      />
                    ) : (
                      <MaterialFormPanel
                        material={materialSeleccionado}
                        unidades={unidades}
                        proveedores={proveedores}
                        familias={familias}
                        nombresPorUsuarioId={nombresPorUsuarioId}
                        onCerrar={() => setPanelFichaAbierto(false)}
                        onGuardado={recargarMateriales}
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
                id="materiales-historial"
                defaultSize="35"
                minSize="20"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <PrecioHistorialGrid
                  materialId={materialSeleccionadoId}
                  nombresPorUsuarioId={nombresPorUsuarioId}
                  revision={historialTicket}
                  focoTicket={historialFocoTicket}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
      <ActualizarCostosMaterialesLoteDialog
        estado={estadoLote}
        onCerrar={() => setEstadoLote(null)}
        onAplicado={({ mensaje, noEncontrados }) => {
          toast({ description: mensaje, variant: "success" });
          setNoEncontradosLote(noEncontrados.length > 0 ? noEncontrados : null);
          void recargarMateriales();
        }}
        onProgreso={onProgreso}
      />
    </div>
  );
}
