import { useEffect, useMemo, useState } from "react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { FichaShell } from "@/components/FichaShell";
import { QuantityInput } from "@/components/QuantityInput";
import { toast } from "@/hooks/use-toast";
import { updateRegion } from "@/lib/tauri";
import type { Region, RegionData } from "@/lib/types";

function aDatos(r: Region): RegionData {
  return {
    nombre: r.nombre,
    estado: r.estado,
    factor_ajuste: r.factor_ajuste,
    visible: r.visible,
  };
}

export function RegionFormPanel({
  region,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  region: Region | null;
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<RegionData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDatos(region ? aDatos(region) : null);
  }, [region]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const puedeGuardar = useMemo(() => {
    if (!datos || !region) return false;
    if (!datos.nombre.trim()) return false;
    return JSON.stringify(datos) !== JSON.stringify(aDatos(region));
  }, [region, datos]);

  const guardar = async () => {
    if (!datos || !region || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateRegion(region.id, {
        ...datos,
        nombre: datos.nombre.trim(),
        estado: datos.estado.trim(),
        factor_ajuste: datos.factor_ajuste?.trim() || null,
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
      titulo={`Ficha${region ? ` — ${region.nombre}` : ""}`}
      vacio="Selecciona una región para ver su ficha."
      item={region}
      nombresPorUsuarioId={nombresPorUsuarioId}
      puedeGuardar={puedeGuardar}
      guardando={guardando}
      onCerrar={onCerrar}
      onDescartar={() => setDatos(region ? aDatos(region) : datos)}
      onGuardar={() => void guardar()}
    >
      {datos && (
        <>
          <Field label="Nombre">
            <input
              value={datos.nombre}
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Estado">
            <input
              value={datos.estado}
              onChange={(e) => setDatos({ ...datos, estado: e.target.value })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Factor de ajuste">
            <QuantityInput
              value={datos.factor_ajuste ?? ""}
              onCommit={(v) => setDatos({ ...datos, factor_ajuste: v || null })}
              decimals={4}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Visible">
            <input
              type="checkbox"
              checked={datos.visible}
              onChange={(e) => setDatos({ ...datos, visible: e.target.checked })}
              className="mt-1 size-3.5 accent-primary"
            />
          </Field>
        </>
      )}
    </FichaShell>
  );
}
