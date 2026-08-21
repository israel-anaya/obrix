import { useEffect, useMemo, useState } from "react";
import { DollarSign, RefreshCcw } from "lucide-react";
import { ActionBar, ActionBarMenu } from "@/components/ActionBar";
import { APP_ICONS } from "@/lib/appIcons";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SalarioCategoriaFasarPanel } from "@/features/catalogos/proyecto/mano-obra/SalarioCategoriaFasarPanel";
import { SalarioHistorialGrid } from "@/features/catalogos/proyecto/mano-obra/SalarioHistorialGrid";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listCategoriasFasar, listFamiliasInsumo, listRegiones, listSalariosCategoriaFasar, listUsuarios } from "@/lib/tauri";
import type { CategoriaFasar, FamiliaInsumo, Region, SalarioCategoriaFasar } from "@/lib/types";
import { regionesVisibles } from "@/lib/types";
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
 * columnas. Cada celda es el salario real vigente de esa región. Clic en un
 * hueco abre el alta ya apuntando a esa región; clic en una celda llena
 * selecciona el oficio. El panel de salario e historial es el mismo que
 * `CategoriaFasarSeccion`. Es el "Modo Matriz × región" de Tabuladores
 * de Salario (ver `TabuladoresSalarioSeccion`); no sustituye al grid.
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
  const [panelHistorialAbierto, setPanelHistorialAbierto] = useState(false);
  const [historialTicket, setHistorialTicket] = useState(0);
  const [historialFocoTicket, setHistorialFocoTicket] = useState(0);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
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
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    }).catch((e) => setError(String(e)));
    setHistorialTicket((n) => n + 1);
  };

  const cerrarSalario = () => {
    setPanelAbierto(false);
    setPanelHistorialAbierto(false);
    setCaptura(null);
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
    () => [{ id: NACIONAL_ID, nombre: "Nacional" }, ...regionesVisibles(regiones).map((r) => ({ id: r.id, nombre: r.nombre }))],
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

  useEffect(() => {
    if (filas.length === 0) {
      if (seleccionadaId !== null) setSeleccionadaId(null);
      setPanelAbierto(false);
      setPanelHistorialAbierto(false);
      setCaptura(null);
      return;
    }
    if (!filas.some((c) => c.id === seleccionadaId)) {
      setSeleccionadaId(filas[0].id);
    }
  }, [filas, seleccionadaId]);

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
          <p
            className={cn("truncate text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}
            title={error ? undefined : "Clic en un hueco para capturar esa región"}
          >
            {error ??
              `${filas.length} ${filas.length === 1 ? "oficio" : "oficios"} · ${columnas.length} ${columnas.length === 1 ? "región" : "regiones"} · ${llenas}/${celdas || 0} vigentes`}
          </p>
          <div className="flex items-center gap-0.5">
            <ActionBar
              actions={[
                {
                  icon: DollarSign,
                  title: panelAbierto ? "Ocultar salario" : "Ver salario",
                  onClick: () =>
                    setPanelAbierto((v) => {
                      if (v) {
                        setPanelHistorialAbierto(false);
                        setCaptura(null);
                      }
                      return !v;
                    }),
                  disabled: filas.length === 0,
                },
              ]}
            />
            <div className="mx-1 h-4 w-px bg-border" />
            <SearchInput value={busqueda} onChange={setBusqueda} />
          </div>
        </div>
        <ActionBarMenu menu={[{ icon: RefreshCcw, title: "Recargar", onClick: recargar }]} />
      </div>

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="vertical" className="h-full">
          <ResizablePanel
            id="matriz-principal"
            defaultSize="65"
            minSize="35"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel id="matriz-gremios" defaultSize="10" minSize="7" className="flex min-h-0 flex-col">
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
            defaultSize="60"
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
                {regionesVisibles(regiones).length === 0 && (
                  <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                    Solo se muestra Nacional. Agrega regiones en Configuración para tabular por región.
                  </p>
                )}
                <table className="w-max min-w-full table-fixed border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr>
                      <th
                        rowSpan={2}
                        className="sticky left-0 top-0 z-30 w-44 min-w-44 border-b border-r border-border bg-background px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Oficio
                      </th>
                      {columnas.map((col) => (
                        <th
                          key={`${col.id || "nac"}-grupo`}
                          className="sticky top-0 z-20 h-7 w-14 max-w-14 border-b border-r border-border bg-background text-center"
                          title={col.nombre}
                        >
                          {col.id ? (
                            <APP_ICONS.region_otra.icono size={16} className={cn("mx-auto", APP_ICONS.region_otra.color)} />
                          ) : (
                            <APP_ICONS.region_nacional.icono size={16} className={cn("mx-auto", APP_ICONS.region_nacional.color)} />
                          )}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {columnas.map((col) => (
                        <th
                          key={`${col.id || "nac"}-nombre`}
                          className="sticky top-7 z-20 w-14 max-w-14 border-b border-r border-border bg-background px-1 py-1 text-center text-[11px] font-semibold leading-tight text-muted-foreground"
                          title={col.nombre}
                        >
                          <span className="line-clamp-2 break-words">{col.nombre}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((c) => (
                      <tr key={c.id}>
                        <th
                          className={cn(
                            "sticky left-0 z-10 w-44 min-w-44 border-b border-r border-border p-0 text-left font-normal",
                            seleccionadaId === c.id ? "bg-muted" : "bg-background",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSeleccionadaId(c.id);
                              setCaptura(null);
                            }}
                            className="block w-full px-2 py-1 text-left"
                          >
                            <div className="truncate text-[12px]" title={c.descripcion}>
                              {c.descripcion}
                            </div>
                            <div className="truncate font-mono text-[10px] text-muted-foreground">
                              {c.clave}
                              {c.sub_familia_id ? ` · ${nombrePorFamiliaId[c.sub_familia_id] ?? ""}` : ""}
                            </div>
                          </button>
                        </th>
                        {columnas.map((col) => {
                          const s = vigenteEn(salariosPorCategoria[c.id], col.id);
                          const n = parseMonto(s?.salario_real_diario);
                          const vacia = !s;
                          return (
                            <td key={col.id || "nac"} className="w-14 max-w-14 overflow-hidden border-b border-border p-0">
                              <button
                                type="button"
                                onClick={() => clicCelda(c.id, col.id, vacia)}
                                title={
                                  s
                                    ? `Base $${s.salario_base_diario} × FSR ${s.factor_salario_real}`
                                    : `Registrar ${col.nombre}`
                                }
                                className={cn(
                                  "flex h-full min-h-9 w-full items-center justify-end px-1 py-1.5 text-right hover:ring-1 hover:ring-inset hover:ring-primary/40",
                                  vacia && "bg-muted/50 text-muted-foreground hover:bg-muted/70",
                                  seleccionadaId === c.id && vacia && "bg-muted/70",
                                )}
                                style={vacia ? undefined : { background: tonoCelda(n, minMonto, maxMonto) }}
                              >
                                <span className={cn("num truncate", vacia && "border-b border-dashed border-muted-foreground/40")}>
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
                  onCerrar={cerrarSalario}
                  onSalarioRegistrado={() => {
                    recargar();
                    setCaptura(null);
                  }}
                  onVerHistorialCompleto={() => {
                    if (!panelHistorialAbierto) setHistorialFocoTicket((n) => n + 1);
                    setPanelHistorialAbierto((v) => !v);
                  }}
                  historialAbierto={panelHistorialAbierto}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
          </ResizablePanel>
          {panelHistorialAbierto ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="matriz-historial"
                defaultSize="35"
                minSize="20"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <SalarioHistorialGrid
                  categoriaId={seleccionadaId}
                  nombresPorUsuarioId={nombresPorUsuarioId}
                  revision={historialTicket}
                  focoTicket={historialFocoTicket}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
