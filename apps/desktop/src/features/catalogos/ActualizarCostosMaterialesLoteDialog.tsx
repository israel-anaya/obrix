import { useEffect, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FilaCostoMaterial } from "@/lib/csvPrecioMaterial";
import { createPreciosMaterialLote, listMonedas, listRegiones } from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type { Moneda, PrecioLoteItem, Region } from "@/lib/types";
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional";
const MONEDA_FALLBACK = "MXN";
// Radix no permite un `SelectItem` con value="" — el region_id nacional (null
// en el backend) necesita un valor propio para poder ofrecerse como opción.
const NACIONAL_VALOR = "__nacional__";

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface EstadoActualizacionLoteMateriales {
  /** Filas que sí matchearon contra el catálogo — las únicas que se actualizan. */
  filas: FilaCostoMaterial[];
  /** Descripciones del CSV que no existen en el catálogo — se avisan al terminar, no bloquean. */
  materialesNoRegistrados: string[];
  /** Otros problemas por fila (costo inválido, duplicados, vacíos) — tampoco bloquean. */
  errores: string[];
}

/**
 * A diferencia de "Actualizar salarios en lote" (que exige match al 100%),
 * aquí se actualiza lo que sí matchea y el resto (no registrados o con
 * problemas de formato) se reporta al terminar — no bloquea el lote.
 */
export function ActualizarCostosMaterialesLoteDialog({
  estado,
  onCerrar,
  onAplicado,
  onProgreso,
}: {
  estado: EstadoActualizacionLoteMateriales | null;
  onCerrar: () => void;
  onAplicado: (resultado: { mensaje: string; noEncontrados: string[] }) => void;
  onProgreso?: (mensaje: string | null) => void;
}) {
  const abierto = estado !== null;
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [regionId, setRegionId] = useState("");
  const [moneda, setMoneda] = useState(MONEDA_FALLBACK);
  const [fechaVigencia, setFechaVigencia] = useState(hoy());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setRegionId("");
    setFechaVigencia(hoy());
    setError(null);
    setGuardando(false);
    listRegiones().then(setRegiones).catch((e) => setError(String(e)));
    listMonedas()
      .then((lista) => {
        setMonedas(lista);
        if (lista.some((m) => m.codigo === MONEDA_FALLBACK)) setMoneda(MONEDA_FALLBACK);
        else if (lista[0]) setMoneda(lista[0].codigo);
      })
      .catch((e) => setError(String(e)));
  }, [abierto]);

  const aplicar = async () => {
    if (!estado || estado.filas.length === 0) return;
    if (!moneda) {
      setError("Elige una moneda.");
      return;
    }
    if (!fechaVigencia) {
      setError("La fecha de vigencia es requerida.");
      return;
    }

    const items: PrecioLoteItem[] = estado.filas.map((fila) => ({
      material_id: fila.materialId,
      precio: String(fila.costo),
      moneda,
      region_id: regionId || null,
      fecha_vigencia_desde: fechaVigencia,
    }));

    setGuardando(true);
    setError(null);
    onProgreso?.("Actualizando costos…");
    try {
      await createPreciosMaterialLote(items);
      onAplicado({
        mensaje: `Se actualizaron ${items.length} costos.`,
        noEncontrados: estado.materialesNoRegistrados,
      });
      onCerrar();
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
      onProgreso?.(null);
    }
  };

  const hayProblemas = !!estado && (estado.materialesNoRegistrados.length > 0 || estado.errores.length > 0);
  const nada = !!estado && estado.filas.length === 0;

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v && !guardando) onCerrar(); }}>
      <DialogContent className="max-w-lg" showCloseButton={!guardando}>
        <DialogHeader>
          <DialogTitle>Actualizar costos en lote</DialogTitle>
          <DialogDescription>
            {nada
              ? "Ningún material del archivo coincide con el catálogo."
              : `Se actualizarán ${estado?.filas.length ?? 0} materiales. Elige la moneda y la región.`}
          </DialogDescription>
        </DialogHeader>

        {hayProblemas && estado && (
          <div className="flex max-h-64 flex-col gap-3 overflow-auto text-xs">
            {estado.materialesNoRegistrados.length > 0 && (
              <div>
                <p className="font-medium text-amber-600">
                  Estos materiales no están registrados en el catálogo y no se actualizarán:
                </p>
                <ul className="mt-1 list-disc pl-4 text-foreground">
                  {estado.materialesNoRegistrados.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {estado.errores.length > 0 && (
              <div>
                <p className="font-medium text-amber-600">Otras filas con problemas (se omiten):</p>
                <ul className="mt-1 list-disc pl-4 text-foreground">
                  {estado.errores.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!nada && (
          <div className="flex flex-col gap-2">
            <Campo label="Moneda">
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger className={CAMPO_INPUT_CLASE}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monedas.length === 0 && <SelectItem value={MONEDA_FALLBACK}>{MONEDA_FALLBACK}</SelectItem>}
                  {ordenarPor(monedas, (m) => m.codigo).map((m) => (
                    <SelectItem key={m.id} value={m.codigo}>
                      {m.codigo} — {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Región">
              <Select value={regionId || NACIONAL_VALOR} onValueChange={(v) => setRegionId(v === NACIONAL_VALOR ? "" : v)}>
                <SelectTrigger className={CAMPO_INPUT_CLASE}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NACIONAL_VALOR}>{NACIONAL} (default)</SelectItem>
                  {ordenarPor(regiones, (r) => r.nombre).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            {nada ? "Cerrar" : "Cancelar"}
          </Button>
          {!nada && (
            <Button
              size="sm"
              onClick={() => void aplicar()}
              disabled={guardando || !moneda}
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
