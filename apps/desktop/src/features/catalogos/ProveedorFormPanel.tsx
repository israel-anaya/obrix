import { useEffect, useMemo, useState } from "react";
import { Star, X } from "lucide-react";
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import { toast } from "@/hooks/use-toast";
import { formatearFecha } from "@/lib/fecha";
import { updateProveedor } from "@/lib/tauri";
import type { Proveedor, ProveedorData } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-xs font-semibold text-muted-foreground">
            Ficha{proveedor ? ` — ${proveedor.razon_social}` : ""}
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
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona un proveedor para ver su ficha.</p>
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
            <Campo label="Contacto">
              <input
                value={datos.contacto ?? ""}
                onChange={(e) => setDatos({ ...datos, contacto: e.target.value || null })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="Calificación">
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
            </Campo>

            {proveedor && (
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span>Creado</span>
                <span className="text-right">{formatearFecha(proveedor.created_at)}</span>
                <span>Creado por</span>
                <span className="truncate text-right">
                  {nombresPorUsuarioId[proveedor.created_by] ?? proveedor.created_by}
                </span>
                <span>Actualizado</span>
                <span className="text-right">{proveedor.updated_at ? formatearFecha(proveedor.updated_at) : "—"}</span>
                <span>Actualizado por</span>
                <span className="truncate text-right">
                  {proveedor.updated_by ? (nombresPorUsuarioId[proveedor.updated_by] ?? proveedor.updated_by) : "—"}
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
            onClick={() => setDatos(proveedor ? aProveedorData(proveedor) : datos)}
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
