import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { ACTION_BAR_SEPARATOR, ActionBar, ActionBarMenu } from "@/components/ActionBar";
import { CsvOperationDialog, type CsvAdapter } from "@/components/csv";
import { SearchInput } from "@/components/SearchInput";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import { toast } from "@/hooks/use-toast";
import { adaptadorExportEquipoCostoHorario, adaptadorImportEquipoCostoHorario } from "@/features/catalogos/proyecto/costo-horario/csv/adaptadorEquipoCostoHorario";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createEquipoCostoHorario,
  deleteEquipoCostoHorario,
  listEquiposCostoHorario,
  listFamiliasInsumo,
  listUnidadesMedida,
  listUsuarios,
  updateEquipoCostoHorario,
} from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type { EquipoCostoHorario, EquipoCostoHorarioData, FamiliaInsumo, UnidadMedida } from "@/lib/types";

const SIN_FAMILIA = "— Sin familia —";
const SIN_SUBFAMILIA = "— Sin sub familia —";
const NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA = "Equipo y herramienta";
const SIMBOLO_UNIDAD_HORA = "hr";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

/**
 * Vista "Grid" de Equipo de costo horario — grid de `equipo_costo_horario`
 * (extensión de `insumo` cuando `tipo = equipo_herramienta`, equipo propio
 * costado por depreciación) con los 9 valores de captura de cargos fijos
 * como columnas editables y los caches de cargos fijos más
 * `costo_nacional` (subtotales y total) como columnas de solo lectura. La composición (consumo/operación) solo se
 * edita desde `EquipoCostoHorarioFicha` — mismo patrón que
 * `HerramientaSeccion`. Alternativa a `EquipoCostoHorarioFicha` (ver
 * `EquipoCostoHorarioSeccion`, que alterna entre las dos).
 */
