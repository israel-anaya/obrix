import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Plus, RefreshCcw, Star, X } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { iconoDeFamilia } from "@/icons/familias";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listFamiliasInsumo, listMateriales, listProveedores, listUnidadesMedida } from "@/lib/tauri";
import type { FamiliaInsumo, Material, Proveedor, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_FAMILIA_ID = "";
const SIN_SUBFAMILIA_ID = "";
const MAX_MESA = 4;

type Pasillo =
  | { tipo: "todo" }
  | { tipo: "familia"; id: string }
  | { tipo: "subfamilia"; familiaId: string; id: string };

function parsePrecio(s: string | null): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatearDinero(s: string | null): string {
  if (s == null || s === "") return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return `$${s}`;
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

function coincide(m: Material, q: string): boolean {
  if (!q) return true;
  return `${m.clave} ${m.descripcion} ${m.marca ?? ""}`.toLowerCase().includes(q);
}

const FILAS = [
  { id: "descripcion", etiqueta: "Descripción" },
  { id: "unidad", etiqueta: "Unidad" },
  { id: "precio", etiqueta: "Precio vigente" },
  { id: "delta", etiqueta: "Δ vs más barato" },
  { id: "merma", etiqueta: "Merma" },
  { id: "marca", etiqueta: "Marca" },
  { id: "proveedor", etiqueta: "Proveedor" },
  { id: "familia", etiqueta: "Familia" },
  { id: "subfamilia", etiqueta: "Subfamilia" },
] as const;

type FilaId = (typeof FILAS)[number]["id"];

/**
 * Banco de trabajo para decidir entre materiales que se sustituyen entre sí
 * (misma subfamilia, o los que el usuario suba a la mesa). No edita el
 * catálogo: pincha 2–4, mira en qué se apartan, marca el elegido.
 */
export function MesaEquivalentesSeccion() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pasillo, setPasillo] = useState<Pasillo>({ tipo: "todo" });
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [mesaIds, setMesaIds] = useState<string[]>([]);
  const [elegidoId, setElegidoId] = useState<string | null>(null);

  const recargar = () => {
    setError(null);
    listMateriales().then(setMateriales).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
    listProveedores().then(setProveedores).catch((e) => setError(String(e)));
  };

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2800);
    return () => clearTimeout(t);
  }, [aviso]);

  const nombrePorFamiliaId = useMemo(
    () => Object.fromEntries(familias.map((f) => [f.id, f.nombre])),
    [familias],
  );
  const simboloPorUnidadId = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    [unidades],
  );
  const nombrePorProveedorId = useMemo(
    () => Object.fromEntries(proveedores.map((p) => [p.id, p.razon_social])),
    [proveedores],
  );
  const raices = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);

  const q = busqueda.trim().toLowerCase();
  const candidatos = useMemo(() => {
    return materiales.filter((m) => {
      if (!coincide(m, q)) return false;
      if (pasillo.tipo === "familia") return (m.familia_id ?? SIN_FAMILIA_ID) === pasillo.id;
      if (pasillo.tipo === "subfamilia") {
        return (m.familia_id ?? SIN_FAMILIA_ID) === pasillo.familiaId && (m.sub_familia_id ?? SIN_SUBFAMILIA_ID) === pasillo.id;
      }
      return true;
    });
  }, [materiales, q, pasillo]);

  const conteoPorFamilia = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const m of materiales) {
      if (!coincide(m, q)) continue;
      const id = m.familia_id ?? SIN_FAMILIA_ID;
      mapa[id] = (mapa[id] ?? 0) + 1;
    }
    return mapa;
  }, [materiales, q]);

  const conteoPorSubfamilia = useMemo(() => {
    const mapa: Record<string, Record<string, number>> = {};
    for (const m of materiales) {
      if (!coincide(m, q)) continue;
      const fam = m.familia_id ?? SIN_FAMILIA_ID;
      const sub = m.sub_familia_id ?? SIN_SUBFAMILIA_ID;
      const bucket = (mapa[fam] ??= {});
      bucket[sub] = (bucket[sub] ?? 0) + 1;
    }
    return mapa;
  }, [materiales, q]);

  const materialPorId = useMemo(
    () => Object.fromEntries(materiales.map((m) => [m.id, m])),
    [materiales],
  );
  const enMesa = useMemo(
    () => mesaIds.map((id) => materialPorId[id]).filter((m): m is Material => !!m),
    [mesaIds, materialPorId],
  );
  const idsEnMesa = useMemo(() => new Set(mesaIds), [mesaIds]);

  const precios = enMesa.map((m) => parsePrecio(m.precio_vigente)).filter((n) => n > 0);
  const minPrecio = precios.length ? Math.min(...precios) : 0;
  const mermas = enMesa.map((m) => m.merma_porcentaje ?? 0);
  const minMerma = mermas.length ? Math.min(...mermas) : 0;
  const maxMerma = mermas.length ? Math.max(...mermas) : 0;
  const unidadesDistintas = new Set(enMesa.map((m) => m.unidad_id)).size > 1;

  const tituloPasillo = (() => {
    if (pasillo.tipo === "todo") return "Todo el catálogo";
    if (pasillo.tipo === "familia") {
      return pasillo.id ? (nombrePorFamiliaId[pasillo.id] ?? pasillo.id) : "Sin familia";
    }
    const fam = pasillo.familiaId ? (nombrePorFamiliaId[pasillo.familiaId] ?? pasillo.familiaId) : "Sin familia";
    const sub = pasillo.id ? (nombrePorFamiliaId[pasillo.id] ?? pasillo.id) : "Sin subfamilia";
    return `${fam} / ${sub}`;
  })();

  const toggleExpandido = (id: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const subir = (id: string) => {
    if (idsEnMesa.has(id)) return;
    if (mesaIds.length >= MAX_MESA) {
      setAviso(`La mesa admite ${MAX_MESA} materiales. Baja uno para subir otro.`);
      return;
    }
    setMesaIds((prev) => [...prev, id]);
    setAviso(null);
  };

  const bajar = (id: string) => {
    setMesaIds((prev) => prev.filter((x) => x !== id));
    setElegidoId((prev) => (prev === id ? null : prev));
  };

  const traerVisibles = () => {
    const ids = candidatos.slice(0, MAX_MESA).map((m) => m.id);
    if (candidatos.length > MAX_MESA) {
      setAviso(`Hay ${candidatos.length} en el pasillo; se subieron los ${MAX_MESA} primeros. Elige el resto a mano.`);
    } else {
      setAviso(null);
    }
    setMesaIds(ids);
    setElegidoId(null);
  };

  const vaciar = () => {
    setMesaIds([]);
    setElegidoId(null);
  };

  const valor = (m: Material, fila: FilaId): string => {
    switch (fila) {
      case "descripcion":
        return m.descripcion;
      case "unidad":
        return simboloPorUnidadId[m.unidad_id] ?? m.unidad_id;
      case "precio":
        return formatearDinero(m.precio_vigente);
      case "delta": {
        const p = parsePrecio(m.precio_vigente);
        if (p <= 0 || minPrecio <= 0) return "—";
        if (p === minPrecio) return "el más barato";
        const extra = p - minPrecio;
        const pct = (extra / minPrecio) * 100;
        return `+${formatearDinero(String(extra))} (${pct.toFixed(0)}%)`;
      }
      case "merma":
        return `${m.merma_porcentaje ?? 0}%`;
      case "marca":
        return m.marca || "—";
      case "proveedor":
        return m.proveedor_id ? (nombrePorProveedorId[m.proveedor_id] ?? m.proveedor_id) : "—";
      case "familia":
        return m.familia_id ? (nombrePorFamiliaId[m.familia_id] ?? m.familia_id) : "—";
      case "subfamilia":
        return m.sub_familia_id ? (nombrePorFamiliaId[m.sub_familia_id] ?? m.sub_familia_id) : "—";
    }
  };

  const tono = (m: Material, fila: FilaId): "mejor" | "peor" | "alerta" | null => {
    if (enMesa.length < 2) return null;
    if (fila === "precio") {
      const p = parsePrecio(m.precio_vigente);
      if (p <= 0) return "alerta";
      if (p === minPrecio) return "mejor";
      const max = Math.max(...precios);
      if (p === max && max !== minPrecio) return "peor";
    }
    if (fila === "delta") {
      const p = parsePrecio(m.precio_vigente);
      if (p > 0 && p === minPrecio) return "mejor";
      if (p > minPrecio && minPrecio > 0) return "peor";
    }
    if (fila === "merma") {
      const v = m.merma_porcentaje ?? 0;
      if (v === minMerma) return "mejor";
      if (v === maxMerma && maxMerma !== minMerma) return "peor";
    }
    if (fila === "unidad" && unidadesDistintas) return "alerta";
    return null;
  };

  const nodoActivo = (tipo: Pasillo["tipo"], id?: string, familiaId?: string) => {
    if (pasillo.tipo !== tipo) return false;
    if (tipo === "todo") return true;
    if (tipo === "familia" && pasillo.tipo === "familia") return pasillo.id === id;
    if (tipo === "subfamilia" && pasillo.tipo === "subfamilia") {
      return pasillo.id === id && pasillo.familiaId === familiaId;
    }
    return false;
  };

  const sinFamilia = conteoPorFamilia[SIN_FAMILIA_ID] ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">Mesa de equivalentes</h2>
          <p className={cn("truncate text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
            {error ?? aviso ?? `${enMesa.length}/${MAX_MESA} en la mesa · ${tituloPasillo}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              {
                icono: Plus,
                titulo: candidatos.length === 0 ? "Nada que subir en este pasillo" : "Subir visibles a la mesa",
                onClick: traerVisibles,
                disabled: candidatos.length === 0,
              },
              { icono: X, titulo: "Vaciar mesa", onClick: vaciar, disabled: mesaIds.length === 0 },
            ]}
            menu={[{ icono: RefreshCcw, titulo: "Recargar", onClick: recargar }]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel id="mesa-pasillos" defaultSize="18" minSize="14" className="flex min-h-0 flex-col">
            <div className="border-b border-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pasillos
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1">
              <button
                type="button"
                onClick={() => setPasillo({ tipo: "todo" })}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  nodoActivo("todo") && "bg-muted text-foreground",
                )}
              >
                <span>Todo el catálogo</span>
                <span className="num text-[11px]">{materiales.filter((m) => coincide(m, q)).length}</span>
              </button>
              {raices.map((fam) => {
                const n = conteoPorFamilia[fam.id] ?? 0;
                const abierto = expandidos.has(fam.id);
                const hijas = hijasPorPadreId[fam.id] ?? [];
                const sinSub = conteoPorSubfamilia[fam.id]?.[SIN_SUBFAMILIA_ID] ?? 0;
                const IconoFamilia = iconoDeFamilia(fam);
                return (
                  <div key={fam.id}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        title={abierto ? "Contraer" : "Expandir"}
                        onClick={() => toggleExpandido(fam.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPasillo({ tipo: "familia", id: fam.id });
                          setExpandidos((prev) => new Set(prev).add(fam.id));
                        }}
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 py-1 pr-2 text-left text-[13px] text-muted-foreground hover:text-foreground",
                          (nodoActivo("familia", fam.id) ||
                            (pasillo.tipo === "subfamilia" && pasillo.familiaId === fam.id)) &&
                            "text-foreground",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <IconoFamilia size={14} className="shrink-0" />
                          <span className="truncate">{fam.nombre}</span>
                        </span>
                        <span className="num shrink-0 text-[11px]">{n}</span>
                      </button>
                    </div>
                    {abierto && (
                      <div className="mb-0.5 ml-4 border-l border-border">
                        {hijas.map((sub) => {
                          const ns = conteoPorSubfamilia[fam.id]?.[sub.id] ?? 0;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => setPasillo({ tipo: "subfamilia", familiaId: fam.id, id: sub.id })}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 px-2 py-0.5 text-left text-[12px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                                nodoActivo("subfamilia", sub.id, fam.id) && "bg-muted text-foreground",
                              )}
                            >
                              <span className="truncate">{sub.nombre}</span>
                              <span className="num shrink-0 text-[11px]">{ns}</span>
                            </button>
                          );
                        })}
                        {sinSub > 0 && (
                          <button
                            type="button"
                            onClick={() => setPasillo({ tipo: "subfamilia", familiaId: fam.id, id: SIN_SUBFAMILIA_ID })}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 px-2 py-0.5 text-left text-[12px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                              nodoActivo("subfamilia", SIN_SUBFAMILIA_ID, fam.id) && "bg-muted text-foreground",
                            )}
                          >
                            <span className="truncate">Sin subfamilia</span>
                            <span className="num shrink-0 text-[11px]">{sinSub}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {sinFamilia > 0 && (
                <button
                  type="button"
                  onClick={() => setPasillo({ tipo: "familia", id: SIN_FAMILIA_ID })}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    nodoActivo("familia", SIN_FAMILIA_ID) && "bg-muted text-foreground",
                  )}
                >
                  <span>Sin familia</span>
                  <span className="num text-[11px]">{sinFamilia}</span>
                </button>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id="mesa-candidatos" defaultSize="26" minSize="18" className="flex min-h-0 flex-col">
            <div className="border-b border-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Candidatos
            </div>
            <div className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
              {candidatos.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Nada en este pasillo con el filtro actual.</p>
              ) : (
                candidatos.map((m) => {
                  const ya = idsEnMesa.has(m.id);
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex items-start gap-1.5 border-b border-border/70 py-1.5 pl-1.5 pr-2",
                        ya && "bg-muted/40",
                      )}
                    >
                      <button
                        type="button"
                        title={ya ? "Ya está en la mesa" : "Subir a la mesa"}
                        disabled={ya}
                        onClick={() => subir(m.id)}
                        className={cn(
                          "mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                          ya && "opacity-30",
                        )}
                      >
                        {ya ? <Check size={16} /> : <Plus size={16} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-mono text-[11px] font-semibold">{m.clave}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatearDinero(m.precio_vigente)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{m.descripcion}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id="mesa-tablero" defaultSize="56" minSize="36" className="flex min-h-0 min-w-0 flex-col">
            {enMesa.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Sube 2 a {MAX_MESA} materiales para compararlos. Recorre un pasillo (mejor una subfamilia) y
                usa + en cada candidato, o el + de la barra para traer los visibles.
              </p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-2">
                {unidadesDistintas && (
                  <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
                    No comparten unidad: el precio unitario no es comparable tal cual.
                  </p>
                )}
                {enMesa.length === 1 && (
                  <p className="mb-2 text-[11px] text-muted-foreground">Sube al menos otro para ver diferencias.</p>
                )}
                <div
                  className="grid min-w-[480px] text-xs"
                  style={{ gridTemplateColumns: `7.5rem repeat(${enMesa.length}, minmax(9.5rem, 1fr))` }}
                >
                  <div className="sticky top-0 z-10 border-b border-border bg-background p-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Atributo
                  </div>
                  {enMesa.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "sticky top-0 z-10 border-b border-l border-border bg-background p-1.5",
                        elegidoId === m.id && "bg-primary/10",
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="truncate font-mono text-[11px] font-semibold" title={m.clave}>
                          {m.clave}
                        </span>
                        <button
                          type="button"
                          title="Bajar de la mesa"
                          onClick={() => bajar(m.id)}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setElegidoId((prev) => (prev === m.id ? null : m.id))}
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
                          elegidoId === m.id
                            ? "bg-primary/15 text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Star size={16} className={elegidoId === m.id ? "fill-current" : ""} />
                        {elegidoId === m.id ? "Elegido" : "Elegir"}
                      </button>
                    </div>
                  ))}

                  {FILAS.map((fila) => (
                    <div key={fila.id} className="contents">
                      <div className="border-b border-border px-1.5 py-2 text-[11px] text-muted-foreground">
                        {fila.etiqueta}
                      </div>
                      {enMesa.map((m) => {
                        const t = tono(m, fila.id);
                        return (
                          <div
                            key={`${m.id}-${fila.id}`}
                            className={cn(
                              "border-b border-l border-border px-1.5 py-2",
                              t === "mejor" && "bg-emerald-500/10",
                              t === "peor" && "bg-amber-500/10",
                              t === "alerta" && "bg-destructive/10",
                              elegidoId === m.id && t == null && "bg-primary/5",
                            )}
                          >
                            <span className={cn(fila.id === "descripcion" ? "leading-snug" : "num text-left")}>
                              {valor(m, fila.id)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {elegidoId && materialPorId[elegidoId] && (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Elegido: {materialPorId[elegidoId].clave}. La mesa no escribe el catálogo; para usarlo en un
                    concepto, tómala de Materiales.
                  </p>
                )}
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
