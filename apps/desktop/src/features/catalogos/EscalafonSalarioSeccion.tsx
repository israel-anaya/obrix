import { useEffect, useMemo, useState } from "react";
import { DollarSign, RefreshCcw } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SalarioCategoriaFasarPanel } from "@/features/catalogos/SalarioCategoriaFasarPanel";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listCategoriasFasar, listFamiliasInsumo, listUnidadesMedida } from "@/lib/tauri";
import type { CategoriaFasar, FamiliaInsumo, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_SUBFAMILIA_ID = "";

type Pasillo = { tipo: "todo" } | { tipo: "subfamilia"; id: string };

function parseMonto(s: string | null | undefined): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatearDinero(s: string | null | undefined): string {
  const n = parseMonto(s);
  if (n <= 0) return "Sin salario";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

function coincide(c: CategoriaFasar, q: string): boolean {
  if (!q) return true;
  return `${c.clave} ${c.descripcion}`.toLowerCase().includes(q);
}

function ordenEscalafon(a: CategoriaFasar, b: CategoriaFasar): number {
  const ra = parseMonto(a.salario_vigente?.salario_real_diario);
  const rb = parseMonto(b.salario_vigente?.salario_real_diario);
  if (ra === 0 && rb !== 0) return -1;
  if (rb === 0 && ra !== 0) return 1;
  if (ra !== rb) return ra - rb;
  return a.descripcion.localeCompare(b.descripcion, "es");
}

/**
 * Escalera de oficios del tabulador: por subfamilia, de menor a mayor salario
 * real. La barra llena es el real; el tramo interior es el base (lo que
 * aporta el FSR queda a la vista). No sustituye al grid — clic abre el
 * mismo panel de vigencia que `CategoriaFasarSeccion`.
 */
export function EscalafonSalarioSeccion() {
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pasillo, setPasillo] = useState<Pasillo>({ tipo: "todo" });
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);

  const recargarCategorias = () => listCategoriasFasar().then(setCategorias).catch((e) => setError(String(e)));

  const recargar = () => {
    setError(null);
    void recargarCategorias();
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
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
  const simboloPorUnidadId = useMemo(
    () => Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    [unidades],
  );

  const q = busqueda.trim().toLowerCase();
  const visibles = useMemo(() => {
    return categorias.filter((c) => {
      if (!coincide(c, q)) return false;
      if (pasillo.tipo === "subfamilia") return (c.sub_familia_id ?? SIN_SUBFAMILIA_ID) === pasillo.id;
      return true;
    });
  }, [categorias, q, pasillo]);

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

  const grupos = useMemo(() => {
    if (pasillo.tipo === "subfamilia") {
      const nombre =
        pasillo.id === SIN_SUBFAMILIA_ID ? "Sin subfamilia" : (nombrePorFamiliaId[pasillo.id] ?? pasillo.id);
      return [{ id: pasillo.id, nombre, oficios: [...visibles].sort(ordenEscalafon) }];
    }
    const por: Record<string, CategoriaFasar[]> = {};
    for (const c of visibles) {
      const id = c.sub_familia_id ?? SIN_SUBFAMILIA_ID;
      (por[id] ??= []).push(c);
    }
    return Object.entries(por)
      .map(([id, oficios]) => ({
        id,
        nombre: id === SIN_SUBFAMILIA_ID ? "Sin subfamilia" : (nombrePorFamiliaId[id] ?? id),
        oficios: [...oficios].sort(ordenEscalafon),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [visibles, pasillo, nombrePorFamiliaId]);

  const maxReal = useMemo(() => {
    let max = 0;
    for (const c of visibles) max = Math.max(max, parseMonto(c.salario_vigente?.salario_real_diario));
    return max;
  }, [visibles]);

  const seleccionada = categorias.find((c) => c.id === seleccionadaId) ?? null;
  const sinSalario = visibles.filter((c) => parseMonto(c.salario_vigente?.salario_real_diario) <= 0).length;

  const abrir = (id: string) => {
    setSeleccionadaId(id);
    setPanelAbierto(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">Escalafón</h2>
          <p className={cn("truncate text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
            {error ??
              `${visibles.length} oficios · ${sinSalario} sin salario · tramo interior = base, resto = FSR`}
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

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel id="escalafon-pasillos" defaultSize="18" minSize="14" className="flex min-h-0 flex-col">
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
            id="escalafon-escalera"
            defaultSize="52"
            minSize="32"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            {visibles.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {categorias.length === 0
                  ? "El tabulador está vacío. Cárgalo desde Tabuladores de Salario."
                  : "Nada en este gremio con el filtro actual."}
              </p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-3 [scrollbar-gutter:stable]">
                {grupos.map((grupo) => (
                  <section key={grupo.id || "sin"} className="mb-5 last:mb-0">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {grupo.nombre}
                      <span className="ml-2 font-normal normal-case">
                        de menor a mayor salario real
                      </span>
                    </h3>
                    <div className="flex flex-col gap-1">
                      {grupo.oficios.map((c, i) => (
                        <Peldano
                          key={c.id}
                          categoria={c}
                          orden={i + 1}
                          maxReal={maxReal}
                          unidad={simboloPorUnidadId[c.unidad_id] ?? ""}
                          seleccionado={c.id === seleccionadaId}
                          onClick={() => abrir(c.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </ResizablePanel>

          {panelAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="escalafon-salario"
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

function Peldano({
  categoria,
  orden,
  maxReal,
  unidad,
  seleccionado,
  onClick,
}: {
  categoria: CategoriaFasar;
  orden: number;
  maxReal: number;
  unidad: string;
  seleccionado: boolean;
  onClick: () => void;
}) {
  const base = parseMonto(categoria.salario_vigente?.salario_base_diario);
  const real = parseMonto(categoria.salario_vigente?.salario_real_diario);
  const fsr = categoria.salario_vigente?.factor_salario_real;
  const sinSalario = real <= 0;
  const anchoReal = !sinSalario && maxReal > 0 ? Math.max(8, (real / maxReal) * 100) : 36;
  const anchoBase = real > 0 ? Math.min(100, (base / real) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border border-border px-2 py-1.5 text-left hover:border-foreground/25 hover:bg-muted/40",
        seleccionado && "border-primary ring-1 ring-primary",
        sinSalario && !seleccionado && "border-dashed",
      )}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12px]">
          <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{orden}</span>
          {categoria.descripcion}
        </span>
        <span className={cn("shrink-0 text-[11px] font-medium", sinSalario && "text-amber-700 dark:text-amber-400")}>
          {formatearDinero(categoria.salario_vigente?.salario_real_diario)}
          {unidad && !sinSalario ? ` / ${unidad}` : ""}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-sm bg-muted">
        {sinSalario ? (
          <div className="h-full w-full border border-dashed border-border/80" />
        ) : (
          <div className="flex h-full" style={{ width: `${anchoReal}%` }}>
            <div className="h-full bg-primary/75" style={{ width: `${anchoBase}%` }} title="Salario base" />
            <div className="h-full flex-1 bg-primary/30" title="Aporte del FSR" />
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate font-mono">{categoria.clave}</span>
        <span className="shrink-0">
          {sinSalario
            ? "Clic para registrar vigencia"
            : `base ${formatearDinero(categoria.salario_vigente?.salario_base_diario)} · FSR ${fsr ?? "—"}`}
        </span>
      </div>
    </button>
  );
}
