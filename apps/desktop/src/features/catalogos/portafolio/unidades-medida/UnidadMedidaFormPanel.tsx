import { useEffect, useMemo, useState } from "react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { FichaShell } from "@/components/FichaShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { updateUnidadMedida } from "@/lib/tauri";
import { TIPOS_MAGNITUD, type TipoMagnitud, type UnidadMedida, type UnidadMedidaData } from "@/lib/types";

const ETIQUETA_MAGNITUD: Record<TipoMagnitud, string> = {
  longitud: "Longitud",
  area: "Área",
  volumen: "Volumen",
  masa: "Masa",
  pieza: "Pieza",
  tiempo: "Tiempo",
  otro: "Otro",
};

function aDatos(u: UnidadMedida): UnidadMedidaData {
  return {
    simbolo: u.simbolo,
    simbolo_impresion: u.simbolo_impresion,
    variantes: u.variantes,
    clave_sat: u.clave_sat,
    descripcion: u.descripcion,
    tipo_magnitud: u.tipo_magnitud,
  };
}

export function UnidadMedidaFormPanel({
  unidad,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  unidad: UnidadMedida | null;
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<UnidadMedidaData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDatos(unidad ? aDatos(unidad) : null);
  }, [unidad]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const puedeGuardar = useMemo(() => {
    if (!datos || !unidad) return false;
    if (!datos.simbolo.trim() || !datos.descripcion.trim()) return false;
    return JSON.stringify(datos) !== JSON.stringify(aDatos(unidad));
  }, [unidad, datos]);

  const guardar = async () => {
    if (!datos || !unidad || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateUnidadMedida(unidad.id, {
        ...datos,
        simbolo: datos.simbolo.trim(),
        simbolo_impresion: datos.simbolo_impresion.trim() || datos.simbolo.trim(),
        variantes: datos.variantes.trim(),
        clave_sat: datos.clave_sat?.trim() || null,
        descripcion: datos.descripcion.trim(),
      });
      onGuardado?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <FichaShell
      titulo={`Ficha${unidad ? ` — ${unidad.simbolo}` : ""}`}
      vacio="Selecciona una unidad para ver su ficha."
      item={unidad}
      nombresPorUsuarioId={nombresPorUsuarioId}
      puedeGuardar={puedeGuardar}
      guardando={guardando}
      onCerrar={onCerrar}
      onDescartar={() => setDatos(unidad ? aDatos(unidad) : datos)}
      onGuardar={() => void guardar()}
    >
      {datos && (
        <>
          <Field label="Símbolo">
            <input
              value={datos.simbolo}
              onChange={(e) => setDatos({ ...datos, simbolo: e.target.value })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Símbolo de impresión">
            <input
              value={datos.simbolo_impresion}
              onChange={(e) => setDatos({ ...datos, simbolo_impresion: e.target.value })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Variantes">
            <input
              value={datos.variantes}
              onChange={(e) => setDatos({ ...datos, variantes: e.target.value })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Clave SAT">
            <input
              value={datos.clave_sat ?? ""}
              onChange={(e) => setDatos({ ...datos, clave_sat: e.target.value || null })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Descripción">
            <input
              value={datos.descripcion}
              onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Tipo de magnitud">
            <Select
              value={datos.tipo_magnitud}
              onValueChange={(v) => setDatos({ ...datos, tipo_magnitud: v as TipoMagnitud })}
            >
              <SelectTrigger className={FIELD_INPUT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_MAGNITUD.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ETIQUETA_MAGNITUD[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </>
      )}
    </FichaShell>
  );
}