export function EquipoCostoHorarioGridVista() {
  const gridRef = useRef<DataGridHandle>(null);
  const [equipos, setEquipos] = useState<EquipoCostoHorario[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);
  const [csvAdaptador, setCsvAdaptador] = useState<CsvAdapter | null>(null);

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
  const cargarEquipos = (marcarCarga: boolean) => {
    if (marcarCarga) setCargando(true);
    return listEquiposCostoHorario()
      .then(setEquipos)
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (marcarCarga) setCargando(false);
      });
  };

  const recargarEquipos = () => cargarEquipos(true);
  const refrescarEquipos = () => cargarEquipos(false);

  const recargarTodo = () => {
    void recargarEquipos();
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

  const simboloPorUnidadId = useMemo(() => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])), [unidades]);
  const unidadIdPorSimbolo = useMemo(() => Object.fromEntries(unidades.map((u) => [u.simbolo, u.id])), [unidades]);

  const raicesFamilia = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);
  const nombrePorFamiliaId = useMemo(() => Object.fromEntries(familias.map((f) => [f.id, f.nombre])), [familias]);
  const raizIdPorNombre = useMemo(() => Object.fromEntries(raicesFamilia.map((f) => [f.nombre, f.id])), [raicesFamilia]);

  const config: DataGridConfig = useMemo(
    () => ({
      title: "Equipo de costo horario",
      columns: [
        { field: "clave", header: "Clave", width: 110 },
        { field: "descripcion", header: "Descripción", width: 240 },
        {
          field: "unidad",
          header: "Unidad",
          width: 90,
          options: ordenarPor(unidades, (u) => u.simbolo).map((u) => u.simbolo),
          default: unidades.some((u) => u.simbolo === SIMBOLO_UNIDAD_HORA) ? SIMBOLO_UNIDAD_HORA : "",
        },
        {
          field: "familia",
          header: "Familia",
          width: 160,
          options: [SIN_FAMILIA, ...ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => f.nombre)],
          default: raicesFamilia.some((f) => f.nombre === NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA)
            ? NOMBRE_FAMILIA_EQUIPO_HERRAMIENTA
            : SIN_FAMILIA,
        },
        {
          field: "subfamilia",
          header: "Sub familia",
          width: 160,
          options: (fila) => {
            const familiaId = raizIdPorNombre[String(fila.familia)];
            const hijas = familiaId ? (hijasPorPadreId[familiaId] ?? []) : [];
            return [SIN_SUBFAMILIA, ...ordenarPor(hijas, (h) => h.nombre).map((h) => h.nombre)];
          },
        },
        { field: "cf_costo_maquina", header: "Costo máquina", width: 130, numeric: true },
        { field: "cf_valor_llantas", header: "Valor llantas", width: 120, numeric: true },
        { field: "cf_valor_piezas_especiales", header: "Valor piezas esp.", width: 130, numeric: true },
        { field: "cf_valor_maquina", header: "Valor máquina", width: 130, numeric: true, readOnly: true },
        { field: "cf_valor_rescate_porcentaje", header: "Rescate %", width: 100, numeric: true },
        { field: "cf_valor_rescate", header: "Valor rescate", width: 120, numeric: true, readOnly: true },
        { field: "cf_vida_economica_anios", header: "Vida económica (años)", width: 150, numeric: true },
        { field: "cf_horas_uso_anual", header: "Horas de uso anual", width: 140, numeric: true },
        { field: "cf_vida_util_horas", header: "Vida útil (horas)", width: 130, numeric: true, readOnly: true },
        { field: "cf_tasa_interes_anual_porcentaje", header: "Interés anual %", width: 120, numeric: true },
        { field: "cf_tasa_seguros_anual_porcentaje", header: "Seguros anual %", width: 120, numeric: true },
        { field: "cf_mantenimiento_porcentaje", header: "Mantenimiento %", width: 130, numeric: true },
        { field: "cf_depreciacion_hora", header: "Depreciación/hr", width: 120, numeric: true, readOnly: true },
        { field: "cf_inversion_hora", header: "Inversión/hr", width: 120, numeric: true, readOnly: true },
        { field: "cf_seguro_hora", header: "Seguro/hr", width: 110, numeric: true, readOnly: true },
        { field: "cf_mantenimiento_hora", header: "Mantenimiento/hr", width: 130, numeric: true, readOnly: true },
        { field: "cf_cargo_fijo_hora", header: "Cargo fijo/hr", width: 120, numeric: true, readOnly: true },
        { field: "subtotal_consumo", header: "Subtotal consumo/hr", width: 150, numeric: true, readOnly: true },
        { field: "subtotal_operacion", header: "Subtotal operación/hr", width: 160, numeric: true, readOnly: true },
        { field: "cargo_variable_hora", header: "Cargo variable/hr", width: 130, numeric: true, readOnly: true },
        { field: "costo_horario_total", header: "Costo horario total", width: 150, numeric: true, readOnly: true },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [unidades, raicesFamilia, hijasPorPadreId, raizIdPorNombre],
  );

  const filas: Row[] = useMemo(
    () =>
      equipos.map((e) => ({
        _id: e.id,
        clave: e.clave,
        descripcion: e.descripcion,
        unidad: simboloPorUnidadId[e.unidad_id] ?? e.unidad_id,
        familia: (e.familia_id && nombrePorFamiliaId[e.familia_id]) || SIN_FAMILIA,
        subfamilia: (e.sub_familia_id && nombrePorFamiliaId[e.sub_familia_id]) || SIN_SUBFAMILIA,
        cf_costo_maquina: e.cf_costo_maquina,
        cf_valor_llantas: e.cf_valor_llantas,
        cf_valor_piezas_especiales: e.cf_valor_piezas_especiales,
        cf_valor_maquina: e.cf_valor_maquina,
        cf_valor_rescate_porcentaje: e.cf_valor_rescate_porcentaje,
        cf_valor_rescate: e.cf_valor_rescate,
        cf_vida_economica_anios: e.cf_vida_economica_anios,
        cf_horas_uso_anual: e.cf_horas_uso_anual,
        cf_vida_util_horas: e.cf_vida_util_horas,
        cf_tasa_interes_anual_porcentaje: e.cf_tasa_interes_anual_porcentaje,
        cf_tasa_seguros_anual_porcentaje: e.cf_tasa_seguros_anual_porcentaje,
        cf_mantenimiento_porcentaje: e.cf_mantenimiento_porcentaje,
        cf_depreciacion_hora: e.cf_depreciacion_hora,
        cf_inversion_hora: e.cf_inversion_hora,
        cf_seguro_hora: e.cf_seguro_hora,
        cf_mantenimiento_hora: e.cf_mantenimiento_hora,
        cf_cargo_fijo_hora: e.cf_cargo_fijo_hora,
        subtotal_consumo: e.costo_nacional?.subtotal_consumo ?? "0",
        subtotal_operacion: e.costo_nacional?.subtotal_operacion ?? "0",
        cargo_variable_hora: e.costo_nacional?.cargo_variable_hora ?? "0",
        costo_horario_total: e.costo_nacional?.costo_total ?? "0",
        created_at: e.created_at,
        created_by: nombresPorUsuarioId[e.created_by] ?? e.created_by,
        updated_at: e.updated_at ?? "",
        updated_by: (e.updated_by && nombresPorUsuarioId[e.updated_by]) ?? e.updated_by ?? "",
      })),
    [equipos, simboloPorUnidadId, nombrePorFamiliaId, nombresPorUsuarioId],
  );

  const filaAEquipoCostoHorarioData = (fila: Row): EquipoCostoHorarioData => {
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
      cf_costo_maquina: String(fila.cf_costo_maquina ?? "0"),
      cf_valor_llantas: String(fila.cf_valor_llantas ?? "0"),
      cf_valor_piezas_especiales: String(fila.cf_valor_piezas_especiales ?? "0"),
      cf_valor_rescate_porcentaje: String(fila.cf_valor_rescate_porcentaje ?? "0"),
      cf_vida_economica_anios: String(fila.cf_vida_economica_anios ?? "1"),
      cf_horas_uso_anual: String(fila.cf_horas_uso_anual ?? "1"),
      cf_tasa_interes_anual_porcentaje: String(fila.cf_tasa_interes_anual_porcentaje ?? "0"),
      cf_tasa_seguros_anual_porcentaje: String(fila.cf_tasa_seguros_anual_porcentaje ?? "0"),
      cf_mantenimiento_porcentaje: String(fila.cf_mantenimiento_porcentaje ?? "0"),
    };
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-0.5">
          <ActionBar
            actions={[
              { icon: Plus, title: "Agregar", onClick: () => gridRef.current?.addRow() },
              ACTION_BAR_SEPARATOR,
              {
                icon: Download,
                title: "Exportar a CSV",
                onClick: () =>
                  setCsvAdaptador(adaptadorExportEquipoCostoHorario(equipos, unidades, familias)),
                disabled: csvAdaptador !== null || equipos.length === 0,
              },
              {
                icon: Upload,
                title: "Importar desde CSV",
                onClick: () =>
                  setCsvAdaptador(adaptadorImportEquipoCostoHorario()),
                disabled: csvAdaptador !== null,
              },
            ]}
          />
          <div className="mx-1 h-4 w-px bg-border" />
          <SearchInput value={busqueda} onChange={setBusqueda} />
        </div>
        <ActionBarMenu
          menu={[
            { icon: RefreshCcw, title: "Recargar", onClick: recargarTodo },
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
          onAddRow={(fila) => createEquipoCostoHorario(filaAEquipoCostoHorarioData(fila)).then(refrescarEquipos)}
          onEditRow={(fila) => updateEquipoCostoHorario(fila._id, filaAEquipoCostoHorarioData(fila)).then(refrescarEquipos)}
          onDeleteRows={(ids) => Promise.all(ids.map((id) => deleteEquipoCostoHorario(id))).then(refrescarEquipos)}
        />
      </div>
      <CsvOperationDialog
        adapter={csvAdaptador}
        onClose={() => setCsvAdaptador(null)}
        onDone={() => void refrescarEquipos()}
      />
    </div>
  );
}
