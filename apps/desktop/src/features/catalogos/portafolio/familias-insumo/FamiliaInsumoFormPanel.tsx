import { useEffect, useMemo, useState } from "react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { FichaShell } from "@/components/FichaShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ICONOS_FAMILIA } from "@/icons/familias";
import { updateFamiliaInsumo } from "@/lib/tauri";
import type { FamiliaInsumo, FamiliaInsumoData } from "@/lib/types";
import { ordenarPor } from "@/lib/ordenar";

const SIN_ICONO = "__sin_icono__";

function aDatos(f: FamiliaInsumo): FamiliaInsumoData {
  return {
    nombre: f.nombre,
    parent_id: f.parent_id,
    insumos_asociados: f.insumos_asociados,
    icono: f.icono,
  };
}

export function FamiliaInsumoFormPanel({
  familia,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  familia: FamiliaInsumo | null;
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<FamiliaInsumoData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idsIcono = useMemo(() => ordenarPor(Object.keys(ICONOS_FAMILIA), (id) => id), []);

  useEffect(() => {
    setError(null);
    setDatos(familia ? aDatos(familia) : null);
  }, [familia]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const puedeGuardar = useMemo(() => {
    if (!datos || !familia) return false;
    if (!datos.nombre.trim()) return false;
    return JSON.stringify(datos) !== JSON.stringify(aDatos(familia));
  }, [familia, datos]);

  const guardar = async () => {
    if (!datos || !familia || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateFamiliaInsumo(familia.id, {
        nombre: datos.nombre.trim(),
        parent_id: familia.parent_id,
        insumos_asociados: datos.insumos_asociados?.trim() || null,
        icono: datos.icono?.trim() || null,
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
      titulo={`Ficha${familia ? ` — ${familia.nombre}` : ""}`}
      vacio="Selecciona una familia o subfamilia para ver su ficha."
      item={familia}
      nombresPorUsuarioId={nombresPorUsuarioId}
      puedeGuardar={puedeGuardar}
      guardando={guardando}
      onCerrar={onCerrar}
      onDescartar={() => setDatos(familia ? aDatos(familia) : datos)}
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
          <Field label="Icono">
            <Select
              value={datos.icono ?? SIN_ICONO}
              onValueChange={(v) => setDatos({ ...datos, icono: v === SIN_ICONO ? null : v })}
            >
              <SelectTrigger className={FIELD_INPUT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ICONO}>Sin icono</SelectItem>
                {idsIcono.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id.replace(/^familia-/, "").replace(/-/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Insumos asociados">
            <textarea
              value={datos.insumos_asociados ?? ""}
              onChange={(e) => setDatos({ ...datos, insumos_asociados: e.target.value || null })}
              rows={3}
              className={`${FIELD_INPUT_CLASS} resize-none`}
            />
          </Field>
        </>
      )}
    </FichaShell>
  );
}
