import { useEffect, useMemo, useState } from "react";
import { DollarSign, Globe2, MapPinned, Plus, X } from "lucide-react";
import { CurrencyInput } from "@/components/CurrencyInput";
import { BadgeEstadoVigencia } from "@/components/BadgeEstadoVigencia";
import { EnlaceHistorialCompleto } from "@/components/EnlaceHistorialCompleto";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { createPrecioMaterial, listMonedas, listPreciosMaterial, listRegiones, listUsuarios } from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type { Moneda, PrecioMaterial, Region } from "@/lib/types";
import { regionesVisibles } from "@/lib/types";
import { cn } from "@/lib/utils";

const NACIONAL = "Nacional";
// Radix no permite un `SelectItem` con value="" — el region_id nacional (null
// en el backend) necesita un valor propio para poder ofrecerse como opción.
const NACIONAL_VALOR = "__nacional__";

function formatearPrecio(p: PrecioMaterial): string {
  return `$${p.precio} ${p.moneda}`;
}

/** Moneda default cuando el catálogo todavía no cargó o no trae "MXN". */
const MONEDA_FALLBACK = "MXN";

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" (formato de la BD) -> "dd/mm/yy" para mostrar. */
function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  if (!anio || !mes || !dia) return fecha;
  return `${dia}/${mes}/${anio.slice(2)}`;
}

/**
 * Panel: precio vigente + formulario para registrar uno nuevo. Si el padre
 * pasa `onVerHistorialCompleto`, el histórico no se duplica aquí: un enlace
 * abre o cierra la tabla inferior (misma fuente, detalle completo).
 */
