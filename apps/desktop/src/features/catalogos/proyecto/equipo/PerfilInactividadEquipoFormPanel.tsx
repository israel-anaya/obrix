import { useEffect, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { FIELD_INPUT_CLASS } from "@/components/Field";
import { PercentageInput } from "@/components/PercentageInput";
import { toast } from "@/hooks/use-toast";
import { formatearFecha } from "@/lib/fecha";
import { updatePerfilInactividadEquipo } from "@/lib/tauri";
import type { PerfilInactividadEquipo, PerfilInactividadEquipoData } from "@/lib/types";
import { cn } from "@/lib/utils";

function aPerfilData(p: PerfilInactividadEquipo): PerfilInactividadEquipoData {
  return {
    nombre: p.nombre,
    espera_depreciacion_porcentaje: p.espera_depreciacion_porcentaje,
    espera_inversion_porcentaje: p.espera_inversion_porcentaje,
    espera_seguro_porcentaje: p.espera_seguro_porcentaje,
    espera_mantenimiento_porcentaje: p.espera_mantenimiento_porcentaje,
    espera_combustible_porcentaje: p.espera_combustible_porcentaje,
    espera_lubricante_porcentaje: p.espera_lubricante_porcentaje,
    espera_llantas_porcentaje: p.espera_llantas_porcentaje,
    espera_piezas_especiales_porcentaje: p.espera_piezas_especiales_porcentaje,
    espera_otras_fuentes_porcentaje: p.espera_otras_fuentes_porcentaje,
    espera_operacion_porcentaje: p.espera_operacion_porcentaje,
    reserva_depreciacion_porcentaje: p.reserva_depreciacion_porcentaje,
    reserva_inversion_porcentaje: p.reserva_inversion_porcentaje,
    reserva_seguro_porcentaje: p.reserva_seguro_porcentaje,
    reserva_mantenimiento_porcentaje: p.reserva_mantenimiento_porcentaje,
    reserva_combustible_porcentaje: p.reserva_combustible_porcentaje,
    reserva_lubricante_porcentaje: p.reserva_lubricante_porcentaje,
    reserva_llantas_porcentaje: p.reserva_llantas_porcentaje,
    reserva_piezas_especiales_porcentaje: p.reserva_piezas_especiales_porcentaje,
    reserva_otras_fuentes_porcentaje: p.reserva_otras_fuentes_porcentaje,
    reserva_operacion_porcentaje: p.reserva_operacion_porcentaje,
  };
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-foreground">{titulo}</p>
      {children}
    </div>
  );
}

function Subseccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="border-b border-border pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      {children}
    </div>
  );
}

const CAMPO_CAPTURA_CLASE = cn(FIELD_INPUT_CLASS, "mt-0 w-24 shrink-0");
const CAMPO_NOMBRE_CLASE = cn(FIELD_INPUT_CLASS, "mt-0 w-40 shrink-0");

function CampoEnLinea({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">{label}:</span>
      {children}
    </label>
  );
}

function CampoPorcentaje({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <CampoEnLinea label={label}>
      <PercentageInput
        value={value}
        onCommit={onCommit}
        className={CAMPO_CAPTURA_CLASE}
      />
    </CampoEnLinea>
  );
}

/**
 * Vista en forma del perfil seleccionado — los mismos 20 porcentajes que las
 * columnas, agrupados como en el Modo Matriz (espera / reserva, fijos /
 * consumo / operación) para revisar o editar un registro a la vez. En
 * Vista Clásica se sincroniza con la fila. "Guardar" hace
 * `updatePerfilInactividadEquipo` y avisa al padre vía `onGuardado`.
 */
