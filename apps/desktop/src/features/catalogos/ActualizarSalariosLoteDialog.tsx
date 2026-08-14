import { useEffect, useMemo, useState } from "react";
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calcularSalarioConFsr } from "@/lib/calculoFsr";
import type { FilaSalarioNominal } from "@/lib/csvSalarioNominal";
import { createSalariosCategoriaFasarLote, listFactoresSalarioReal, listRegiones } from "@/lib/tauri";
import type { FactorSalarioReal, Region, SalarioLoteItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional";

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export type EstadoActualizacionLote =
  | { tipo: "invalido"; categoriasNoRegistradas: string[]; errores: string[] }
  | { tipo: "listo"; filas: FilaSalarioNominal[] };

/**
 * Tras elegir el CSV: o bien lista las categorías que no están en el
 * tabulador (y no deja seguir), o pide región + FSR para registrar las
 * vigencias en lote.
 */
export function ActualizarSalariosLoteDialog({
  estado,
  onCerrar,
  onAplicado,
}: {
  estado: EstadoActualizacionLote | null;
  onCerrar: () => void;
  onAplicado: (mensaje: string) => void;
}) {
  const abierto = estado !== null;
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [factores, setFactores] = useState<FactorSalarioReal[]>([]);
  const [regionId, setRegionId] = useState("");
  const [factorId, setFactorId] = useState("");
  const [fechaVigencia, setFechaVigencia] = useState(hoy());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setRegionId("");
    setFactorId("");
    setFechaVigencia(hoy());
    setError(null);
    setGuardando(false);
    listRegiones().then(setRegiones).catch((e) => setError(String(e)));
    listFactoresSalarioReal().then(setFactores).catch((e) => setError(String(e)));
  }, [abierto]);

  const factoresDeRegion = useMemo(
    () => factores.filter((f) => (f.region_id ?? "") === regionId),
    [factores, regionId],
  );

  useEffect(() => {
    if (factorId && !factoresDeRegion.some((f) => f.id === factorId)) {
      setFactorId("");
    }
  }, [factoresDeRegion, factorId]);

  const nombrePorRegionId = useMemo(
    () => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])),
    [regiones],
  );

  const aplicar = async () => {
    if (estado?.tipo !== "listo") return;
    if (!factorId) {
      setError("Elige un Factor de Salario Real.");
      return;
    }
    if (!fechaVigencia) {
      setError("La fecha de vigencia es requerida.");
      return;
    }
    const factor = factores.find((f) => f.id === factorId);
    if (!factor) {
      setError("El FSR elegido ya no está disponible.");
      return;
    }

    const items: SalarioLoteItem[] = [];
    for (const fila of estado.filas) {
      const calc = calcularSalarioConFsr(factor, fila.salarioNominal);
      if ("error" in calc) {
        setError(`No se pudo calcular el FSR para "${fila.categoria}": ${calc.error}`);
        return;
      }
      items.push({
        insumo_id: fila.insumoId,
        salario_base_diario: String(fila.salarioNominal),
        factor_salario_real_id: factor.id,
        factor_salario_real: String(calc.fsr),
        salario_real_diario: String(calc.salarioReal),
        region_id: regionId || null,
        fecha_vigencia_desde: fechaVigencia,
      });
    }

    setGuardando(true);
    setError(null);
    try {
      await createSalariosCategoriaFasarLote(items);
      onAplicado(`Se actualizaron ${items.length} salarios.`);
      onCerrar();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const invalido = estado?.tipo === "invalido" ? estado : null;
  const listo = estado?.tipo === "listo" ? estado : null;

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v && !guardando) onCerrar(); }}>
      <DialogContent className="max-w-lg" showCloseButton={!guardando}>
        <DialogHeader>
          <DialogTitle>Actualizar salarios en lote</DialogTitle>
          <DialogDescription>
            {invalido
              ? "El archivo no hace match al 100% con el tabulador. Corrige el CSV para continuar."
              : `Se actualizarán ${listo?.filas.length ?? 0} categorías. Elige la región y el FSR.`}
          </DialogDescription>
        </DialogHeader>

        {invalido && (
          <div className="flex max-h-80 flex-col gap-3 overflow-auto text-xs">
            {invalido.categoriasNoRegistradas.length > 0 && (
              <div>
                <p className="font-medium text-destructive">
                  Estas categorías no están registradas en el sistema:
                </p>
                <ul className="mt-1 list-disc pl-4 text-foreground">
                  {invalido.categoriasNoRegistradas.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {invalido.errores.length > 0 && (
              <div>
                <p className="font-medium text-destructive">Otros problemas:</p>
                <ul className="mt-1 list-disc pl-4 text-foreground">
                  {invalido.errores.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {listo && (
          <div className="flex flex-col gap-2">
            <Campo label="Región">
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className={CAMPO_INPUT_CLASE}
              >
                <option value="">{NACIONAL} (default)</option>
                {regiones.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Factor de Salario Real">
              <select
                value={factorId}
                onChange={(e) => setFactorId(e.target.value)}
                className={CAMPO_INPUT_CLASE}
              >
                <option value="">— Elige un FSR —</option>
                {factoresDeRegion.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre} ({f.region_id ? (nombrePorRegionId[f.region_id] ?? f.region_id) : NACIONAL})
                  </option>
                ))}
              </select>
              {factoresDeRegion.length === 0 && (
                <p className="mt-0.5 text-[11px] text-destructive">
                  No hay un FSR para {regionId ? (nombrePorRegionId[regionId] ?? regionId) : NACIONAL}.
                </p>
              )}
            </Campo>
            <Campo label="Vigente desde">
              <input
                type="date"
                value={fechaVigencia}
                onChange={(e) => setFechaVigencia(e.target.value)}
                className={CAMPO_INPUT_CLASE}
              />
            </Campo>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCerrar} disabled={guardando}>
            {invalido ? "Cerrar" : "Cancelar"}
          </Button>
          {listo && (
            <Button
              size="sm"
              onClick={() => void aplicar()}
              disabled={guardando || !factorId}
              className={cn(guardando && "opacity-50")}
            >
              {guardando ? "Actualizando…" : "Actualizar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
