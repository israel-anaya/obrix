import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatearFecha } from "@/lib/fecha";
import { ordenarPor } from "@/lib/ordenar";
import { updateEquipoCostoHorario } from "@/lib/tauri";
import type { EquipoCostoHorario, EquipoCostoHorarioData, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

// Radix no permite un `SelectItem` con value="" — estos "sin X" son null en
// el backend y necesitan un valor propio para poder ofrecerse como opción.
const SIN_FAMILIA_VALOR = "__sin_familia__";
const SIN_SUBFAMILIA_VALOR = "__sin_subfamilia__";

// Los 9 valores de captura de cargos fijos viajan intactos: esta ficha solo
// edita identidad, igual que el resto de catálogos — cf_* se sigue editando
// en el grid (o en Composición, donde vive el análisis completo).
function aDatos(e: EquipoCostoHorario): EquipoCostoHorarioData {
  return {
    clave: e.clave,
    descripcion: e.descripcion,
    unidad_id: e.unidad_id,
    familia_id: e.familia_id,
    sub_familia_id: e.sub_familia_id,
    cf_costo_maquina: e.cf_costo_maquina,
    cf_valor_llantas: e.cf_valor_llantas,
    cf_valor_piezas_especiales: e.cf_valor_piezas_especiales,
    cf_valor_rescate_porcentaje: e.cf_valor_rescate_porcentaje,
    cf_vida_economica_anios: e.cf_vida_economica_anios,
    cf_horas_uso_anual: e.cf_horas_uso_anual,
    cf_tasa_interes_anual_porcentaje: e.cf_tasa_interes_anual_porcentaje,
    cf_tasa_seguros_anual_porcentaje: e.cf_tasa_seguros_anual_porcentaje,
    cf_mantenimiento_porcentaje: e.cf_mantenimiento_porcentaje,
  };
}

/**
 * Vista en forma del equipo de costo horario seleccionado — identidad
 * (clave/descripción/unidad/familia), igual que `MaterialFormPanel`/
 * `HerramientaFormPanel`. "Guardar" hace `updateEquipoCostoHorario` y avisa
 * al padre vía `onGuardado`. Los cargos fijos y la composición
 * (consumo/operación) se editan en el grid y en `Ver composición`.
 */
export function EquipoCostoHorarioFormPanel({
  equipo,
  unidades,
  familias,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  equipo: EquipoCostoHorario | null;
  unidades: UnidadMedida[];
  familias: FamiliaInsumo[];
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const raicesFamilia = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);

  const [datos, setDatos] = useState<EquipoCostoHorarioData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDatos(equipo ? aDatos(equipo) : null);
  }, [equipo]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const hijas = datos?.familia_id ? (hijasPorPadreId[datos.familia_id] ?? []) : [];

  const puedeGuardar = useMemo(() => {
    if (!datos || !equipo) return false;
    if (!datos.clave.trim() || !datos.descripcion.trim() || !datos.unidad_id) return false;
    return JSON.stringify(datos) !== JSON.stringify(aDatos(equipo));
  }, [equipo, datos]);

  const guardar = async () => {
    if (!datos || !equipo || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateEquipoCostoHorario(equipo.id, datos);
      onGuardado?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-xs font-semibold text-muted-foreground">
            Ficha{equipo ? ` — ${equipo.clave}` : ""}
          </h3>
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!datos || !equipo ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona un equipo para ver su ficha.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
          <div className="flex flex-col gap-3">
            <Field label="Clave">
              <input
                value={datos.clave}
                onChange={(e) => setDatos({ ...datos, clave: e.target.value })}
                className={FIELD_INPUT_CLASS}
              />
            </Field>
            <Field label="Descripción">
              <textarea
                value={datos.descripcion}
                onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
                rows={2}
                className={cn(FIELD_INPUT_CLASS, "resize-none")}
              />
            </Field>
            <Field label="Unidad">
              <Select value={datos.unidad_id} onValueChange={(v) => setDatos({ ...datos, unidad_id: v })}>
                <SelectTrigger className={FIELD_INPUT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ordenarPor(unidades, (u) => u.simbolo).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.simbolo} — {u.descripcion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Familia">
              <Select
                value={datos.familia_id ?? SIN_FAMILIA_VALOR}
                onValueChange={(v) =>
                  setDatos({ ...datos, familia_id: v === SIN_FAMILIA_VALOR ? null : v, sub_familia_id: null })
                }
              >
                <SelectTrigger className={FIELD_INPUT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_FAMILIA_VALOR}>— Sin familia —</SelectItem>
                  {ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sub familia">
              <Select
                value={datos.sub_familia_id ?? SIN_SUBFAMILIA_VALOR}
                onValueChange={(v) => setDatos({ ...datos, sub_familia_id: v === SIN_SUBFAMILIA_VALOR ? null : v })}
                disabled={hijas.length === 0}
              >
                <SelectTrigger className={cn(FIELD_INPUT_CLASS, hijas.length === 0 && "opacity-50")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_SUBFAMILIA_VALOR}>— Sin sub familia —</SelectItem>
                  {ordenarPor(hijas, (h) => h.nombre).map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Costo horario total</span>
                <span className="font-medium">${equipo.costo_nacional?.costo_total ?? "0"}</span>
              </div>
            </div>

            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
              <span>Creado</span>
              <span className="text-right">{formatearFecha(equipo.created_at)}</span>
              <span>Creado por</span>
              <span className="truncate text-right">
                {nombresPorUsuarioId[equipo.created_by] ?? equipo.created_by}
              </span>
              <span>Actualizado</span>
              <span className="text-right">{equipo.updated_at ? formatearFecha(equipo.updated_at) : "—"}</span>
              <span>Actualizado por</span>
              <span className="truncate text-right">
                {equipo.updated_by ? (nombresPorUsuarioId[equipo.updated_by] ?? equipo.updated_by) : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {datos && (
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setDatos(equipo ? aDatos(equipo) : datos)}
            disabled={!puedeGuardar || guardando}
            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={!puedeGuardar || guardando}
            className={cn(
              "rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90",
              (!puedeGuardar || guardando) && "opacity-50",
            )}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </div>
  );
}
