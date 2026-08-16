import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, RefreshCcw } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listFamiliasInsumo, listMateriales, listProveedores, listUnidadesMedida } from "@/lib/tauri";
import type { FamiliaInsumo, Material, Proveedor, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_FAMILIA = "Sin familia";
const SIN_SUBFAMILIA = "Sin subfamilia";
const MERMA_ALTA = 10;

const CX = 400;
const CY = 400;
const R_NUCLEO = 68;
const R_SIN_PRECIO = 88;
const R_MIN = 108;
const R_MAX = 328;
const R_ETIQUETA = 362;
const R_SECTOR_IN = 78;
const R_SECTOR_OUT = 348;

const PALETA = [
  { h: 234, s: 72 },
  { h: 172, s: 52 },
  { h: 32, s: 70 },
  { h: 280, s: 48 },
  { h: 350, s: 58 },
  { h: 200, s: 55 },
  { h: 82, s: 42 },
  { h: 18, s: 68 },
  { h: 250, s: 42 },
  { h: 145, s: 48 },
];

type FiltroRapido = "todos" | "sin-precio" | "merma-alta";
type EscalaRadio = "log" | "lin";

interface Sector {
  id: string;
  nombre: string;
  colorIndex: number;
  start: number;
  span: number;
}

interface Punto {
  material: Material;
  precio: number;
  merma: number;
  sectorId: string;
  colorIndex: number;
  angulo: number;
  radio: number;
  x: number;
  y: number;
  r: number;
}

function parsePrecio(s: string | null): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatearDinero(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

function formatearAnillo(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toLocaleString("es-MX", { maximumFractionDigits: n % 1000 === 0 ? 0 : 1 })}k`;
  return `$${n.toLocaleString("es-MX")}`;
}

function colorDe(index: number, alpha = 0.88): string {
  const { h, s } = PALETA[index % PALETA.length];
  return `hsl(${h} ${s}% 48% / ${alpha})`;
}

function veloDe(index: number): string {
  const { h, s } = PALETA[index % PALETA.length];
  return `hsl(${h} ${s}% 50% / 0.11)`;
}

function radioDePrecio(precio: number, maxPrecio: number, escala: EscalaRadio): number {
  if (precio <= 0 || maxPrecio <= 0) return R_SIN_PRECIO;
  const t =
    escala === "log"
      ? Math.log1p(precio) / Math.log1p(maxPrecio)
      : precio / maxPrecio;
  return R_MIN + Math.min(1, Math.max(0, t)) * (R_MAX - R_MIN);
}

function radioDeMerma(merma: number): number {
  return 3.6 + Math.min(100, Math.max(0, merma)) * 0.11;
}

function polar(angulo: number, radio: number): { x: number; y: number } {
  return { x: CX + Math.cos(angulo) * radio, y: CY + Math.sin(angulo) * radio };
}

/** Anillo de dona entre `rIn` y `rOut` que cubre `[start, start+span)`. */
function pathSector(rIn: number, rOut: number, start: number, span: number): string {
  const end = start + span;
  const large = span > Math.PI ? 1 : 0;
  const a = polar(start, rOut);
  const b = polar(end, rOut);
  const c = polar(end, rIn);
  const d = polar(start, rIn);
  // En SVG, y crece hacia abajo: θ creciente recorre el reloj — sweep=1.
  return `M ${a.x} ${a.y} A ${rOut} ${rOut} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${rIn} ${rIn} 0 ${large} 0 ${d.x} ${d.y} Z`;
}

function coincideBusqueda(m: Material, q: string): boolean {
  if (!q) return true;
  const hay = `${m.clave} ${m.descripcion} ${m.marca ?? ""}`.toLowerCase();
  return hay.includes(q);
}

/**
 * Vista espacial del catálogo de materiales: un radar polar donde el ángulo
 * es la familia (o subfamilia al entrar), la distancia al centro es el precio
 * unitario y el tamaño del punto es la merma. No edita nada — el grid de
 * Materiales sigue siendo la vista de captura.
 */
export function RadarMaterialesSeccion() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroRapido>("todos");
  const [escala, setEscala] = useState<EscalaRadio>("log");
  const [familiaId, setFamiliaId] = useState<string | null>(null);
  const [subFamiliaId, setSubFamiliaId] = useState<string | null>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSeleccionadoId(null);
        setHoverId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return materiales.filter((m) => {
      if (!coincideBusqueda(m, q)) return false;
      if (filtro === "sin-precio" && parsePrecio(m.precio_vigente) > 0) return false;
      if (filtro === "merma-alta" && (m.merma_porcentaje ?? 0) < MERMA_ALTA) return false;
      // `null` = todo el catálogo; `""` = materiales sin familia/subfamilia.
      if (familiaId !== null && (m.familia_id ?? "") !== familiaId) return false;
      if (subFamiliaId !== null && (m.sub_familia_id ?? "") !== subFamiliaId) return false;
      return true;
    });
  }, [materiales, busqueda, filtro, familiaId, subFamiliaId]);

  const colorIndexPorSectorId = useMemo(() => {
    const mapa: Record<string, number> = {};
    raices.forEach((f, i) => {
      mapa[f.id] = i;
    });
    mapa[""] = raices.length;
    return mapa;
  }, [raices]);

  // Sectores del anillo: familias en la vista raíz, subfamilias al entrar.
  const sectores = useMemo((): Sector[] => {
    const grupos = new Map<string, { nombre: string; colorIndex: number; n: number }>();
    const registrar = (id: string, nombre: string, colorIndex: number) => {
      const g = grupos.get(id) ?? { nombre, colorIndex, n: 0 };
      g.n += 1;
      grupos.set(id, g);
    };

    if (familiaId === null) {
      for (const m of visibles) {
        const id = m.familia_id ?? "";
        registrar(id, id ? (nombrePorFamiliaId[id] ?? id) : SIN_FAMILIA, colorIndexPorSectorId[id] ?? 0);
      }
    } else {
      const colorIndex = colorIndexPorSectorId[familiaId] ?? 0;
      for (const m of visibles) {
        const id = m.sub_familia_id ?? "";
        registrar(id, id ? (nombrePorFamiliaId[id] ?? id) : SIN_SUBFAMILIA, colorIndex);
      }
    }

    const orden = [...grupos.entries()].sort((a, b) => b[1].n - a[1].n);
    const total = orden.reduce((s, [, g]) => s + g.n, 0) || 1;
    // Hueco mínimo entre sectores para que se lean como "rebanadas" de radar.
    const gap = orden.length > 1 ? 0.018 : 0;
    const usable = Math.PI * 2 - gap * orden.length;
    let cursor = -Math.PI / 2;
    return orden.map(([id, g]) => {
      const span = (g.n / total) * usable;
      const sector: Sector = { id, nombre: g.nombre, colorIndex: g.colorIndex, start: cursor, span };
      cursor += span + gap;
      return sector;
    });
  }, [visibles, familiaId, nombrePorFamiliaId, colorIndexPorSectorId]);

  const maxPrecio = useMemo(() => {
    let max = 0;
    for (const m of visibles) max = Math.max(max, parsePrecio(m.precio_vigente));
    return max;
  }, [visibles]);

  const puntos = useMemo((): Punto[] => {
    const porSector = new Map<string, Material[]>();
    for (const m of visibles) {
      const id = familiaId !== null ? (m.sub_familia_id ?? "") : (m.familia_id ?? "");
      (porSector.get(id) ?? porSector.set(id, []).get(id)!).push(m);
    }
    const sectorPorId = Object.fromEntries(sectores.map((s) => [s.id, s]));
    const out: Punto[] = [];
    for (const [id, lista] of porSector) {
      const sector = sectorPorId[id];
      if (!sector) continue;
      const pad = Math.min(sector.span * 0.12, 0.08);
      const usable = Math.max(sector.span - pad * 2, sector.span * 0.55);
      const ordenados = [...lista].sort((a, b) => parsePrecio(a.precio_vigente) - parsePrecio(b.precio_vigente));
      ordenados.forEach((material, i) => {
        const t = ordenados.length === 1 ? 0.5 : (i + 0.5) / ordenados.length;
        const angulo = sector.start + pad + t * usable;
        const precio = parsePrecio(material.precio_vigente);
        const merma = material.merma_porcentaje ?? 0;
        const radio = radioDePrecio(precio, maxPrecio, escala);
        const { x, y } = polar(angulo, radio);
        out.push({
          material,
          precio,
          merma,
          sectorId: id,
          colorIndex: sector.colorIndex,
          angulo,
          radio,
          x,
          y,
          r: radioDeMerma(merma),
        });
      });
    }
    return out;
  }, [visibles, sectores, familiaId, maxPrecio, escala]);

  const anillos = useMemo(() => {
    if (maxPrecio <= 0) return [];
    const candidatos = [1, 10, 100, 1000, 10000, 100000];
    return candidatos.filter((n) => n < maxPrecio * 0.98).map((n) => ({
      n,
      r: radioDePrecio(n, maxPrecio, escala),
    }));
  }, [maxPrecio, escala]);

  const kpis = useMemo(() => {
    const n = materiales.length;
    const conPrecio = materiales.filter((m) => parsePrecio(m.precio_vigente) > 0);
    const suma = conPrecio.reduce((s, m) => s + parsePrecio(m.precio_vigente), 0);
    return {
      n,
      familias: new Set(materiales.map((m) => m.familia_id).filter(Boolean)).size,
      sinPrecio: n - conPrecio.length,
      mermaAlta: materiales.filter((m) => (m.merma_porcentaje ?? 0) >= MERMA_ALTA).length,
      promedio: conPrecio.length ? suma / conPrecio.length : 0,
    };
  }, [materiales]);

  const conteoPorFamilia = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const m of materiales) {
      if (!coincideBusqueda(m, busqueda.trim().toLowerCase())) continue;
      const id = m.familia_id ?? "";
      mapa[id] = (mapa[id] ?? 0) + 1;
    }
    return mapa;
  }, [materiales, busqueda]);

  const conteoPorSubfamilia = useMemo(() => {
    if (familiaId === null) return {} as Record<string, number>;
    const mapa: Record<string, number> = {};
    for (const m of materiales) {
      if (m.familia_id !== familiaId) continue;
      if (!coincideBusqueda(m, busqueda.trim().toLowerCase())) continue;
      const id = m.sub_familia_id ?? "";
      mapa[id] = (mapa[id] ?? 0) + 1;
    }
    return mapa;
  }, [materiales, familiaId, busqueda]);

  const puntoPorId = useMemo(
    () => Object.fromEntries(puntos.map((p) => [p.material.id, p])),
    [puntos],
  );
  const hover = hoverId ? puntoPorId[hoverId] : undefined;
  const seleccionado = seleccionadoId ? puntos.find((p) => p.material.id === seleccionadoId) : undefined;
  const lente = hover ?? seleccionado;

  const rankingPrecio = useMemo(() => {
    const conPrecio = materiales
      .map((m) => ({ id: m.id, precio: parsePrecio(m.precio_vigente) }))
      .filter((m) => m.precio > 0)
      .sort((a, b) => b.precio - a.precio);
    const posPorId = Object.fromEntries(conPrecio.map((m, i) => [m.id, i]));
    return { total: conPrecio.length, posPorId };
  }, [materiales]);

  const entrarSector = (id: string) => {
    if (familiaId === null) {
      setFamiliaId(id);
      setSubFamiliaId(null);
      setSeleccionadoId(null);
      return;
    }
    setSubFamiliaId(id);
    setSeleccionadoId(null);
  };

  const materialLente = lente?.material ?? (seleccionadoId ? materiales.find((m) => m.id === seleccionadoId) : undefined);
  const ficha = materialLente ?? null;
  const puntoFicha = ficha ? puntoPorId[ficha.id] : undefined;

  const itemsFamilia = useMemo(() => {
    const lista = raices.map((f) => ({ id: f.id, nombre: f.nombre, n: conteoPorFamilia[f.id] ?? 0 }));
    const sin = conteoPorFamilia[""] ?? 0;
    if (sin > 0) lista.push({ id: "", nombre: SIN_FAMILIA, n: sin });
    return lista.filter((f) => f.n > 0).sort((a, b) => b.n - a.n);
  }, [raices, conteoPorFamilia]);

  const itemsSubfamilia = useMemo(() => {
    if (familiaId === null) return [];
    const hijas = hijasPorPadreId[familiaId] ?? [];
    const lista = hijas.map((f) => ({ id: f.id, nombre: f.nombre, n: conteoPorSubfamilia[f.id] ?? 0 }));
    const sin = conteoPorSubfamilia[""] ?? 0;
    if (sin > 0) lista.push({ id: "", nombre: SIN_SUBFAMILIA, n: sin });
    return lista.filter((f) => f.n > 0).sort((a, b) => b.n - a.n);
  }, [familiaId, hijasPorPadreId, conteoPorSubfamilia]);

  const enRaiz = familiaId === null;
  const maxConteoLista = Math.max(1, ...(enRaiz ? itemsFamilia : itemsSubfamilia).map((i) => i.n));

  const percentilTexto = (id: string, precio: number): string | null => {
    if (precio <= 0 || rankingPrecio.total === 0) return "Sin precio vigente — órbita interior";
    const pos = rankingPrecio.posPorId[id];
    if (pos == null) return null;
    const pct = Math.round(((pos + 1) / rankingPrecio.total) * 100);
    if (pct <= 10) return `Anillo exterior — entre el ${pct}% más caro del catálogo`;
    if (pct >= 80) return `Anillo interior — entre el ${100 - pct + 1}% más barato`;
    return `Percentil ${pct} de precio del catálogo`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">Radar de costos</h2>
          <p className={cn("truncate text-xs font-medium", error ? "text-destructive" : "text-muted-foreground")}>
            {error ?? "Ángulo = familia · distancia = precio · tamaño = merma"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Buscador value={busqueda} onChange={setBusqueda} />
          <BarraAcciones acciones={[{ icono: RefreshCcw, titulo: "Recargar", onClick: recargar }]} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
        <FiltroPill activo={filtro === "todos"} onClick={() => setFiltro("todos")}>
          {kpis.n} materiales
        </FiltroPill>
        <FiltroPill activo={false} muted>
          {kpis.familias} familias
        </FiltroPill>
        <FiltroPill activo={filtro === "sin-precio"} onClick={() => setFiltro(filtro === "sin-precio" ? "todos" : "sin-precio")}>
          {kpis.sinPrecio} sin precio
        </FiltroPill>
        <FiltroPill activo={filtro === "merma-alta"} onClick={() => setFiltro(filtro === "merma-alta" ? "todos" : "merma-alta")}>
          {kpis.mermaAlta} merma ≥{MERMA_ALTA}%
        </FiltroPill>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Promedio {formatearDinero(kpis.promedio)}</span>
          <span className="text-border">|</span>
          <span>Escala</span>
          <button
            type="button"
            onClick={() => setEscala("log")}
            className={cn("rounded px-1.5 py-0.5", escala === "log" ? "bg-muted text-foreground" : "hover:text-foreground")}
          >
            log
          </button>
          <button
            type="button"
            onClick={() => setEscala("lin")}
            className={cn("rounded px-1.5 py-0.5", escala === "lin" ? "bg-muted text-foreground" : "hover:text-foreground")}
          >
            lineal
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-border">
          <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setFamiliaId(null);
                setSubFamiliaId(null);
                setSeleccionadoId(null);
              }}
              className={cn("hover:text-foreground", enRaiz && "font-medium text-foreground")}
            >
              Catálogo
            </button>
            {familiaId !== null && (
              <>
                <ChevronRight size={10} className="shrink-0" />
                <button
                  type="button"
                  onClick={() => {
                    setSubFamiliaId(null);
                    setSeleccionadoId(null);
                  }}
                  className={cn(
                    "truncate hover:text-foreground",
                    subFamiliaId === null && "font-medium text-foreground",
                  )}
                >
                  {familiaId ? (nombrePorFamiliaId[familiaId] ?? familiaId) : SIN_FAMILIA}
                </button>
              </>
            )}
            {subFamiliaId !== null && (
              <>
                <ChevronRight size={10} className="shrink-0" />
                <span className="truncate font-medium text-foreground">
                  {subFamiliaId ? (nombrePorFamiliaId[subFamiliaId] ?? subFamiliaId) : SIN_SUBFAMILIA}
                </span>
              </>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1">
            {(enRaiz ? itemsFamilia : itemsSubfamilia).map((item, i) => {
              const marcado = !enRaiz && subFamiliaId === item.id;
              const colorIndex = enRaiz
                ? (colorIndexPorSectorId[item.id] ?? i)
                : (colorIndexPorSectorId[familiaId ?? ""] ?? 0);
              return (
                <button
                  key={`${item.id}-${i}`}
                  type="button"
                  onClick={() => entrarSector(item.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/70",
                    marcado && "bg-muted",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: colorDe(colorIndex) }} />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{item.nombre}</span>
                    <span className="num text-[11px] text-muted-foreground">{item.n}</span>
                  </span>
                  <span className="ml-3.5 h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(item.n / maxConteoLista) * 100}%`, background: colorDe(colorIndex, 0.55) }}
                    />
                  </span>
                </button>
              );
            })}
            {(enRaiz ? itemsFamilia : itemsSubfamilia).length === 0 && (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">Nada que mostrar con el filtro actual.</p>
            )}
          </div>
        </aside>

        <div className="relative min-w-0 flex-1 bg-background">
          {puntos.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {materiales.length === 0
                ? "El catálogo de materiales está vacío. Cárgalos desde la vista Materiales."
                : "Ningún material coincide con la búsqueda o el filtro."}
            </p>
          ) : (
            <svg
              viewBox="0 0 800 800"
              className="h-full w-full"
              role="img"
              aria-label="Radar polar de materiales por familia y precio"
              onMouseLeave={() => setHoverId(null)}
              onClick={() => setSeleccionadoId(null)}
            >
              {sectores.map((s) => (
                <path
                  key={`velo-${s.id}`}
                  d={pathSector(R_SECTOR_IN, R_SECTOR_OUT, s.start, s.span)}
                  fill={veloDe(s.colorIndex)}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    entrarSector(s.id);
                  }}
                >
                  <title>{s.nombre}</title>
                </path>
              ))}

              {anillos.map((a) => (
                <g key={a.n}>
                  <circle cx={CX} cy={CY} r={a.r} fill="none" className="stroke-border" strokeWidth={1} />
                  <text
                    x={CX + 4}
                    y={CY - a.r - 3}
                    className="fill-muted-foreground"
                    fontSize={9}
                  >
                    {formatearAnillo(a.n)}
                  </text>
                </g>
              ))}
              <circle
                cx={CX}
                cy={CY}
                r={R_SIN_PRECIO}
                fill="none"
                className="stroke-muted-foreground/40"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text x={CX + 4} y={CY - R_SIN_PRECIO - 3} className="fill-muted-foreground" fontSize={9}>
                sin precio
              </text>
              <circle cx={CX} cy={CY} r={R_MAX} fill="none" className="stroke-border" strokeWidth={1} />

              {sectores.map((s) => {
                const mid = s.start + s.span / 2;
                const p = polar(mid, R_ETIQUETA);
                const cos = Math.cos(mid);
                const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
                if (s.span < 0.2) return null;
                const etiqueta = s.nombre.length > 24 ? `${s.nombre.slice(0, 22)}…` : s.nombre;
                return (
                  <text
                    key={`lbl-${s.id}`}
                    x={p.x}
                    y={p.y}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    className="fill-muted-foreground"
                    fontSize={10}
                  >
                    {etiqueta}
                  </text>
                );
              })}

              {lente && (
                <line
                  x1={CX}
                  y1={CY}
                  x2={lente.x}
                  y2={lente.y}
                  className="stroke-primary/50"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              )}

              {puntos.map((p) => {
                const activo = p.material.id === seleccionadoId || p.material.id === hoverId;
                return (
                  <circle
                    key={p.material.id}
                    cx={p.x}
                    cy={p.y}
                    r={activo ? p.r + 1.4 : p.r}
                    fill={p.precio > 0 ? colorDe(p.colorIndex, 0.9) : "transparent"}
                    stroke={activo ? "hsl(var(--primary))" : colorDe(p.colorIndex, 1)}
                    strokeWidth={activo ? 2 : p.precio > 0 ? 0.6 : 1.2}
                    strokeDasharray={p.precio > 0 ? undefined : "2 2"}
                    className="cursor-pointer"
                    style={{ transition: "cx 0.45s ease, cy 0.45s ease, r 0.25s ease" }}
                    onMouseEnter={() => setHoverId(p.material.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSeleccionadoId(p.material.id);
                    }}
                  >
                    <title>
                      {p.material.clave} — {p.material.descripcion}
                    </title>
                  </circle>
                );
              })}

              <g
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setFamiliaId(null);
                  setSubFamiliaId(null);
                  setSeleccionadoId(null);
                }}
              >
                <circle cx={CX} cy={CY} r={R_NUCLEO} className="fill-card stroke-border" strokeWidth={1} />
                {lente ? (
                  <>
                    <text x={CX} y={CY - 14} textAnchor="middle" className="fill-foreground" fontSize={11} fontWeight={600}>
                      {lente.material.clave.length > 14 ? `${lente.material.clave.slice(0, 13)}…` : lente.material.clave}
                    </text>
                    <text x={CX} y={CY + 4} textAnchor="middle" className="fill-foreground" fontSize={12}>
                      {lente.precio > 0 ? formatearDinero(lente.precio) : "Sin precio"}
                    </text>
                    <text x={CX} y={CY + 20} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                      merma {lente.merma}%
                    </text>
                  </>
                ) : (
                  <>
                    <text x={CX} y={CY - 12} textAnchor="middle" className="fill-foreground" fontSize={18} fontWeight={600}>
                      {visibles.length}
                    </text>
                    <text x={CX} y={CY + 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                      en el radar
                    </text>
                    <text x={CX} y={CY + 22} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                      {familiaId !== null
                        ? familiaId
                          ? (nombrePorFamiliaId[familiaId] ?? familiaId)
                          : SIN_FAMILIA
                        : "todo el catálogo"}
                    </text>
                  </>
                )}
              </g>
            </svg>
          )}
        </div>

        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-border">
          <div className="border-b border-border px-3 py-1.5">
            <h3 className="text-xs font-semibold">
              {ficha ? `Ficha — ${ficha.clave}` : "Ficha"}
            </h3>
          </div>
          {ficha ? (
            <div className="min-h-0 flex-1 overflow-auto px-3 py-2 text-xs">
              <p className="text-[13px] leading-snug text-foreground">{ficha.descripcion}</p>
              {puntoFicha && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {percentilTexto(ficha.id, puntoFicha.precio)}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Precio</dt>
                <dd className="num text-right font-medium">
                  {ficha.precio_vigente ? formatearDinero(parsePrecio(ficha.precio_vigente)) : "—"}
                </dd>
                <dt className="text-muted-foreground">Unidad</dt>
                <dd className="text-right">{simboloPorUnidadId[ficha.unidad_id] ?? ficha.unidad_id}</dd>
                <dt className="text-muted-foreground">Familia</dt>
                <dd className="truncate text-right">
                  {ficha.familia_id ? (nombrePorFamiliaId[ficha.familia_id] ?? ficha.familia_id) : "—"}
                </dd>
                <dt className="text-muted-foreground">Subfamilia</dt>
                <dd className="truncate text-right">
                  {ficha.sub_familia_id ? (nombrePorFamiliaId[ficha.sub_familia_id] ?? ficha.sub_familia_id) : "—"}
                </dd>
                <dt className="text-muted-foreground">Proveedor</dt>
                <dd className="truncate text-right">
                  {ficha.proveedor_id ? (nombrePorProveedorId[ficha.proveedor_id] ?? ficha.proveedor_id) : "—"}
                </dd>
                <dt className="text-muted-foreground">Marca</dt>
                <dd className="truncate text-right">{ficha.marca ?? "—"}</dd>
              </dl>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Merma</span>
                  <span>{ficha.merma_porcentaje ?? 0}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${Math.min(100, ficha.merma_porcentaje ?? 0)}%` }}
                  />
                </div>
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                Esta vista no edita el catálogo. Para cambiar precios o datos, usa la vista Materiales.
              </p>
            </div>
          ) : (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              Pasa el cursor sobre un punto para leerlo en el núcleo. Haz clic para fijar la ficha. Clic en una
              rebanada o en la lista para entrar a esa familia.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function FiltroPill({
  activo,
  onClick,
  muted,
  children,
}: {
  activo: boolean;
  onClick?: () => void;
  muted?: boolean;
  children: ReactNode;
}) {
  const clase = cn(
    "rounded-full border px-2 py-0.5 text-[11px]",
    muted && "border-transparent text-muted-foreground",
    !muted && onClick && "hover:bg-muted",
    activo && "border-primary/40 bg-primary/10 text-foreground",
    !activo && !muted && "border-border text-muted-foreground",
  );
  if (!onClick) return <span className={clase}>{children}</span>;
  return (
    <button type="button" onClick={onClick} className={clase}>
      {children}
    </button>
  );
}
