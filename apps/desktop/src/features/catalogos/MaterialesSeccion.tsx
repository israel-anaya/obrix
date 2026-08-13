import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { DollarSign, FileText, Plus, RefreshCcw, Trash2, Upload, X } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CatalogoGrid, type CatalogoGridConfig, type CatalogoGridHandle, type Fila } from "@/features/catalogos/CatalogoGrid";
import { MaterialFormPanel } from "@/features/catalogos/MaterialFormPanel";
import { PreciosMaterialPanel } from "@/features/catalogos/PreciosMaterialPanel";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createMaterial,
  deleteMaterial,
  importarMaterialesCsv,
  listFamiliasInsumo,
  listMateriales,
  listProveedores,
  listUnidadesMedida,
  listUsuarios,
  updateMaterial,
} from "@/lib/tauri";
import type { FamiliaInsumo, Material, MaterialData, Proveedor, ResultadoImportacion, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_PROVEEDOR = "— Sin proveedor —";
const SIN_FAMILIA = "— Sin familia —";
const SIN_SUBFAMILIA = "— Sin sub familia —";
const FILTRO_CSV = [{ name: "CSV", extensions: ["csv"] }];

const COLUMNAS_CONTROL = [
  { campo: "created_at", encabezado: "Creado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "created_by", encabezado: "Creado por", ancho: 220, soloLectura: true },
  { campo: "updated_at", encabezado: "Actualizado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "updated_by", encabezado: "Actualizado por", ancho: 220, soloLectura: true },
];

export function MaterialesSeccion() {
  const gridRef = useRef<CatalogoGridHandle>(null);
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
  const [materialSeleccionadoId, setMaterialSeleccionadoId] = useState<string | null>(null);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!guardadoExitoso) return;
    const espera = setTimeout(() => setGuardadoExitoso(false), 3000);
    return () => clearTimeout(espera);
  }, [guardadoExitoso]);

  const recargarMateriales = () => listMateriales().then(setMateriales).catch((e) => setError(String(e)));

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
    try {
      const resultado = await importarMaterialesCsv(path);
      setResultadoImportacion(resultado);
      await recargarMateriales();
    } catch (e) {
      setError(String(e));
    } finally {
      setImportando(false);
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

  const config: CatalogoGridConfig = useMemo(
    () => ({
      titulo: "Materiales",
      columnas: [
        { campo: "clave", encabezado: "Clave", ancho: 110 },
        { campo: "descripcion", encabezado: "Descripción" },
        { campo: "unidad", encabezado: "Unidad", ancho: 110, opciones: unidades.map((u) => u.simbolo) },
        { campo: "costo_actual", encabezado: "Costo actual", ancho: 130, soloLectura: true, numero: true },
        {
          campo: "familia",
          encabezado: "Familia",
          ancho: 200,
          opciones: [SIN_FAMILIA, ...raicesFamilia.map((f) => f.nombre)],
        },
        {
          campo: "subfamilia",
          encabezado: "Sub familia",
          ancho: 200,
          opciones: (fila) => {
            const familiaId = raizIdPorNombre[String(fila.familia)];
            const hijas = familiaId ? (hijasPorPadreId[familiaId] ?? []) : [];
            return [SIN_SUBFAMILIA, ...hijas.map((h) => h.nombre)];
          },
        },
        {
          campo: "proveedor",
          encabezado: "Proveedor",
          ancho: 220,
          opciones: [SIN_PROVEEDOR, ...proveedores.map((p) => p.razon_social)],
        },
        { campo: "marca", encabezado: "Marca", ancho: 160 },
        { campo: "merma_porcentaje", encabezado: "Merma", numero: true, sufijo: "%", ancho: 110 },
        { campo: "activo", encabezado: "Activo", ancho: 90, booleano: true },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [unidades, proveedores, raicesFamilia, hijasPorPadreId, raizIdPorNombre],
  );

  const filas: Fila[] = useMemo(
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
        activo: m.activo,
        created_at: m.created_at,
        created_by: nombresPorUsuarioId[m.created_by] ?? m.created_by,
        updated_at: m.updated_at ?? "",
        updated_by: (m.updated_by && nombresPorUsuarioId[m.updated_by]) ?? m.updated_by ?? "",
      })),
    [materiales, simboloPorUnidadId, nombrePorFamiliaId, nombrePorProveedorId, nombresPorUsuarioId],
  );

  const filaAMaterialData = (fila: Fila): MaterialData => {
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
      activo: Boolean(fila.activo),
    };
  };

  const materialSeleccionado = materiales.find((m) => m.id === materialSeleccionadoId) ?? null;

  const grid = (
    <CatalogoGrid
      ref={gridRef}
      config={config}
      filasIniciales={filas}
      modoSeleccion="unica"
      resaltarSeleccion={panelPreciosAbierto || panelFichaAbierto}
      seleccionInicialId={materialSeleccionadoId}
      busqueda={busqueda}
      onBusquedaChange={setBusqueda}
      onSelectionChange={setPuedeEliminar}
      onFilaSeleccionada={(fila) => setMaterialSeleccionadoId(fila?._id ?? null)}
      onAgregarFila={(fila) => createMaterial(filaAMaterialData(fila)).then(recargarMateriales)}
      onCeldaEditada={(fila) => updateMaterial(fila._id, filaAMaterialData(fila)).then(recargarMateriales)}
      onEliminarFilas={(ids) => Promise.all(ids.map((id) => deleteMaterial(id))).then(recargarMateriales)}
      onErrorGuardado={(mensaje) => setError(mensaje)}
      onGuardadoExitoso={() => setGuardadoExitoso(true)}
      onEdicionCancelada={() => {
        setError(null);
        setGuardadoExitoso(false);
      }}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Materiales</h2>
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
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargarTodo },
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.agregarFila() },
              {
                icono: Trash2,
                titulo: "Eliminar seleccionado",
                onClick: () => gridRef.current?.eliminarFilaSeleccionada(),
                disabled: !puedeEliminar,
              },
              {
                icono: Upload,
                titulo: importando ? "Importando…" : "Importar desde CSV",
                onClick: () => void importarCsv(),
                disabled: importando,
              },
              {
                icono: DollarSign,
                titulo: panelPreciosAbierto ? "Ocultar precios" : "Ver precios",
                onClick: () =>
                  setPanelPreciosAbierto((v) => {
                    if (!v) setPanelFichaAbierto(false);
                    return !v;
                  }),
              },
              {
                icono: FileText,
                titulo: panelFichaAbierto ? "Ocultar ficha" : "Ver ficha",
                onClick: () =>
                  setPanelFichaAbierto((v) => {
                    if (!v) setPanelPreciosAbierto(false);
                    return !v;
                  }),
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
          {resultadoImportacion.errores.length > 0 && (
            <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-auto pl-4 text-muted-foreground">
              {resultadoImportacion.errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {/* El grupo vive siempre: si el grid pasa de hijo directo a panel (o
            al revés) React lo desmonta, el virtualizador vuelve a scroll 0 y
            el renglón seleccionado deja de verse. */}
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
                    onCerrar={() => setPanelPreciosAbierto(false)}
                    onPrecioRegistrado={recargarMateriales}
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
      </div>
    </div>
  );
}
