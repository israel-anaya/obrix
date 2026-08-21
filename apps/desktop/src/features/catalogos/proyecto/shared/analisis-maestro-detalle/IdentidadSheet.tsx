import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatearFecha } from "@/lib/fecha";
import { ordenarPor } from "@/lib/ordenar";
import type { FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

// Radix no permite un `SelectItem` con value="" — estos "sin X" son null en
// el backend y necesitan un valor propio para poder ofrecerse como opción.
export const SIN_FAMILIA_VALOR = "__sin_familia__";
export const SIN_SUBFAMILIA_VALOR = "__sin_subfamilia__";

export interface AuditoriaIdentidad {
  creadoEn: string;
  creadoPor: string;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

/**
 * `Sheet` de alta/edición de la identidad de un insumo (clave/descripción/
 * unidad/familia/sub familia) + bloque de auditoría al editar — idéntico
 * entre básico auxiliar, cuadrilla y equipo de costo horario. Lo que sea
 * específico de dominio (p. ej. los cargos fijos de costo horario) no se
 * captura aquí — vive en el análisis de detalle (`*AnalisisInsumo`) y el wrapper es
 * responsable de conservarlo al construir el payload de `onGuardar`.
 */
export function IdentidadSheet({
  open,
  titulo,
  clave,
  onClaveChange,
  descripcion,
  onDescripcionChange,
  unidadId,
  onUnidadIdChange,
  unidades,
  familiaId,
  onFamiliaIdChange,
  familiasRaiz,
  subfamiliaId,
  onSubfamiliaIdChange,
  subfamiliasDisponibles,
  error,
  guardando,
  onGuardar,
  onCancelar,
  auditoria,
}: {
  open: boolean;
  titulo: string;
  clave: string;
  onClaveChange: (v: string) => void;
  descripcion: string;
  onDescripcionChange: (v: string) => void;
  unidadId: string;
  onUnidadIdChange: (v: string) => void;
  unidades: UnidadMedida[];
  familiaId: string | null;
  onFamiliaIdChange: (v: string | null) => void;
  familiasRaiz: FamiliaInsumo[];
  subfamiliaId: string | null;
  onSubfamiliaIdChange: (v: string | null) => void;
  subfamiliasDisponibles: FamiliaInsumo[];
  error: string | null;
  guardando: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
  auditoria?: AuditoriaIdentidad | null;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onCancelar()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Field label="Clave">
            <input
              autoFocus
              value={clave}
              onChange={(e) => onClaveChange(e.target.value)}
              className={FIELD_INPUT_CLASS}
            />
          </Field>
          <Field label="Descripción">
            <textarea
              value={descripcion}
              onChange={(e) => onDescripcionChange(e.target.value)}
              rows={4}
              className={cn(FIELD_INPUT_CLASS, "resize-none")}
            />
          </Field>
          <Field label="Unidad">
            <Select value={unidadId} onValueChange={onUnidadIdChange}>
              <SelectTrigger className={FIELD_INPUT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ordenarPor(unidades, (u) => u.simbolo).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.simbolo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Familia">
            <Select
              value={familiaId ?? SIN_FAMILIA_VALOR}
              onValueChange={(v) => {
                onFamiliaIdChange(v === SIN_FAMILIA_VALOR ? null : v);
                onSubfamiliaIdChange(null);
              }}
            >
              <SelectTrigger className={FIELD_INPUT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_FAMILIA_VALOR}>— Sin familia —</SelectItem>
                {ordenarPor(familiasRaiz, (f) => f.nombre).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sub familia">
            <Select
              value={subfamiliaId ?? SIN_SUBFAMILIA_VALOR}
              onValueChange={(v) => onSubfamiliaIdChange(v === SIN_SUBFAMILIA_VALOR ? null : v)}
              disabled={subfamiliasDisponibles.length === 0}
            >
              <SelectTrigger className={cn(FIELD_INPUT_CLASS, subfamiliasDisponibles.length === 0 && "opacity-50")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_SUBFAMILIA_VALOR}>— Sin sub familia —</SelectItem>
                {ordenarPor(subfamiliasDisponibles, (h) => h.nombre).map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {auditoria && (
            <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
              <span>Creado</span>
              <span className="text-right">{formatearFecha(auditoria.creadoEn)}</span>
              <span>Creado por</span>
              <span className="truncate text-right">{auditoria.creadoPor}</span>
              <span>Actualizado</span>
              <span className="text-right">{auditoria.actualizadoEn ? formatearFecha(auditoria.actualizadoEn) : "—"}</span>
              <span>Actualizado por</span>
              <span className="truncate text-right">{auditoria.actualizadoPor ?? "—"}</span>
            </div>
          )}
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando}
            className={cn(
              "rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90",
              guardando && "opacity-50",
            )}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
