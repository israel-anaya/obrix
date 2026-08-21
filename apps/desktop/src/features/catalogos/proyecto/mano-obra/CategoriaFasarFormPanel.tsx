import { useEffect, useMemo, useState } from "react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { FichaShell } from "@/components/FichaShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ordenarPor } from "@/lib/ordenar";
import { updateCategoriaFasar } from "@/lib/tauri";
import type { CategoriaFasar, CategoriaFasarData, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

// Radix no permite un `SelectItem` con value="" — estos "sin X" son null en
// el backend y necesitan un valor propio para poder ofrecerse como opción.
const SIN_FAMILIA_VALOR = "__sin_familia__";
const SIN_SUBFAMILIA_VALOR = "__sin_subfamilia__";

function aCategoriaData(c: CategoriaFasar): CategoriaFasarData {
  return {
    clave: c.clave,
    descripcion: c.descripcion,
    unidad_id: c.unidad_id,
    familia_id: c.familia_id,
    sub_familia_id: c.sub_familia_id,
  };
}

/**
 * Vista en forma de la categoría FASAR seleccionada — los mismos campos
 * que las columnas, pero en un formulario más legible para revisar/editar
 * un registro a la vez. En `CategoriaFasarSeccion` se sincroniza con la
 * fila. "Guardar" hace `updateCategoriaFasar` y avisa al padre vía
 * `onGuardado`. El salario vigente es de solo lectura: se registra desde
 * el panel de salario, no desde la ficha.
 */
export function CategoriaFasarFormPanel({
  categoria,
  unidades,
  familias,
  nombresPorUsuarioId,
  onCerrar,
  onGuardado,
}: {
  categoria: CategoriaFasar | null;
  unidades: UnidadMedida[];
  familias: FamiliaInsumo[];
  nombresPorUsuarioId: Record<string, string>;
  onCerrar: () => void;
  onGuardado?: () => void;
}) {
  const raicesFamilia = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);

  const [datos, setDatos] = useState<CategoriaFasarData | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se resincroniza cada vez que cambia la categoría seleccionada o se
  // recarga tras guardar — descarta cualquier edición sin confirmar de la
  // fila anterior.
  useEffect(() => {
    setError(null);
    setDatos(categoria ? aCategoriaData(categoria) : null);
  }, [categoria]);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const hijas = datos?.familia_id ? (hijasPorPadreId[datos.familia_id] ?? []) : [];

  const puedeGuardar = useMemo(() => {
    if (!datos || !categoria) return false;
    if (!datos.clave.trim() || !datos.descripcion.trim() || !datos.unidad_id) return false;
    return JSON.stringify(datos) !== JSON.stringify(aCategoriaData(categoria));
  }, [categoria, datos]);

  const guardar = async () => {
    if (!datos || !categoria || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await updateCategoriaFasar(categoria.id, datos);
      onGuardado?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const salario = categoria?.salario_vigente ?? null;

  return (
    <FichaShell
      titulo={`Ficha${categoria ? ` — ${categoria.clave}` : ""}`}
      vacio="Selecciona una categoría para ver su ficha."
      item={categoria}
      nombresPorUsuarioId={nombresPorUsuarioId}
      puedeGuardar={puedeGuardar}
      guardando={guardando}
      onCerrar={onCerrar}
      onDescartar={() => setDatos(categoria ? aCategoriaData(categoria) : datos)}
      onGuardar={() => void guardar()}
    >
      {datos && (
        <>
            <Field label="Clave">
              <input
                value={datos.clave}
                onChange={(e) => setDatos({ ...datos, clave: e.target.value })}
                className={FIELD_INPUT_CLASS}
              />
            </Field>
            <Field label="Descripción">
              <textarea
                value={datos.descripcion}
                onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
                rows={2}
                className={cn(FIELD_INPUT_CLASS, "resize-none")}
              />
            </Field>
            <Field label="Unidad">
              <Select value={datos.unidad_id} onValueChange={(v) => setDatos({ ...datos, unidad_id: v })}>
                <SelectTrigger className={FIELD_INPUT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ordenarPor(unidades, (u) => u.simbolo).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.simbolo} — {u.descripcion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Familia">
              <Select
                value={datos.familia_id ?? SIN_FAMILIA_VALOR}
                onValueChange={(v) =>
                  setDatos({ ...datos, familia_id: v === SIN_FAMILIA_VALOR ? null : v, sub_familia_id: null })
                }
              >
                <SelectTrigger className={FIELD_INPUT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_FAMILIA_VALOR}>— Sin familia —</SelectItem>
                  {ordenarPor(raicesFamilia, (f) => f.nombre).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sub familia">
              <Select
                value={datos.sub_familia_id ?? SIN_SUBFAMILIA_VALOR}
                onValueChange={(v) => setDatos({ ...datos, sub_familia_id: v === SIN_SUBFAMILIA_VALOR ? null : v })}
                disabled={hijas.length === 0}
              >
                <SelectTrigger className={cn(FIELD_INPUT_CLASS, hijas.length === 0 && "opacity-50")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_SUBFAMILIA_VALOR}>— Sin sub familia —</SelectItem>
                  {ordenarPor(hijas, (h) => h.nombre).map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Salario base diario</span>
                <span className="font-medium">{salario ? `$${salario.salario_base_diario}` : "$0"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">FSR</span>
                <span className="font-medium">{salario?.factor_salario_real ?? "0"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Salario real vigente</span>
                <span className="font-medium">{salario ? `$${salario.salario_real_diario}` : "$0"}</span>
              </div>
            </div>
        </>
      )}
    </FichaShell>
  );
}
