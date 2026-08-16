import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { SearchInput } from "@/components/SearchInput";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
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
 * mismo patrón maestro que `MaterialesSeccion`/`CategoriaFasarSeccion` pero
 * sin panel lateral: la herramienta no tiene precio propio, solo un
 * porcentaje por default sobre el costo de mano de obra, editable en la
 * misma fila.
 */
export function HerramientaSeccion() {
  const gridRef = useRef<DataGridHandle>(null);
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const recargarHerramientas = () => {
    setCargando(true);
    return listHerramientas()
      .then(setHerramientas)
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Herramienta</h2>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[{ icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.addRow() }]}
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
        <DataGrid
          ref={gridRef}
          config={config}
          initialRows={filas}
          loading={cargando}
          selectionMode="single"
          search={busqueda}
          onSearchChange={setBusqueda}
          onSelectionChange={setPuedeEliminar}
          onAddRow={(fila) => createHerramienta(filaAHerramientaData(fila)).then(recargarHerramientas)}
          onEditRow={(fila) => updateHerramienta(fila._id, filaAHerramientaData(fila)).then(recargarHerramientas)}
          onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteHerramienta(id))).then(recargarHerramientas)}
        />
      </div>
    </div>
  );
}
