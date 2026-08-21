import { useEffect, useMemo, useState } from "react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { FichaShell } from "@/components/FichaShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { updateCliente } from "@/lib/tauri";
import type { Cliente, ClienteData, TipoCliente } from "@/lib/types";
import { TIPOS_CLIENTE } from "@/lib/types";
import { cn } from "@/lib/utils";

const ETIQUETA_TIPO: Record<TipoCliente, string> = {
  privado: "Privado",
  gobierno: "Gobierno",
};

function aClienteData(c: Cliente): ClienteData {
  return {
    razon_social: c.razon_social,
    rfc: c.rfc,
    tipo: c.tipo,
    contacto_nombre: c.contacto_nombre,
    contacto_correo: c.contacto_correo,
    contacto_telefono: c.contacto_telefono,
    domicilio_fiscal: c.domicilio_fiscal,
  };
}

/**
 * Vista en forma del cliente seleccionado — los mismos campos que las
 * columnas (más domicilio fiscal, que el grid no muestra), en un
 * formulario para revisar/editar un registro a la vez. En
 * `ClientesSeccion` se sincroniza con la fila. "Guardar" hace
 * `updateCliente` y avisa al padre vía `onGuardado`.
 */
export function ClienteFormPanel({
  cliente,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  cliente: Cliente | null;
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<ClienteData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDatos(cliente ? aClienteData(cliente) : null);
  }, [cliente]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const puedeGuardar = useMemo(() => {
    if (!datos || !cliente) return false;
    if (!datos.razon_social.trim() || !datos.rfc.trim() || !datos.tipo) return false;
    return JSON.stringify(datos) !== JSON.stringify(aClienteData(cliente));
  }, [cliente, datos]);

  const guardar = async () => {
    if (!datos || !cliente || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateCliente(cliente.id, {
        ...datos,
        razon_social: datos.razon_social.trim(),
        rfc: datos.rfc.trim(),
        contacto_nombre: datos.contacto_nombre?.trim() || null,
        contacto_correo: datos.contacto_correo?.trim() || null,
        contacto_telefono: datos.contacto_telefono?.trim() || null,
        domicilio_fiscal: datos.domicilio_fiscal?.trim() || null,
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
      titulo={`Ficha${cliente ? ` — ${cliente.razon_social}` : ""}`}
      vacio="Selecciona un cliente para ver su ficha."
      item={cliente}
      nombresPorUsuarioId={nombresPorUsuarioId}
      puedeGuardar={puedeGuardar}
      guardando={guardando}
      onCerrar={onCerrar}
      onDescartar={() => setDatos(cliente ? aClienteData(cliente) : datos)}
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
              <Select
                value={datos.tipo}
                onValueChange={(v) => setDatos({ ...datos, tipo: v as TipoCliente })}
              >
                <SelectTrigger className={FIELD_INPUT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_CLIENTE.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ETIQUETA_TIPO[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contacto">
              <input
                value={datos.contacto_nombre ?? ""}
                onChange={(e) => setDatos({ ...datos, contacto_nombre: e.target.value || null })}
                className={FIELD_INPUT_CLASS}
              />
            </Field>
            <Field label="Correo de contacto">
              <input
                type="email"
                value={datos.contacto_correo ?? ""}
                onChange={(e) => setDatos({ ...datos, contacto_correo: e.target.value || null })}
                className={FIELD_INPUT_CLASS}
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={datos.contacto_telefono ?? ""}
                onChange={(e) => setDatos({ ...datos, contacto_telefono: e.target.value || null })}
                className={FIELD_INPUT_CLASS}
              />
            </Field>
            <Field label="Domicilio fiscal">
              <textarea
                value={datos.domicilio_fiscal ?? ""}
                onChange={(e) => setDatos({ ...datos, domicilio_fiscal: e.target.value || null })}
                rows={3}
                className={cn(FIELD_INPUT_CLASS, "resize-none")}
              />
            </Field>
        </>
      )}
    </FichaShell>
  );
}
