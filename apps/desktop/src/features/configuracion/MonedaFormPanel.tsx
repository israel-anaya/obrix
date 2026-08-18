import { useEffect, useMemo, useState } from "react";
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import { FichaShell } from "@/components/FichaShell";
import { QuantityInput } from "@/components/QuantityInput";
import { toast } from "@/hooks/use-toast";
import { updateMoneda } from "@/lib/tauri";
import type { Moneda, MonedaData } from "@/lib/types";

function aDatos(m: Moneda): MonedaData {
  return {
    codigo: m.codigo,
    nombre: m.nombre,
    simbolo: m.simbolo,
    decimales: m.decimales,
  };
}

export function MonedaFormPanel({
  moneda,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  moneda: Moneda | null;
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<MonedaData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDatos(moneda ? aDatos(moneda) : null);
  }, [moneda]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const puedeGuardar = useMemo(() => {
    if (!datos || !moneda) return false;
    if (!datos.codigo.trim() || !datos.nombre.trim()) return false;
    return JSON.stringify(datos) !== JSON.stringify(aDatos(moneda));
  }, [moneda, datos]);

  const guardar = async () => {
    if (!datos || !moneda || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateMoneda(moneda.id, {
        ...datos,
        codigo: datos.codigo.trim(),
        nombre: datos.nombre.trim(),
        simbolo: datos.simbolo.trim(),
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
      titulo={`Ficha${moneda ? ` — ${moneda.codigo}` : ""}`}
      vacio="Selecciona una moneda para ver su ficha."
      item={moneda}
      nombresPorUsuarioId={nombresPorUsuarioId}
      puedeGuardar={puedeGuardar}
      guardando={guardando}
      onCerrar={onCerrar}
      onDescartar={() => setDatos(moneda ? aDatos(moneda) : datos)}
      onGuardar={() => void guardar()}
    >
      {datos && (
        <>
          <Campo label="Código">
            <input
              value={datos.codigo}
              onChange={(e) => setDatos({ ...datos, codigo: e.target.value })}
              className={CAMPO_INPUT_CLASE}
            />
          </Campo>
          <Campo label="Nombre">
            <input
              value={datos.nombre}
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              className={CAMPO_INPUT_CLASE}
            />
          </Campo>
          <Campo label="Símbolo">
            <input
              value={datos.simbolo}
              onChange={(e) => setDatos({ ...datos, simbolo: e.target.value })}
              className={CAMPO_INPUT_CLASE}
            />
          </Campo>
          <Campo label="Decimales">
            <QuantityInput
              value={String(datos.decimales)}
              onCommit={(v) => setDatos({ ...datos, decimales: Number(v) || 0 })}
              decimals={0}
              className={CAMPO_INPUT_CLASE}
            />
          </Campo>
        </>
      )}
    </FichaShell>
  );
}
