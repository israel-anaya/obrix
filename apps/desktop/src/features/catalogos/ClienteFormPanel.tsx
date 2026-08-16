import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatearFecha } from "@/lib/fecha";
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
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-xs font-semibold text-muted-foreground">
            Ficha{cliente ? ` — ${cliente.razon_social}` : ""}
          </h3>
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!datos ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona un cliente para ver su ficha.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
          <div className="flex flex-col gap-3">
            <Campo label="Razón social">
              <input
                value={datos.razon_social}
                onChange={(e) => setDatos({ ...datos, razon_social: e.target.value })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="RFC">
              <input
                value={datos.rfc}
                onChange={(e) => setDatos({ ...datos, rfc: e.target.value })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="Tipo">
              <Select
                value={datos.tipo}
                onValueChange={(v) => setDatos({ ...datos, tipo: v as TipoCliente })}
              >
                <SelectTrigger className={CAMPO_INPUT_CLASE}>
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
            </Campo>
            <Campo label="Contacto">
              <input
                value={datos.contacto_nombre ?? ""}
                onChange={(e) => setDatos({ ...datos, contacto_nombre: e.target.value || null })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="Correo de contacto">
              <input
                type="email"
                value={datos.contacto_correo ?? ""}
                onChange={(e) => setDatos({ ...datos, contacto_correo: e.target.value || null })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="Teléfono">
              <input
                value={datos.contacto_telefono ?? ""}
                onChange={(e) => setDatos({ ...datos, contacto_telefono: e.target.value || null })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="Domicilio fiscal">
              <textarea
                value={datos.domicilio_fiscal ?? ""}
                onChange={(e) => setDatos({ ...datos, domicilio_fiscal: e.target.value || null })}
                rows={3}
                className={cn(CAMPO_INPUT_CLASE, "resize-none")}
              />
            </Campo>

            {cliente && (
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span>Creado</span>
                <span className="text-right">{formatearFecha(cliente.created_at)}</span>
                <span>Creado por</span>
                <span className="truncate text-right">
                  {nombresPorUsuarioId[cliente.created_by] ?? cliente.created_by}
                </span>
                <span>Actualizado</span>
                <span className="text-right">{cliente.updated_at ? formatearFecha(cliente.updated_at) : "—"}</span>
                <span>Actualizado por</span>
                <span className="truncate text-right">
                  {cliente.updated_by ? (nombresPorUsuarioId[cliente.updated_by] ?? cliente.updated_by) : "—"}
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
            onClick={() => setDatos(cliente ? aClienteData(cliente) : datos)}
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
