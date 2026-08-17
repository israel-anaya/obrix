import { Plus, Trash2 } from "lucide-react";
import { CAMPO_INPUT_CLASE } from "@/components/Campo";
import { Button } from "@/components/ui/button";
import { validarRango } from "@/lib/modeloCalculo";
import type { RangoRenglon } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Editor genérico de una variable tipo "rango" — usado tanto para definir el default (`ModeloCalculoPage`) como para capturar sus valores por configuración (`CalcularFsrPage`). */
export function RangoEditor({ renglones, onCambiar }: { renglones: RangoRenglon[]; onCambiar: (renglones: RangoRenglon[]) => void }) {
  const error = validarRango(renglones);
  const actualizar = (i: number, patch: Partial<RangoRenglon>) =>
    onCambiar(renglones.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const eliminar = (i: number) => onCambiar(renglones.filter((_, idx) => idx !== i));
  const agregar = () => onCambiar([...renglones, { clasificacion: "", inferior: 0, superior: null, valor: 0 }]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_2rem] items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>Clasificación</span>
        <span>Inferior</span>
        <span>Superior</span>
        <span>Valor</span>
        <span />
      </div>
      {renglones.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_2rem] items-center gap-2">
          <input
            className={cn(CAMPO_INPUT_CLASE, "mt-0")}
            value={r.clasificacion}
            onChange={(ev) => actualizar(i, { clasificacion: ev.target.value })}
            placeholder="ej. 1.51 a 2.00 UMA"
          />
          <input
            className={cn(CAMPO_INPUT_CLASE, "mt-0 campo-decimal")}
            type="number"
            step="any"
            value={r.inferior}
            onChange={(ev) => actualizar(i, { inferior: Number(ev.target.value) })}
          />
          <input
            className={cn(CAMPO_INPUT_CLASE, "mt-0 campo-decimal")}
            type="number"
            step="any"
            value={r.superior ?? ""}
            placeholder="sin límite"
            onChange={(ev) => actualizar(i, { superior: ev.target.value === "" ? null : Number(ev.target.value) })}
          />
          <input
            className={cn(CAMPO_INPUT_CLASE, "mt-0 campo-decimal")}
            type="number"
            step="0.00001"
            value={r.valor}
            onChange={(ev) => actualizar(i, { valor: Number(ev.target.value) })}
          />
          <Button variant="ghost" size="icon-sm" onClick={() => eliminar(i)} title="Eliminar renglón">
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={agregar}>
          <Plus size={16} /> Agregar renglón
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