export function PerfilInactividadEquipoFormPanel({
  perfil,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  perfil: PerfilInactividadEquipo | null;
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<PerfilInactividadEquipoData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDatos(perfil ? aPerfilData(perfil) : null);
  }, [perfil]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const puedeGuardar = useMemo(() => {
    if (!datos || !perfil) return false;
    if (!datos.nombre.trim()) return false;
    return JSON.stringify(datos) !== JSON.stringify(aPerfilData(perfil));
  }, [perfil, datos]);

  const guardar = async () => {
    if (!datos || !perfil || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updatePerfilInactividadEquipo(perfil.id, { ...datos, nombre: datos.nombre.trim() });
      onGuardado?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const setPorcentaje = (campo: keyof PerfilInactividadEquipoData, value: string) => {
    if (!datos) return;
    setDatos({ ...datos, [campo]: value });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-xs font-semibold text-muted-foreground">
            Ficha{perfil ? ` — ${perfil.nombre}` : ""}
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

      {!datos ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona un perfil para ver su ficha.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
          <div className="flex flex-col gap-4">
            <CampoEnLinea label="Nombre">
              <input
                value={datos.nombre}
                onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
                className={CAMPO_NOMBRE_CLASE}
              />
            </CampoEnLinea>

            <Seccion titulo="Maquinaria y equipo en espera">
              <Subseccion titulo="Costos fijos">
                <div className="flex flex-col gap-1.5">
                  <CampoPorcentaje
                    label="Depreciación"
                    value={datos.espera_depreciacion_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_depreciacion_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Inversión"
                    value={datos.espera_inversion_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_inversion_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Seguro"
                    value={datos.espera_seguro_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_seguro_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Mantenimiento"
                    value={datos.espera_mantenimiento_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_mantenimiento_porcentaje", v)}
                  />
                </div>
              </Subseccion>
              <Subseccion titulo="Costos por consumo">
                <div className="flex flex-col gap-1.5">
                  <CampoPorcentaje
                    label="Combustible"
                    value={datos.espera_combustible_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_combustible_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Lubricante"
                    value={datos.espera_lubricante_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_lubricante_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Llantas"
                    value={datos.espera_llantas_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_llantas_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Piezas especiales"
                    value={datos.espera_piezas_especiales_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_piezas_especiales_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Otras fuentes"
                    value={datos.espera_otras_fuentes_porcentaje}
                    onCommit={(v) => setPorcentaje("espera_otras_fuentes_porcentaje", v)}
                  />
                </div>
              </Subseccion>
              <Subseccion titulo="Costos por operación">
                <CampoPorcentaje
                  label="Operación"
                  value={datos.espera_operacion_porcentaje}
                  onCommit={(v) => setPorcentaje("espera_operacion_porcentaje", v)}
                />
              </Subseccion>
            </Seccion>

            <Seccion titulo="Maquinaria y equipo en reserva">
              <Subseccion titulo="Costos fijos">
                <div className="flex flex-col gap-1.5">
                  <CampoPorcentaje
                    label="Depreciación"
                    value={datos.reserva_depreciacion_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_depreciacion_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Inversión"
                    value={datos.reserva_inversion_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_inversion_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Seguro"
                    value={datos.reserva_seguro_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_seguro_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Mantenimiento"
                    value={datos.reserva_mantenimiento_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_mantenimiento_porcentaje", v)}
                  />
                </div>
              </Subseccion>
              <Subseccion titulo="Costos por consumo">
                <div className="flex flex-col gap-1.5">
                  <CampoPorcentaje
                    label="Combustible"
                    value={datos.reserva_combustible_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_combustible_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Lubricante"
                    value={datos.reserva_lubricante_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_lubricante_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Llantas"
                    value={datos.reserva_llantas_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_llantas_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Piezas especiales"
                    value={datos.reserva_piezas_especiales_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_piezas_especiales_porcentaje", v)}
                  />
                  <CampoPorcentaje
                    label="Otras fuentes"
                    value={datos.reserva_otras_fuentes_porcentaje}
                    onCommit={(v) => setPorcentaje("reserva_otras_fuentes_porcentaje", v)}
                  />
                </div>
              </Subseccion>
              <Subseccion titulo="Costos por operación">
                <CampoPorcentaje
                  label="Operación"
                  value={datos.reserva_operacion_porcentaje}
                  onCommit={(v) => setPorcentaje("reserva_operacion_porcentaje", v)}
                />
              </Subseccion>
            </Seccion>

            {perfil && (
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span>Creado</span>
                <span className="text-right">{formatearFecha(perfil.created_at)}</span>
                <span>Creado por</span>
                <span className="truncate text-right">
                  {nombresPorUsuarioId[perfil.created_by] ?? perfil.created_by}
                </span>
                <span>Actualizado</span>
                <span className="text-right">{perfil.updated_at ? formatearFecha(perfil.updated_at) : "—"}</span>
                <span>Actualizado por</span>
                <span className="truncate text-right">
                  {perfil.updated_by ? (nombresPorUsuarioId[perfil.updated_by] ?? perfil.updated_by) : "—"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {datos && (
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => setDatos(perfil ? aPerfilData(perfil) : datos)}
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
