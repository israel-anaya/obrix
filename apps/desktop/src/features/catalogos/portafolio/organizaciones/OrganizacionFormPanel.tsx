import { useEffect, useMemo, useState } from "react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { FichaShell } from "@/components/FichaShell";
import { QuantityInput } from "@/components/QuantityInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ordenarPor } from "@/lib/ordenar";
import { updateOrganizacion } from "@/lib/tauri";
import { TIPOS_ORGANIZACION, type Moneda, type Organizacion, type OrganizacionData, type TipoOrganizacion } from "@/lib/types";

const ETIQUETA_TIPO: Record<TipoOrganizacion, string> = {
  despacho: "Despacho",
  constructora: "Constructora",
  gobierno: "Gobierno",
};

function aDatos(o: Organizacion): OrganizacionData {
  return {
    razon_social: o.razon_social,
    rfc: o.rfc,
    tipo: o.tipo,
    moneda_default_id: o.moneda_default_id,
    horas_jornada: o.horas_jornada,
  };
}

export function OrganizacionFormPanel({
  organizacion,
  monedas,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  organizacion: Organizacion | null;
  monedas: Moneda[];
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<OrganizacionData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDatos(organizacion ? aDatos(organizacion) : null);
  }, [organizacion]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const puedeGuardar = useMemo(() => {
    if (!datos || !organizacion) return false;
    if (!datos.razon_social.trim() || !datos.rfc.trim() || !datos.moneda_default_id) return false;
    return JSON.stringify(datos) !== JSON.stringify(aDatos(organizacion));
  }, [organizacion, datos]);

  const guardar = async () => {
    if (!datos || !organizacion || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateOrganizacion(organizacion.id, {
        ...datos,
        razon_social: datos.razon_social.trim(),
        rfc: datos.rfc.trim(),
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
      titulo={`Ficha${organizacion ? ` — ${organizacion.razon_social}` : ""}`}
      vacio="Selecciona una organización para ver su ficha."
      item={organizacion}
      nombresPorUsuarioId={nombresPorUsuarioId}
      puedeGuardar={puedeGuardar}
      guardando={guardando}
      onCerrar={onCerrar}
      onDescartar={() => setDatos(organizacion ? aDatos(organizacion) : datos)}
      onGuardar={() => void guardar()}
    >
      {datos && (
        <>
          <Field label="Razón social">
            <input
              value={datos.razon_social}
              onChange={(e) => setDatos({ ...datos, razon_social: e.target.value })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="RFC">
            <input
              value={datos.rfc}
              onChange={(e) => setDatos({ ...datos, rfc: e.target.value })}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Tipo">
            <Select value={datos.tipo} onValueChange={(v) => setDatos({ ...datos, tipo: v as TipoOrganizacion })}>
              <SelectTrigger className={FIELD_INPUT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ORGANIZACION.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ETIQUETA_TIPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Moneda default">
            <Select
              value={datos.moneda_default_id}
              onValueChange={(v) => setDatos({ ...datos, moneda_default_id: v })}
            >
              <SelectTrigger className={FIELD_INPUT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ordenarPor(monedas, (m) => m.codigo).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.codigo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Horas por jornada">
            <QuantityInput
              value={datos.horas_jornada}
              onCommit={(v) => setDatos({ ...datos, horas_jornada: v || "8" })}
              decimals={1}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
        </>
      )}
    </FichaShell>
  );
}
