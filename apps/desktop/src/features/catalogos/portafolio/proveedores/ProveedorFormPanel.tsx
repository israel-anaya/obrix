import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { FichaShell } from "@/components/FichaShell";
import { toast } from "@/hooks/use-toast";
import { updateProveedor } from "@/lib/tauri";
import type { Proveedor, ProveedorData } from "@/lib/types";

function aProveedorData(p: Proveedor): ProveedorData {
  return {
    razon_social: p.razon_social,
    rfc: p.rfc,
    contacto: p.contacto,
    calificacion: p.calificacion,
  };
}

/**
 * Vista en forma del proveedor seleccionado — los mismos campos que las
 * columnas, en un formulario para revisar/editar un registro a la vez.
 * En `ProveedoresSeccion` se sincroniza con la fila. "Guardar" hace
 * `updateProveedor` y avisa al padre vía `onGuardado`.
 */
export function ProveedorFormPanel({
  proveedor,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  proveedor: Proveedor | null;
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const [datos, setDatos] = useState<ProveedorData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDatos(proveedor ? aProveedorData(proveedor) : null);
  }, [proveedor]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const puedeGuardar = useMemo(() => {
    if (!datos || !proveedor) return false;
    if (!datos.razon_social.trim() || !datos.rfc.trim()) return false;
    return JSON.stringify(datos) !== JSON.stringify(aProveedorData(proveedor));
  }, [proveedor, datos]);

  const guardar = async () => {
    if (!datos || !proveedor || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateProveedor(proveedor.id, {
        ...datos,
        razon_social: datos.razon_social.trim(),
        rfc: datos.rfc.trim(),
        contacto: datos.contacto?.trim() || null,
      });
      onGuardado?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const estrellas = Number(datos?.calificacion);
  const calificacion = Number.isFinite(estrellas) && estrellas > 0 ? Math.min(5, Math.round(estrellas)) : 0;

  return (
    <FichaShell
      titulo={`Ficha${proveedor ? ` — ${proveedor.razon_social}` : ""}`}
      vacio="Selecciona un proveedor para ver su ficha."
      item={proveedor}
      nombresPorUsuarioId={nombresPorUsuarioId}
      puedeGuardar={puedeGuardar}
      guardando={guardando}
      onCerrar={onCerrar}
      onDescartar={() => setDatos(proveedor ? aProveedorData(proveedor) : datos)}
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
            <Field label="Contacto">
              <input
                value={datos.contacto ?? ""}
                onChange={(e) => setDatos({ ...datos, contacto: e.target.value || null })}
                className={FIELD_INPUT_CLASS}
              />
            </Field>
            <Field label="Calificación">
              <div className="mt-0.5 flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => {
                  const n = i + 1;
                  const llena = n <= calificacion;
                  return (
                    <button
                      key={n}
                      type="button"
                      title={`${n}`}
                      onClick={() =>
                        setDatos({ ...datos, calificacion: calificacion === n ? null : String(n) })
                      }
                      className="rounded-sm p-0.5 hover:scale-110"
                    >
                      <Star
                        size={16}
                        className={llena ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}
                      />
                    </button>
                  );
                })}
              </div>
            </Field>
        </>
      )}
    </FichaShell>
  );
}
