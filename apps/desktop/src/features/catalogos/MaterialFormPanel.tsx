import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import { formatearFecha } from "@/lib/fecha";
import { createMaterial, updateMaterial } from "@/lib/tauri";
import type { FamiliaInsumo, Material, MaterialData, Proveedor, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

function aMaterialData(m: Material): MaterialData {
  return {
    clave: m.clave,
    descripcion: m.descripcion,
    unidad_id: m.unidad_id,
    familia_id: m.familia_id,
    sub_familia_id: m.sub_familia_id,
    proveedor_id: m.proveedor_id,
    merma_porcentaje: m.merma_porcentaje,
    marca: m.marca,
  };
}

/**
 * Vista en forma del material seleccionado — los mismos campos que las
 * columnas, pero en un formulario más legible para revisar/editar un
 * registro a la vez. En `MaterialesSeccion` se sincroniza con la fila;
 * en la Estantería también cubre el alta (`nuevo`) sin tocar el grid.
 * "Guardar" hace `updateMaterial` (o `createMaterial` si `nuevo`); avisa
 * al padre vía `onGuardado` / `onCreado`.
 */
export function MaterialFormPanel({
  material,
  nuevo,
  unidades,
  proveedores,
  familias,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
  onCreado,
}: {
  material: Material | null;
  /** Borrador de un alta — si viene, el panel crea en vez de editar. */
  nuevo?: MaterialData | null;
  unidades: UnidadMedida[];
  proveedores: Proveedor[];
  familias: FamiliaInsumo[];
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
  onCreado?: (creado: Material) => void;
}) {
  const raicesFamilia = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);

  const [datos, setDatos] = useState<MaterialData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creando = !!nuevo;

  // Se resincroniza cada vez que cambia el material seleccionado, el
  // borrador de alta, o se recarga tras guardar — descarta cualquier
  // edición sin confirmar de la fila anterior.
  useEffect(() => {
    setError(null);
    if (nuevo) {
      setDatos(nuevo);
      return;
    }
    setDatos(material ? aMaterialData(material) : null);
  }, [material, nuevo]);

  const hijas = datos?.familia_id ? (hijasPorPadreId[datos.familia_id] ?? []) : [];

  const puedeGuardar = useMemo(() => {
    if (!datos) return false;
    if (!datos.clave.trim() || !datos.descripcion.trim() || !datos.unidad_id) return false;
    if (creando) return true;
    if (!material) return false;
    return JSON.stringify(datos) !== JSON.stringify(aMaterialData(material));
  }, [material, datos, creando]);

  const guardar = async () => {
    if (!datos || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      if (creando) {
        const creado = await createMaterial(datos);
        onCreado?.(creado);
      } else if (material) {
        await updateMaterial(material.id, datos);
        onGuardado?.();
      }
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
            Ficha{creando ? " — nuevo" : material ? ` — ${material.clave}` : ""}
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
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona un material para ver su ficha.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
          {error && <p className="mb-2 text-xs text-destructive">{error}</p>}

          <div className="flex flex-col gap-3">
            <Campo label="Clave">
              <input
                value={datos.clave}
                onChange={(e) => setDatos({ ...datos, clave: e.target.value })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="Descripción">
              <textarea
                value={datos.descripcion}
                onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
                rows={2}
                className={cn(CAMPO_INPUT_CLASE, "resize-none")}
              />
            </Campo>
            <Campo label="Unidad">
              <select
                value={datos.unidad_id}
                onChange={(e) => setDatos({ ...datos, unidad_id: e.target.value })}
                className={CAMPO_INPUT_CLASE}
              >
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.simbolo} — {u.descripcion}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Familia">
              <select
                value={datos.familia_id ?? ""}
                onChange={(e) => setDatos({ ...datos, familia_id: e.target.value || null, sub_familia_id: null })}
                className={CAMPO_INPUT_CLASE}
              >
                <option value="">— Sin familia —</option>
                {raicesFamilia.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Sub familia">
              <select
                value={datos.sub_familia_id ?? ""}
                onChange={(e) => setDatos({ ...datos, sub_familia_id: e.target.value || null })}
                disabled={hijas.length === 0}
                className={cn(CAMPO_INPUT_CLASE, hijas.length === 0 && "opacity-50")}
              >
                <option value="">— Sin sub familia —</option>
                {hijas.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Proveedor">
              <select
                value={datos.proveedor_id ?? ""}
                onChange={(e) => setDatos({ ...datos, proveedor_id: e.target.value || null })}
                className={CAMPO_INPUT_CLASE}
              >
                <option value="">— Sin proveedor —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.razon_social}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Marca">
              <input
                value={datos.marca ?? ""}
                onChange={(e) => setDatos({ ...datos, marca: e.target.value || null })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            <Campo label="Merma (%)">
              <input
                type="number"
                min="0"
                max="100"
                value={datos.merma_porcentaje ?? 0}
                onChange={(e) => setDatos({ ...datos, merma_porcentaje: Number(e.target.value) || 0 })}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>

            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Costo actual</span>
                <span className="font-medium">{material?.precio_vigente ? `$${material.precio_vigente}` : "$0"}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setDatos(nuevo ?? (material ? aMaterialData(material) : datos))}
                disabled={!puedeGuardar || guardando || creando}
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
                {guardando ? "Guardando…" : creando ? "Crear" : "Guardar"}
              </button>
            </div>

            {!creando && material && (
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
              <span>Creado</span>
              <span className="text-right">{formatearFecha(material.created_at)}</span>
              <span>Creado por</span>
              <span className="truncate text-right">{nombresPorUsuarioId[material.created_by] ?? material.created_by}</span>
              <span>Actualizado</span>
              <span className="text-right">{material.updated_at ? formatearFecha(material.updated_at) : "—"}</span>
              <span>Actualizado por</span>
              <span className="truncate text-right">
                {material.updated_by ? (nombresPorUsuarioId[material.updated_by] ?? material.updated_by) : "—"}
              </span>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
