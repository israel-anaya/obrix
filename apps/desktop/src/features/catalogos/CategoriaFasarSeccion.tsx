import { useEffect, useMemo, useRef, useState } from "react";
import { DollarSign, History, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CatalogoGrid, type CatalogoGridConfig, type CatalogoGridHandle, type Fila } from "@/features/catalogos/CatalogoGrid";
import { SalarioCategoriaFasarPanel } from "@/features/catalogos/SalarioCategoriaFasarPanel";
import { SalarioHistorialGrid } from "@/features/catalogos/SalarioHistorialGrid";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { cn } from "@/lib/utils";
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

const COLUMNAS_CONTROL = [
  { campo: "created_at", encabezado: "Creado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "created_by", encabezado: "Creado por", ancho: 220, soloLectura: true },
  { campo: "updated_at", encabezado: "Actualizado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "updated_by", encabezado: "Actualizado por", ancho: 220, soloLectura: true },
];

/**
 * Vista del tabulador de salario (mano de obra atómica) — "Tabuladores de
 * Salario" en el panel izquierdo. Grid de `categoria_fasar` (extensión de
 * `insumo`) + panel lateral con las vigencias de `salario_categoria_fasar`
 * de la categoría seleccionada, mismo patrón maestro/detalle que
 * `MaterialesSeccion`/`PreciosMaterialPanel`.
 */
export function CategoriaFasarSeccion() {
  const gridRef = useRef<CatalogoGridHandle>(null);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [panelSalarioAbierto, setPanelSalarioAbierto] = useState(false);
  const [panelHistorialAbierto, setPanelHistorialAbierto] = useState(false);
  const [categoriaSeleccionadaId, setCategoriaSeleccionadaId] = useState<string | null>(null);
  const [estadoGuardado, setEstadoGuardado] = useState<{ tipo: "error" | "exito"; mensaje: string } | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (estadoGuardado?.tipo !== "exito") return;
    const espera = setTimeout(() => setEstadoGuardado(null), 3000);
    return () => clearTimeout(espera);
  }, [estadoGuardado]);

  const recargarCategorias = () => listCategoriasFasar().then(setCategorias).catch((e) => setError(String(e)));

  const recargarTodo = () => {
    void recargarCategorias();
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

  const config: CatalogoGridConfig = useMemo(
    () => ({
      titulo: "Tabuladores de Salario",
      columnas: [
        { campo: "clave", encabezado: "Clave", ancho: 110 },
        { campo: "descripcion", encabezado: "Descripción" },
        { campo: "unidad", encabezado: "Unidad", ancho: 110, opciones: unidades.map((u) => u.simbolo) },
        { campo: "salario_real_diario", encabezado: "Salario real vigente", ancho: 160, soloLectura: true, numero: true },
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
        { campo: "activo", encabezado: "Activo", ancho: 90, booleano: true },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [unidades, raicesFamilia, hijasPorPadreId, raizIdPorNombre],
  );

  const filas: Fila[] = useMemo(
    () =>
      categorias.map((c) => ({
        _id: c.id,
        clave: c.clave,
        descripcion: c.descripcion,
        unidad: simboloPorUnidadId[c.unidad_id] ?? c.unidad_id,
        salario_real_diario: c.salario_vigente ? `$${c.salario_vigente.salario_real_diario}` : "$0",
        familia: (c.familia_id && nombrePorFamiliaId[c.familia_id]) || SIN_FAMILIA,
        subfamilia: (c.sub_familia_id && nombrePorFamiliaId[c.sub_familia_id]) || SIN_SUBFAMILIA,
        activo: c.activo,
        created_at: c.created_at,
        created_by: nombresPorUsuarioId[c.created_by] ?? c.created_by,
        updated_at: c.updated_at ?? "",
        updated_by: (c.updated_by && nombresPorUsuarioId[c.updated_by]) ?? c.updated_by ?? "",
      })),
    [categorias, simboloPorUnidadId, nombrePorFamiliaId, nombresPorUsuarioId],
  );

  const filaACategoriaData = (fila: Fila): CategoriaFasarData => {
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
      activo: Boolean(fila.activo),
    };
  };

  const categoriaSeleccionada = categorias.find((c) => c.id === categoriaSeleccionadaId) ?? null;

  const contenidoGrid = panelSalarioAbierto ? (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="47" minSize="35" className="flex flex-col overflow-hidden">
        <CatalogoGrid
          ref={gridRef}
          config={config}
          filasIniciales={filas}
          modoSeleccion="unica"
          resaltarSeleccion
          seleccionInicialId={categoriaSeleccionadaId}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          onSelectionChange={setPuedeEliminar}
          onFilaSeleccionada={(fila) => setCategoriaSeleccionadaId(fila?._id ?? null)}
          onAgregarFila={(fila) => createCategoriaFasar(filaACategoriaData(fila)).then(recargarCategorias)}
          onCeldaEditada={(fila) => updateCategoriaFasar(fila._id, filaACategoriaData(fila)).then(recargarCategorias)}
          onEliminarFilas={(ids) => Promise.all(ids.map((id) => deleteCategoriaFasar(id))).then(recargarCategorias)}
          onErrorGuardado={(mensaje) => setEstadoGuardado({ tipo: "error", mensaje })}
          onGuardadoExitoso={() => setEstadoGuardado({ tipo: "exito", mensaje: "Guardado exitosamente" })}
          onEdicionCancelada={() => setEstadoGuardado(null)}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="53" minSize="22" className="flex flex-col overflow-hidden">
        <SalarioCategoriaFasarPanel
          categoriaId={categoriaSeleccionadaId}
          categoriaClave={categoriaSeleccionada?.clave}
          categoriaDescripcion={categoriaSeleccionada?.descripcion}
          onCerrar={() => setPanelSalarioAbierto(false)}
          onSalarioRegistrado={recargarCategorias}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    <CatalogoGrid
      ref={gridRef}
      config={config}
      filasIniciales={filas}
      modoSeleccion="unica"
      resaltarSeleccion={panelHistorialAbierto}
      seleccionInicialId={categoriaSeleccionadaId}
      busqueda={busqueda}
      onBusquedaChange={setBusqueda}
      onSelectionChange={setPuedeEliminar}
      onFilaSeleccionada={(fila) => setCategoriaSeleccionadaId(fila?._id ?? null)}
      onAgregarFila={(fila) => createCategoriaFasar(filaACategoriaData(fila)).then(recargarCategorias)}
      onCeldaEditada={(fila) => updateCategoriaFasar(fila._id, filaACategoriaData(fila)).then(recargarCategorias)}
      onEliminarFilas={(ids) => Promise.all(ids.map((id) => deleteCategoriaFasar(id))).then(recargarCategorias)}
      onErrorGuardado={(mensaje) => setEstadoGuardado({ tipo: "error", mensaje })}
      onGuardadoExitoso={() => setEstadoGuardado({ tipo: "exito", mensaje: "Guardado exitosamente" })}
      onEdicionCancelada={() => setEstadoGuardado(null)}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <p
          className={cn(
            "text-xs font-medium",
            estadoGuardado?.tipo === "error"
              ? "text-destructive"
              : estadoGuardado?.tipo === "exito"
                ? "text-emerald-600"
                : "invisible",
          )}
        >
          {estadoGuardado?.mensaje ?? "—"}
        </p>
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
                icono: DollarSign,
                titulo: panelSalarioAbierto ? "Ocultar salario" : "Ver salario",
                onClick: () => setPanelSalarioAbierto((v) => !v),
                disabled: !panelSalarioAbierto && categorias.length === 0,
              },
              {
                icono: History,
                titulo: panelHistorialAbierto ? "Ocultar historial de salarios" : "Ver historial de salarios",
                onClick: () => setPanelHistorialAbierto((v) => !v),
                disabled: !panelHistorialAbierto && categorias.length === 0,
              },
            ]}
          />
        </div>
      </div>
      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        {panelHistorialAbierto ? (
          <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel defaultSize="65" minSize="35" className="flex flex-col overflow-hidden">
              {contenidoGrid}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="35" minSize="20" className="flex flex-col overflow-hidden">
              <SalarioHistorialGrid categoriaId={categoriaSeleccionadaId} />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          contenidoGrid
        )}
      </div>
    </div>
  );
}
