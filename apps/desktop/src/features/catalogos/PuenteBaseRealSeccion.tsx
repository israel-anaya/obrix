import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DollarSign, RefreshCcw } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SalarioCategoriaFasarPanel } from "@/features/catalogos/SalarioCategoriaFasarPanel";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listCategoriasFasar, listFactoresSalarioReal, listFamiliasInsumo } from "@/lib/tauri";
import type { CategoriaFasar, FactorSalarioReal, FamiliaInsumo } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_SUBFAMILIA_ID = "";
const PALETA_FSR = [
  { h: 234, s: 72 },
  { h: 172, s: 52 },
  { h: 32, s: 70 },
  { h: 280, s: 48 },
  { h: 350, s: 58 },
  { h: 200, s: 55 },
];

type Pasillo = { tipo: "todo" } | { tipo: "subfamilia"; id: string };
type Filtro = "todos" | "sin-salario" | "fsr-distinto";
type Orden = "real" | "incremento" | "nombre";

function parseMonto(s: string | null | undefined): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatearDinero(n: number): string {
  if (n <= 0) return "—";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

function coincide(c: CategoriaFasar, q: string): boolean {
  if (!q) return true;
  return `${c.clave} ${c.descripcion}`.toLowerCase().includes(q);
}

function colorFsr(index: number, alpha = 0.85): string {
  const { h, s } = PALETA_FSR[index % PALETA_FSR.length];
  return `hsl(${h} ${s}% 48% / ${alpha})`;
}

/**
 * Puente visual base → real de cada oficio: el tramo izquierdo es el salario
 * de nómina, el derecho es lo que mete el FSR. Colorea por qué FSR usa cada
 * uno para cazar excepciones. No sustituye al grid — clic abre el panel de
 * vigencia.
 */
export function PuenteBaseRealSeccion() {
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [factores, setFactores] = useState<FactorSalarioReal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pasillo, setPasillo] = useState<Pasillo>({ tipo: "todo" });
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [orden, setOrden] = useState<Orden>("real");
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);

  const recargarCategorias = () => listCategoriasFasar().then(setCategorias).catch((e) => setError(String(e)));

  const recargar = () => {
    setError(null);
    void recargarCategorias();
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listFactoresSalarioReal().then(setFactores).catch((e) => setError(String(e)));
  };

  const { organizacionActivaId } = useOrganizacionActiva();
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionActivaId]);

  const nombrePorFamiliaId = useMemo(
    () => Object.fromEntries(familias.map((f) => [f.id, f.nombre])),
    [familias],
  );
  const nombrePorFactorId = useMemo(
    () => Object.fromEntries(factores.map((f) => [f.id, f.nombre])),
    [factores],
  );

  const q = busqueda.trim().toLowerCase();
  const delPasillo = useMemo(() => {
    return categorias.filter((c) => {
      if (!coincide(c, q)) return false;
      if (pasillo.tipo === "subfamilia") return (c.sub_familia_id ?? SIN_SUBFAMILIA_ID) === pasillo.id;
      return true;
    });
  }, [categorias, q, pasillo]);

  const modaFsrId = useMemo(() => {
    const conteo: Record<string, number> = {};
    for (const c of delPasillo) {
      const id = c.salario_vigente?.factor_salario_real_id;
      if (!id) continue;
      conteo[id] = (conteo[id] ?? 0) + 1;
    }
    let mejor: string | null = null;
    let n = 0;
    for (const [id, k] of Object.entries(conteo)) {
      if (k > n) {
        mejor = id;
        n = k;
      }
    }
    return mejor;
  }, [delPasillo]);

  const visibles = useMemo(() => {
    const lista = delPasillo.filter((c) => {
      const real = parseMonto(c.salario_vigente?.salario_real_diario);
      if (filtro === "sin-salario") return real <= 0;
      if (filtro === "fsr-distinto") {
        const id = c.salario_vigente?.factor_salario_real_id;
        return !!id && modaFsrId !== null && id !== modaFsrId;
      }
      return true;
    });
    lista.sort((a, b) => {
      const ra = parseMonto(a.salario_vigente?.salario_real_diario);
      const rb = parseMonto(b.salario_vigente?.salario_real_diario);
      const ba = parseMonto(a.salario_vigente?.salario_base_diario);
      const bb = parseMonto(b.salario_vigente?.salario_base_diario);
      const ia = ra > 0 && ba > 0 ? ra - ba : -1;
      const ib = rb > 0 && bb > 0 ? rb - bb : -1;
      if (orden === "nombre") return a.descripcion.localeCompare(b.descripcion, "es");
      if (orden === "incremento") {
        if (ia !== ib) return ib - ia;
      } else if (ra !== rb) {
        return rb - ra;
      }
      return a.descripcion.localeCompare(b.descripcion, "es");
    });
    return lista;
  }, [delPasillo, filtro, orden, modaFsrId]);

  const fsrIndexPorId = useMemo(() => {
    const ids = [...new Set(delPasillo.map((c) => c.salario_vigente?.factor_salario_real_id).filter(Boolean))] as string[];
    return Object.fromEntries(ids.map((id, i) => [id, i]));
  }, [delPasillo]);

  const conteoPorSubfamilia = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const c of categorias) {
      if (!coincide(c, q)) continue;
      const id = c.sub_familia_id ?? SIN_SUBFAMILIA_ID;
      mapa[id] = (mapa[id] ?? 0) + 1;
    }
    return mapa;
  }, [categorias, q]);

  const pasillos = useMemo(() => {
    const hijas = familias.filter((f) => f.parent_id !== null);
    const lista = hijas
      .map((f) => ({ id: f.id, nombre: f.nombre, n: conteoPorSubfamilia[f.id] ?? 0 }))
      .filter((p) => p.n > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const sin = conteoPorSubfamilia[SIN_SUBFAMILIA_ID] ?? 0;
    if (sin > 0) lista.push({ id: SIN_SUBFAMILIA_ID, nombre: "Sin subfamilia", n: sin });
    return lista;
  }, [familias, conteoPorSubfamilia]);

  const maxReal = useMemo(() => {
    let max = 0;
    for (const c of visibles) max = Math.max(max, parseMonto(c.salario_vigente?.salario_real_diario));
    return max;
  }, [visibles]);

  const sinSalario = delPasillo.filter((c) => parseMonto(c.salario_vigente?.salario_real_diario) <= 0).length;
  const fsrDistintos = delPasillo.filter((c) => {
    const id = c.salario_vigente?.factor_salario_real_id;
    return !!id && modaFsrId !== null && id !== modaFsrId;
  }).length;
  const seleccionada = categorias.find((c) => c.id === seleccionadaId) ?? null;

  const abrir = (id: string) => {
    setSeleccionadaId(id);
    setPanelAbierto(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">Puente base → real</h2>
          <p className={cn("truncate text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
            {error ?? "Izquierda = base de nómina · derecha = aporte del FSR · color = qué FSR usa"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Buscador value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargar },
              {
                icono: DollarSign,
                titulo: panelAbierto ? "Ocultar salario" : "Ver salario",
                onClick: () => setPanelAbierto((v) => !v),
                disabled: !seleccionadaId && !panelAbierto,
              },
            ]}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
        <FiltroPill activo={filtro === "todos"} onClick={() => setFiltro("todos")}>
          {delPasillo.length} oficios
        </FiltroPill>
        <FiltroPill activo={filtro === "sin-salario"} onClick={() => setFiltro(filtro === "sin-salario" ? "todos" : "sin-salario")}>
          {sinSalario} sin salario
        </FiltroPill>
        <FiltroPill
          activo={filtro === "fsr-distinto"}
          onClick={() => setFiltro(filtro === "fsr-distinto" ? "todos" : "fsr-distinto")}
        >
          {fsrDistintos} con FSR distinto
        </FiltroPill>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          Orden
          {(["real", "incremento", "nombre"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrden(o)}
              className={cn("rounded px-1.5 py-0.5", orden === o ? "bg-muted text-foreground" : "hover:text-foreground")}
            >
              {o === "real" ? "real" : o === "incremento" ? "aporte FSR" : "nombre"}
            </button>
          ))}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel id="puente-gremios" defaultSize="16" minSize="12" className="flex min-h-0 flex-col">
            <div className="border-b border-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Gremios
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1 [scrollbar-gutter:stable]">
              <button
                type="button"
                onClick={() => setPasillo({ tipo: "todo" })}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  pasillo.tipo === "todo" && "bg-muted text-foreground",
                )}
              >
                <span>Todo el tabulador</span>
                <span className="num text-[11px]">{categorias.filter((c) => coincide(c, q)).length}</span>
              </button>
              {pasillos.map((p) => (
                <button
                  key={p.id || "sin"}
                  type="button"
                  onClick={() => setPasillo({ tipo: "subfamilia", id: p.id })}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    pasillo.tipo === "subfamilia" && pasillo.id === p.id && "bg-muted text-foreground",
                  )}
                >
                  <span className="truncate">{p.nombre}</span>
                  <span className="num shrink-0 text-[11px]">{p.n}</span>
                </button>
              ))}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id="puente-lista"
            defaultSize="54"
            minSize="32"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            {visibles.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {categorias.length === 0
                  ? "El tabulador está vacío. Cárgalo desde Tabuladores de Salario."
                  : "Nada coincide con el filtro actual."}
              </p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-3 [scrollbar-gutter:stable]">
                {Object.keys(fsrIndexPorId).length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {Object.entries(fsrIndexPorId).map(([id, i]) => (
                      <span key={id} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ background: colorFsr(i) }} />
                        {nombrePorFactorId[id] ?? id}
                        {id === modaFsrId ? " (más usado)" : ""}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  {visibles.map((c) => (
                    <Puente
                      key={c.id}
                      categoria={c}
                      maxReal={maxReal}
                      gremio={c.sub_familia_id ? (nombrePorFamiliaId[c.sub_familia_id] ?? "") : ""}
                      nombreFsr={
                        c.salario_vigente
                          ? (nombrePorFactorId[c.salario_vigente.factor_salario_real_id] ?? c.salario_vigente.factor_salario_real)
                          : ""
                      }
                      colorIndex={
                        c.salario_vigente
                          ? (fsrIndexPorId[c.salario_vigente.factor_salario_real_id] ?? 0)
                          : 0
                      }
                      distinto={
                        !!c.salario_vigente &&
                        modaFsrId !== null &&
                        c.salario_vigente.factor_salario_real_id !== modaFsrId
                      }
                      seleccionado={c.id === seleccionadaId}
                      onClick={() => abrir(c.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </ResizablePanel>

          {panelAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="puente-salario"
                defaultSize="30"
                minSize="22"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <SalarioCategoriaFasarPanel
                  categoriaId={seleccionadaId}
                  categoriaClave={seleccionada?.clave}
                  categoriaDescripcion={seleccionada?.descripcion}
                  onCerrar={() => setPanelAbierto(false)}
                  onSalarioRegistrado={() => void recargarCategorias()}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function Puente({
  categoria,
  maxReal,
  gremio,
  nombreFsr,
  colorIndex,
  distinto,
  seleccionado,
  onClick,
}: {
  categoria: CategoriaFasar;
  maxReal: number;
  gremio: string;
  nombreFsr: string;
  colorIndex: number;
  distinto: boolean;
  seleccionado: boolean;
  onClick: () => void;
}) {
  const base = parseMonto(categoria.salario_vigente?.salario_base_diario);
  const real = parseMonto(categoria.salario_vigente?.salario_real_diario);
  const aporte = Math.max(0, real - base);
  const pctAporte = base > 0 ? (aporte / base) * 100 : 0;
  const sinSalario = real <= 0;
  const ancho = !sinSalario && maxReal > 0 ? Math.max(12, (real / maxReal) * 100) : 40;
  const pctBase = real > 0 ? Math.min(100, (base / real) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border border-border px-2.5 py-2 text-left hover:border-foreground/25 hover:bg-muted/40",
        seleccionado && "border-primary ring-1 ring-primary",
        !categoria.activo && "opacity-55",
        sinSalario && !seleccionado && "border-dashed",
        distinto && !seleccionado && "border-amber-500/40",
      )}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12px]">
          {categoria.descripcion}
          {gremio && <span className="ml-1.5 text-[10px] text-muted-foreground">{gremio}</span>}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{categoria.clave}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("w-20 shrink-0 text-[11px]", sinSalario && "text-amber-700 dark:text-amber-400")}>
          {sinSalario ? "Sin base" : formatearDinero(base)}
        </span>
        <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
          {sinSalario ? (
            <div className="h-full w-full border border-dashed border-border/80" />
          ) : (
            <div className="flex h-full" style={{ width: `${ancho}%` }}>
              <div className="h-full bg-foreground/55" style={{ width: `${pctBase}%` }} title="Salario base" />
              <div
                className="h-full flex-1"
                style={{ background: colorFsr(colorIndex, 0.7) }}
                title={`Aporte FSR ${formatearDinero(aporte)}`}
              />
            </div>
          )}
        </div>
        <span className={cn("w-24 shrink-0 text-right text-[11px] font-medium", sinSalario && "text-amber-700 dark:text-amber-400")}>
          {sinSalario ? "Sin real" : formatearDinero(real)}
        </span>
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">
          {sinSalario
            ? "Clic para registrar vigencia"
            : `${nombreFsr || "FSR"} ${categoria.salario_vigente?.factor_salario_real ?? ""}`}
        </span>
        {!sinSalario && (
          <span className="shrink-0">
            +{formatearDinero(aporte)} ({pctAporte.toFixed(0)}%)
          </span>
        )}
      </div>
    </button>
  );
}

function FiltroPill({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px]",
        activo ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
