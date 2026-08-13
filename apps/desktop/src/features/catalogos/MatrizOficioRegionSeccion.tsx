import { useEffect, useMemo, useState } from "react";
import { DollarSign, RefreshCcw } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SalarioCategoriaFasarPanel } from "@/features/catalogos/SalarioCategoriaFasarPanel";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listCategoriasFasar, listFamiliasInsumo, listRegiones, listSalariosCategoriaFasar } from "@/lib/tauri";
import type { CategoriaFasar, FamiliaInsumo, Region, SalarioCategoriaFasar } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_SUBFAMILIA_ID = "";
const NACIONAL_ID = "";

type Pasillo = { tipo: "todo" } | { tipo: "subfamilia"; id: string };

function parseMonto(s: string | null | undefined): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatearCorto(s: string | null | undefined): string {
  const n = parseMonto(s);
  if (n <= 0) return "—";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

function coincide(c: CategoriaFasar, q: string): boolean {
  if (!q) return true;
  return `${c.clave} ${c.descripcion}`.toLowerCase().includes(q);
}

function vigenteEn(
  salarios: SalarioCategoriaFasar[] | undefined,
  regionId: string,
): SalarioCategoriaFasar | undefined {
  const abiertas = (salarios ?? []).filter(
    (s) => s.fecha_vigencia_hasta === null && (s.region_id ?? "") === regionId,
  );
  if (abiertas.length === 0) return undefined;
  return [...abiertas].sort((a, b) => b.fecha_vigencia_desde.localeCompare(a.fecha_vigencia_desde))[0];
}

function tonoCelda(valor: number, min: number, max: number): string | undefined {
  if (valor <= 0 || max <= 0) return undefined;
  if (max === min) return "hsl(234 72% 56% / 0.16)";
  const t = (valor - min) / (max - min);
  const l = 72 - t * 28;
  return `hsl(234 72% ${l}% / 0.38)`;
}

/**
 * Tabulador publicado a lo ancho: oficios en filas, Nacional + regiones en
 * columnas. Cada celda es el salario real vigente de esa zona. Clic en un
 * hueco abre el alta ya apuntando a esa región; clic en una celda llena
 * solo selecciona el oficio. No sustituye al grid.
 */
export function MatrizOficioRegionSeccion() {
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [salariosPorCategoria, setSalariosPorCategoria] = useState<Record<string, SalarioCategoriaFasar[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pasillo, setPasillo] = useState<Pasillo>({ tipo: "todo" });
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [captura, setCaptura] = useState<{ regionId: string | null; ticket: number; abrir: boolean } | null>(null);

  const cargarSalarios = (cats: CategoriaFasar[]) => {
    if (cats.length === 0) {
      setSalariosPorCategoria({});
      return;
    }
    Promise.all(cats.map((c) => listSalariosCategoriaFasar(c.id).then((ss) => [c.id, ss] as const)))
      .then((pares) => setSalariosPorCategoria(Object.fromEntries(pares)))
      .catch((e) => setError(String(e)));
  };

  const recargar = () => {
    setError(null);
    listCategoriasFasar()
      .then((cats) => {
        setCategorias(cats);
        cargarSalarios(cats);
      })
      .catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listRegiones().then(setRegiones).catch((e) => setError(String(e)));
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

  const columnas = useMemo(
    () => [{ id: NACIONAL_ID, nombre: "Nacional" }, ...regiones.map((r) => ({ id: r.id, nombre: r.nombre }))],
    [regiones],
  );

  const q = busqueda.trim().toLowerCase();
  const filas = useMemo(() => {
    return categorias
      .filter((c) => {
        if (!coincide(c, q)) return false;
        if (pasillo.tipo === "subfamilia") return (c.sub_familia_id ?? SIN_SUBFAMILIA_ID) === pasillo.id;
        return true;
      })
      .sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
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

  const montosVisibles = useMemo(() => {
    const vals: number[] = [];
    for (const c of filas) {
      for (const col of columnas) {
        const v = vigenteEn(salariosPorCategoria[c.id], col.id);
        const n = parseMonto(v?.salario_real_diario);
        if (n > 0) vals.push(n);
      }
    }
    return vals;
  }, [filas, columnas, salariosPorCategoria]);

  const minMonto = montosVisibles.length ? Math.min(...montosVisibles) : 0;
  const maxMonto = montosVisibles.length ? Math.max(...montosVisibles) : 0;
  const celdas = filas.length * columnas.length;
  const llenas = montosVisibles.length;

  const seleccionada = categorias.find((c) => c.id === seleccionadaId) ?? null;

  const clicCelda = (categoriaId: string, regionId: string, vacia: boolean) => {
    setSeleccionadaId(categoriaId);
    setPanelAbierto(true);
    if (vacia) {
      setCaptura({ regionId: regionId || null, ticket: Date.now(), abrir: true });
    } else {
      setCaptura({ regionId: regionId || null, ticket: Date.now(), abrir: false });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">Matriz oficio × región</h2>
          <p className={cn("truncate text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
            {error ??
              `${llenas}/${celdas || 0} celdas con vigencia · clic en un hueco para capturar esa zona`}
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
          <ResizablePanel id="matriz-gremios" defaultSize="16" minSize="12" className="flex min-h-0 flex-col">
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
            id="matriz-tablero"
            defaultSize="54"
            minSize="32"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            {filas.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {categorias.length === 0
                  ? "El tabulador está vacío. Cárgalo desde Tabuladores de Salario."
                  : "Nada en este gremio con el filtro actual."}
              </p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                {regiones.length === 0 && (
                  <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                    Solo se muestra Nacional. Agrega regiones en Configuración para zonificar el tabulador.
                  </p>
                )}
                <table className="w-max min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-30 min-w-52 border-b border-r border-border bg-background px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Oficio
                      </th>
                      {columnas.map((col) => (
                        <th
                          key={col.id || "nac"}
                          className="sticky top-0 z-20 min-w-28 border-b border-border bg-background px-2 py-1.5 text-right text-[11px] font-semibold text-muted-foreground"
                        >
                          {col.nombre}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((c) => (
                      <tr key={c.id} className={cn(!c.activo && "opacity-55")}>
                        <th
                          className={cn(
                            "sticky left-0 z-10 border-b border-r border-border bg-background px-2 py-1 text-left font-normal",
                            seleccionadaId === c.id && "bg-primary/10",
                          )}
                        >
                          <div className="truncate text-[12px]" title={c.descripcion}>
                            {c.descripcion}
                          </div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {c.clave}
                            {c.sub_familia_id ? ` · ${nombrePorFamiliaId[c.sub_familia_id] ?? ""}` : ""}
                          </div>
                        </th>
                        {columnas.map((col) => {
                          const s = vigenteEn(salariosPorCategoria[c.id], col.id);
                          const n = parseMonto(s?.salario_real_diario);
                          const vacia = !s;
                          return (
                            <td key={col.id || "nac"} className="border-b border-border p-0">
                              <button
                                type="button"
                                onClick={() => clicCelda(c.id, col.id, vacia)}
                                title={
                                  s
                                    ? `Base $${s.salario_base_diario} × FSR ${s.factor_salario_real}`
                                    : `Registrar ${col.nombre}`
                                }
                                className={cn(
                                  "flex h-full min-h-9 w-full items-center justify-end px-2 py-1.5 text-right hover:ring-1 hover:ring-inset hover:ring-primary/40",
                                  vacia && "text-muted-foreground",
                                  seleccionadaId === c.id && vacia && "bg-primary/5",
                                )}
                                style={vacia ? undefined : { background: tonoCelda(n, minMonto, maxMonto) }}
                              >
                                <span className={cn("num", vacia && "border-b border-dashed border-muted-foreground/40")}>
                                  {formatearCorto(s?.salario_real_diario)}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ResizablePanel>

          {panelAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="matriz-salario"
                defaultSize="30"
                minSize="22"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <SalarioCategoriaFasarPanel
                  categoriaId={seleccionadaId}
                  categoriaClave={seleccionada?.clave}
                  categoriaDescripcion={seleccionada?.descripcion}
                  captura={captura}
                  onCerrar={() => {
                    setPanelAbierto(false);
                    setCaptura(null);
                  }}
                  onSalarioRegistrado={() => {
                    recargar();
                    setCaptura(null);
                  }}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