export function PreciosMaterialPanel({
  materialId,
  materialClave,
  materialDescripcion,
  onCerrar,
  onPrecioRegistrado,
  onVerHistorialCompleto,
  historialAbierto = false,
}: {
  materialId: string | null;
  materialClave?: string;
  materialDescripcion?: string;
  onCerrar: () => void;
  onPrecioRegistrado?: () => void;
  /** Abre o cierra la tabla inferior — misma fuente, detalle completo. */
  onVerHistorialCompleto?: () => void;
  historialAbierto?: boolean;
}) {
  const { organizaciones, organizacionActivaId } = useOrganizacionActiva();
  const organizacionActiva = organizaciones.find((o) => o.id === organizacionActivaId) ?? null;

  const [precios, setPrecios] = useState<PrecioMaterial[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [monedaSeleccionada, setMonedaSeleccionada] = useState(MONEDA_FALLBACK);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [precioNuevo, setPrecioNuevo] = useState("");
  const [fechaNueva, setFechaNueva] = useState(hoy());
  const [regionNueva, setRegionNueva] = useState(""); // "" = nacional (sin región), el default
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (error) toast({ description: error, variant: "destructive" });
  }, [error]);

  const cargarPrecios = (id: string) => {
    setCargando(true);
    setError(null);
    return listPreciosMaterial(id)
      .then(setPrecios)
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    listRegiones().then(setRegiones).catch(() => {});
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
    listMonedas().then(setMonedas).catch(() => {});
  }, []);

  // Separado del `useEffect` de arriba: `organizacionActiva` normalmente
  // todavía es `null` en el primer render (el contexto la carga async), así
  // que fijar el default una sola vez al montar lo dejaba en el fallback casi
  // siempre. Este efecto reacciona cuando monedas/organización realmente
  // están listas — y también si la organización activa cambia.
  const monedaDefaultOrgId = organizacionActiva?.moneda_default_id ?? null;
  useEffect(() => {
    if (monedas.length === 0) return;
    // El combo arranca en la moneda default de la organización activa si
    // está definida; si no, en MXN si existe en el catálogo; si no, en la
    // primera moneda disponible — el usuario puede cambiarlo después.
    const monedaOrg = monedaDefaultOrgId ? monedas.find((m) => m.id === monedaDefaultOrgId)?.codigo : undefined;
    if (monedaOrg) setMonedaSeleccionada(monedaOrg);
    else if (monedas.some((m) => m.codigo === MONEDA_FALLBACK)) setMonedaSeleccionada(MONEDA_FALLBACK);
    else if (monedas[0]) setMonedaSeleccionada(monedas[0].codigo);
  }, [monedas, monedaDefaultOrgId]);

  // Se espera un momento a que la selección se quede quieta antes de
  // cargar, para que navegar con flechas por el grid no dispare una
  // consulta por cada fila de paso.
  useEffect(() => {
    setFormAbierto(false);
    if (!materialId) {
      setPrecios([]);
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    const espera = setTimeout(() => {
      listPreciosMaterial(materialId)
        .then((r) => {
          if (!cancelado) setPrecios(r);
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
  }, [materialId]);

  const registrarPrecio = async () => {
    if (!materialId) return;
    const numero = Number(precioNuevo);
    if (!Number.isFinite(numero) || numero <= 0) {
      setError("El precio debe ser un número mayor a 0.");
      return;
    }
    if (!fechaNueva) {
      setError("La fecha de vigencia es requerida.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await createPrecioMaterial(materialId, {
        precio: precioNuevo.trim(),
        moneda: monedaSeleccionada,
        region_id: regionNueva || null,
        fecha_vigencia_desde: fechaNueva,
      });
      await cargarPrecios(materialId);
      onPrecioRegistrado?.();
      setFormAbierto(false);
      setPrecioNuevo("");
      setFechaNueva(hoy());
      setRegionNueva("");
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);

  // El combo de moneda filtra tanto lo que se ve (vigentes + histórico) como
  // lo que se configura (el form de "Nuevo precio") — un material puede
  // haber tenido precios registrados en más de una moneda a lo largo del tiempo.
  const preciosMoneda = useMemo(() => precios.filter((p) => p.moneda === monedaSeleccionada), [precios, monedaSeleccionada]);
  const moneda = monedas.find((m) => m.codigo === monedaSeleccionada);

  const historial = useMemo(
    () =>
      [...preciosMoneda].sort((a, b) => {
        const porDesde = b.fecha_vigencia_desde.localeCompare(a.fecha_vigencia_desde);
        if (porDesde !== 0) return porDesde;
        if ((a.fecha_vigencia_hasta === null) !== (b.fecha_vigencia_hasta === null)) {
          return a.fecha_vigencia_hasta === null ? -1 : 1;
        }
        return b.created_at.localeCompare(a.created_at);
      }),
    [preciosMoneda],
  );

  // Puede haber un vigente por región a la vez (más el nacional, sin región,
  // que es el default cuando un proyecto no tiene uno propio) — no es un
  // solo valor, es una lista.
  const vigentes = useMemo(
    () =>
      preciosMoneda
        .filter((p) => p.fecha_vigencia_hasta === null)
        .sort((a, b) => {
          if ((a.region_id === null) !== (b.region_id === null)) return a.region_id === null ? -1 : 1;
          const nombreA = a.region_id ? (nombrePorRegionId[a.region_id] ?? "") : "";
          const nombreB = b.region_id ? (nombrePorRegionId[b.region_id] ?? "") : "";
          return nombreA.localeCompare(nombreB);
        }),
    [preciosMoneda, nombrePorRegionId],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b-2 border-foreground/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <DollarSign size={16} className="text-emerald-500" />
            Precios
          </span>
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        {materialClave && (
          <div className="mt-1">
            <span className="font-mono text-base font-bold tracking-tight">{materialClave}</span>
          </div>
        )}
        {materialDescripcion && <p className="mt-0.5 text-xs text-foreground">{materialDescripcion}</p>}
      </div>

      {!materialId ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona un material para ver sus precios.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <section className="min-h-0 flex-1 overflow-auto border-b border-border p-3">
            <label className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              Moneda
              <Select value={monedaSeleccionada} onValueChange={setMonedaSeleccionada}>
                <SelectTrigger className="rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground">
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
            </label>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Precio vigente
              </h4>
              {!formAbierto && (
                <button
                  type="button"
                  title="Registrar un precio nuevo"
                  onClick={() => setFormAbierto(true)}
                  className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus size={16} />
                  <span className="text-[11px]">Nuevo precio</span>
                </button>
              )}
            </div>

            {formAbierto && (
              <div className="mb-3 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2">
                <div className="flex gap-2">
                  <label className="flex-1 text-[11px] text-muted-foreground">
                    Precio ({monedaSeleccionada})
                    <CurrencyInput
                      autoFocus
                      value={precioNuevo}
                      onCommit={setPrecioNuevo}
                      prefix={moneda?.simbolo ?? "$"}
                      decimals={moneda?.decimales ?? 2}
                      className="mt-0.5 w-full"
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
                      <SelectItem value={NACIONAL_VALOR}>
                        <span className="flex items-center gap-1.5">
                          <Globe2 size={16} className="text-primary" />
                          {NACIONAL} (default)
                        </span>
                      </SelectItem>
                      {ordenarPor(regionesVisibles(regiones), (r) => r.nombre).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          <span className="flex items-center gap-1.5">
                            <MapPinned size={16} className="text-teal-600 dark:text-teal-400" />
                            {r.nombre}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormAbierto(false);
                      setPrecioNuevo("");
                      setRegionNueva("");
                      setError(null);
                    }}
                    className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void registrarPrecio()}
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

            {cargando && precios.length === 0 ? (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : vigentes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {vigentes.map((p) => (
                  <li key={p.id} className="rounded-md border border-border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium">
                        {p.region_id ? (
                          <MapPinned size={16} className="shrink-0 text-teal-600 dark:text-teal-400" />
                        ) : (
                          <Globe2 size={16} className="shrink-0 text-primary" />
                        )}
                        {p.region_id ? (nombrePorRegionId[p.region_id] ?? p.region_id) : NACIONAL}
                      </span>
                      <span className="font-medium">{formatearPrecio(p)}</span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground">Desde {formatearFecha(p.fecha_vigencia_desde)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Sin precio registrado.</p>
            )}
          </section>

          {onVerHistorialCompleto ? (
            <section className="px-3 py-2">
              <EnlaceHistorialCompleto onClick={onVerHistorialCompleto} abierto={historialAbierto} />
            </section>
          ) : (
            <section className="min-h-0 flex-1 overflow-auto p-3">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Histórico de precios ({monedaSeleccionada})
              </h4>
              {historial.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin historial.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Región</th>
                      <th className="py-1 pr-2 text-right font-medium">Precio</th>
                      <th className="py-1 pr-2 font-medium">Usuario</th>
                      <th className="py-1 pr-2 text-right font-medium">Desde</th>
                      <th className="py-1 pr-2 text-right font-medium">Hasta</th>
                      <th className="py-1 text-right font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((p) => {
                      const vigente = p.fecha_vigencia_hasta === null;
                      return (
                        <tr
                          key={p.id}
                          className={cn(
                            "border-b border-border/50 last:border-none",
                            vigente && "bg-emerald-500/5",
                          )}
                        >
                          <td className="py-1 pr-2">
                            <span className="inline-flex items-center gap-1.5">
                              {p.region_id ? (
                                <MapPinned size={16} className="shrink-0 text-teal-600 dark:text-teal-400" />
                              ) : (
                                <Globe2 size={16} className="shrink-0 text-primary" />
                              )}
                              {p.region_id ? (nombrePorRegionId[p.region_id] ?? p.region_id) : NACIONAL}
                            </span>
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">${p.precio}</td>
                          <td className="py-1 pr-2">{nombresPorUsuarioId[p.created_by] ?? p.created_by}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{formatearFecha(p.fecha_vigencia_desde)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
                            {p.fecha_vigencia_hasta === null ? "—" : formatearFecha(p.fecha_vigencia_hasta)}
                          </td>
                          <td className="py-1 text-right">
                            <BadgeEstadoVigencia vigente={vigente} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
