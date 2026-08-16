import { useEffect, useMemo, useState } from "react";
import { DollarSign, Plus, X } from "lucide-react";
import { calcularSalarioConFsr } from "@/lib/calculoFsr";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { createSalarioCategoriaFasar, listFactoresSalarioReal, listRegiones, listSalariosCategoriaFasar, listUsuarios } from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type { FactorSalarioReal, Region, SalarioCategoriaFasar } from "@/lib/types";
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional";
// Radix no permite un `SelectItem` con value="" — el region_id nacional (null
// en el backend) necesita un valor propio para poder ofrecerse como opción.
const NACIONAL_VALOR = "__nacional__";

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" (formato de la BD) -> "dd/mm/yy" para mostrar. */
function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  if (!anio || !mes || !dia) return fecha;
  return `${dia}/${mes}/${anio.slice(2)}`;
}

function fmt(valor: number, decimales = 2): string {
  return valor.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/**
 * Panel: vigencia de salario+FSR vigente + formulario para registrar una
 * nueva arriba, historial completo abajo. Se sincroniza con `categoriaId` —
 * pensado para vivir junto al grid de Categorías FASAR, mostrando las
 * vigencias de la categoría seleccionada en la fila. El FSR (número) y el
 * salario real no los pide el usuario: se calculan aquí mismo, corriendo el
 * modelo de cálculo del FSR elegido con `salario_nominal` = salario base
 * capturado (ver `evaluarModelo`) — el backend solo guarda lo ya calculado,
 * igual que con `precio_material.precio`.
 */
export function SalarioCategoriaFasarPanel({
  categoriaId,
  categoriaClave,
  categoriaDescripcion,
  captura,
  onCerrar,
  onSalarioRegistrado,
}: {
  categoriaId: string | null;
  categoriaClave?: string;
  categoriaDescripcion?: string;
  /** Si `abrir`, abre el alta con esa región (null = nacional). Si no, cierra el alta. Lo usa la matriz oficio×región. */
  captura?: { regionId: string | null; ticket: number; abrir: boolean } | null;
  onCerrar: () => void;
  onSalarioRegistrado?: () => void;
}) {
  const [salarios, setSalarios] = useState<SalarioCategoriaFasar[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [factores, setFactores] = useState<FactorSalarioReal[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [salarioNuevo, setSalarioNuevo] = useState("");
  const [fechaNueva, setFechaNueva] = useState(hoy());
  const [regionNueva, setRegionNueva] = useState(""); // "" = nacional (sin región), el default
  const [factorNuevoId, setFactorNuevoId] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const cargarSalarios = (id: string) => {
    setCargando(true);
    setError(null);
    return listSalariosCategoriaFasar(id)
      .then(setSalarios)
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    listRegiones().then(setRegiones).catch(() => {});
    listFactoresSalarioReal().then(setFactores).catch(() => {});
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  }, []);

  // Igual que en PreciosMaterialPanel: se espera un momento a que la
  // selección se quede quieta antes de cargar, para que navegar con
  // flechas por el grid no dispare una consulta por cada fila de paso.
  useEffect(() => {
    setFormAbierto(false);
    if (!categoriaId) {
      setSalarios([]);
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    const espera = setTimeout(() => {
      listSalariosCategoriaFasar(categoriaId)
        .then((r) => {
          if (!cancelado) setSalarios(r);
        })
        .catch((e) => {
          if (!cancelado) setError(String(e));
        })
        .finally(() => {
          if (!cancelado) setCargando(false);
        });
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [categoriaId]);

  // La matriz manda `captura` al clic de una celda vacía: abre el alta ya
  // apuntando a esa zona, sin pasar por "Nuevo salario".
  useEffect(() => {
    if (!captura || !categoriaId) return;
    if (captura.abrir) {
      setRegionNueva(captura.regionId ?? "");
      setFactorNuevoId("");
      setFormAbierto(true);
    } else {
      setFormAbierto(false);
    }
  }, [captura, categoriaId]);

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);

  // El combo de FSR solo debe ofrecer los que aplican a la región elegida —
  // misma llave que `regionNueva` ("" = nacional, sin región).
  const factoresDeRegion = useMemo(
    () => factores.filter((f) => (f.region_id ?? "") === regionNueva),
    [factores, regionNueva],
  );

  useEffect(() => {
    if (factorNuevoId && !factoresDeRegion.some((f) => f.id === factorNuevoId)) {
      setFactorNuevoId("");
    }
  }, [factoresDeRegion, factorNuevoId]);

  const factorNuevo = factores.find((f) => f.id === factorNuevoId) ?? null;

  const previewCalculo = useMemo((): { fsr: number; salarioReal: number } | { error: string } | null => {
    if (!factorNuevo) return null;
    const numero = Number(salarioNuevo);
    if (!Number.isFinite(numero) || numero <= 0) return null;
    return calcularSalarioConFsr(factorNuevo, numero);
  }, [factorNuevo, salarioNuevo]);

  const registrarSalario = async () => {
    if (!categoriaId) return;
    const numero = Number(salarioNuevo);
    if (!Number.isFinite(numero) || numero <= 0) {
      setError("El salario base debe ser un número mayor a 0.");
      return;
    }
    if (!fechaNueva) {
      setError("La fecha de vigencia es requerida.");
      return;
    }
    if (!factorNuevoId) {
      setError("Elige un Factor de Salario Real.");
      return;
    }
    if (!previewCalculo || "error" in previewCalculo) {
      setError(previewCalculo?.error ?? "No se pudo calcular el FSR con los datos capturados.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await createSalarioCategoriaFasar(categoriaId, {
        salario_base_diario: salarioNuevo.trim(),
        factor_salario_real_id: factorNuevoId,
        factor_salario_real: String(previewCalculo.fsr),
        salario_real_diario: String(previewCalculo.salarioReal),
        region_id: regionNueva || null,
        fecha_vigencia_desde: fechaNueva,
      });
      await cargarSalarios(categoriaId);
      onSalarioRegistrado?.();
      setFormAbierto(false);
      setSalarioNuevo("");
      setFechaNueva(hoy());
      setRegionNueva("");
      setFactorNuevoId("");
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  // Puede haber una vigente por región a la vez (más la nacional, sin
  // región, que es el default cuando un proyecto no tiene una propia).
  const vigentes = useMemo(
    () =>
      salarios
        .filter((s) => s.fecha_vigencia_hasta === null)
        .sort((a, b) => {
          if ((a.region_id === null) !== (b.region_id === null)) return a.region_id === null ? -1 : 1;
          const nombreA = a.region_id ? (nombrePorRegionId[a.region_id] ?? "") : "";
          const nombreB = b.region_id ? (nombrePorRegionId[b.region_id] ?? "") : "";
          return nombreA.localeCompare(nombreB);
        }),
    [salarios, nombrePorRegionId],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b-2 border-foreground/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <DollarSign size={11} className="text-emerald-500" />
            Salario
          </span>
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
        {categoriaClave && (
          <div className="mt-1">
            <span className="font-mono text-base font-bold tracking-tight">{categoriaClave}</span>
          </div>
        )}
        {categoriaDescripcion && <p className="mt-0.5 text-xs text-foreground">{categoriaDescripcion}</p>}
      </div>

      {!categoriaId ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona una categoría para ver sus salarios.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <section className="border-b border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Salario vigente
              </h4>
              {!formAbierto && (
                <button
                  type="button"
                  title="Registrar una vigencia nueva"
                  onClick={() => setFormAbierto(true)}
                  className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus size={13} />
                  <span className="text-[11px]">Nuevo salario</span>
                </button>
              )}
            </div>

            {formAbierto && (
              <div className="mb-3 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2">
                <div className="flex gap-2">
                  <label className="flex-1 text-[11px] text-muted-foreground">
                    Salario base diario
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      autoFocus
                      value={salarioNuevo}
                      onChange={(e) => setSalarioNuevo(e.target.value)}
                      className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
                    />
                  </label>
                  <label className="flex-1 text-[11px] text-muted-foreground">
                    Vigente desde
                    <input
                      type="date"
                      value={fechaNueva}
                      onChange={(e) => setFechaNueva(e.target.value)}
                      className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
                    />
                  </label>
                </div>
                <label className="text-[11px] text-muted-foreground">
                  Región
                  <Select
                    value={regionNueva || NACIONAL_VALOR}
                    onValueChange={(v) => setRegionNueva(v === NACIONAL_VALOR ? "" : v)}
                  >
                    <SelectTrigger className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-xs">
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
                </label>
                <label className="text-[11px] text-muted-foreground">
                  Factor de Salario Real
                  <Select value={factorNuevoId} onValueChange={setFactorNuevoId}>
                    <SelectTrigger className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-xs">
                      <SelectValue placeholder="— Elige un FSR —" />
                    </SelectTrigger>
                    <SelectContent>
                      {ordenarPor(factoresDeRegion, (f) => f.nombre).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nombre} ({f.region_id ? (nombrePorRegionId[f.region_id] ?? f.region_id) : NACIONAL})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {factoresDeRegion.length === 0 && (
                    <p className="mt-0.5 text-[11px] text-destructive">
                      No hay un FSR para {regionNueva ? (nombrePorRegionId[regionNueva] ?? regionNueva) : NACIONAL}.
                    </p>
                  )}
                </label>

                {previewCalculo &&
                  (("error" in previewCalculo) ? (
                    <p className="text-[11px] text-destructive">{previewCalculo.error}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      FSR calculado: <span className="font-medium text-foreground">{fmt(previewCalculo.fsr, 6)}</span> · Salario
                      real: <span className="font-medium text-foreground">${fmt(previewCalculo.salarioReal)}</span>
                    </p>
                  ))}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormAbierto(false);
                      setSalarioNuevo("");
                      setRegionNueva("");
                      setFactorNuevoId("");
                      setError(null);
                    }}
                    className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void registrarSalario()}
                    disabled={guardando}
                    className={cn(
                      "rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90",
                      guardando && "opacity-50",
                    )}
                  >
                    {guardando ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            )}

            {cargando && salarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : vigentes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {vigentes.map((s) => (
                  <li key={s.id} className="rounded-md border border-border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {s.region_id ? (nombrePorRegionId[s.region_id] ?? s.region_id) : NACIONAL}
                      </span>
                      <span className="font-medium">${s.salario_real_diario}</span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      Base ${s.salario_base_diario} × FSR {s.factor_salario_real}
                    </div>
                    <div className="mt-0.5 text-muted-foreground">Desde {formatearFecha(s.fecha_vigencia_desde)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Sin salario registrado.</p>
            )}
          </section>

          <section className="min-h-0 flex-1 overflow-auto p-3">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Histórico de salarios
            </h4>
            {salarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin historial.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Región</th>
                    <th className="py-1 pr-2 text-right font-medium">Salario real</th>
                    <th className="py-1 pr-2 font-medium">Usuario</th>
                    <th className="py-1 pr-2 text-right font-medium">Desde</th>
                    <th className="py-1 text-right font-medium">Hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {salarios.map((s) => (
                    <tr key={s.id} className="border-b border-border/50 last:border-none">
                      <td className="py-1 pr-2">{s.region_id ? (nombrePorRegionId[s.region_id] ?? s.region_id) : NACIONAL}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">${s.salario_real_diario}</td>
                      <td className="py-1 pr-2">{nombresPorUsuarioId[s.created_by] ?? s.created_by}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{formatearFecha(s.fecha_vigencia_desde)}</td>
                      <td className="py-1 text-right tabular-nums text-muted-foreground">
                        {s.fecha_vigencia_hasta ? formatearFecha(s.fecha_vigencia_hasta) : "vigente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
