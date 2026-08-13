import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, DollarSign, FileText, Plus, RefreshCcw } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { MaterialFormPanel } from "@/features/catalogos/MaterialFormPanel";
import { PreciosMaterialPanel } from "@/features/catalogos/PreciosMaterialPanel";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  listFamiliasInsumo,
  listMateriales,
  listProveedores,
  listUnidadesMedida,
  listUsuarios,
} from "@/lib/tauri";
import type { FamiliaInsumo, Material, MaterialData, Proveedor, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_FAMILIA_ID = "";
const SIN_SUBFAMILIA_ID = "";

type Pasillo =
  | { tipo: "todo" }
  | { tipo: "familia"; id: string }
  | { tipo: "subfamilia"; familiaId: string; id: string };

type PanelDetalle = "ficha" | "precios";

function formatearDinero(s: string | null): string {
  if (s == null || s === "") return "Sin precio";
  const n = Number(s);
  if (!Number.isFinite(n)) return `$${s}`;
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

function coincide(m: Material, q: string): boolean {
  if (!q) return true;
  return `${m.clave} ${m.descripcion} ${m.marca ?? ""}`.toLowerCase().includes(q);
}

/**
 * Catálogo visual de materiales: pasillos (familia/subfamilia) a la izquierda,
 * tarjetas al centro, ficha o precios a la derecha. No sustituye al grid —
 * aquí se recorre y se completa un material a la vez.
 */
export function EstanteriaMaterialesSeccion() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pasillo, setPasillo] = useState<Pasillo>({ tipo: "todo" });
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelDetalle | null>(null);
  const [alta, setAlta] = useState<MaterialData | null>(null);

  const recargar = () => {
    setError(null);
    listMateriales().then(setMateriales).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
    listUnidadesMedida().then(setUnidades).catch((e) => setError(String(e)));
    listProveedores().then(setProveedores).catch((e) => setError(String(e)));
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
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
  const raices = useMemo(() => familias.filter((f) => f.parent_id === null), [familias]);
  const hijasPorPadreId = useMemo(() => {
    const mapa: Record<string, FamiliaInsumo[]> = {};
    for (const f of familias) {
      if (f.parent_id) (mapa[f.parent_id] ??= []).push(f);
    }
    return mapa;
  }, [familias]);

  const q = busqueda.trim().toLowerCase();

  const visibles = useMemo(() => {
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

  const sinFamilia = conteoPorFamilia[SIN_FAMILIA_ID] ?? 0;

  const materialSeleccionado = materiales.find((m) => m.id === seleccionadoId) ?? null;

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

  const entrarFamilia = (id: string) => {
    setPasillo({ tipo: "familia", id });
    setExpandidos((prev) => new Set(prev).add(id));
  };

  const abrirDetalle = (id: string, cual: PanelDetalle = "ficha") => {
    setAlta(null);
    setSeleccionadoId(id);
    setPanel(cual);
  };

  const cerrarDetalle = () => {
    setAlta(null);
    setPanel(null);
    setSeleccionadoId(null);
  };

  const agregar = () => {
    const unidad = unidades[0];
    if (!unidad) {
      setError("No hay unidades de medida. Configúralas antes de agregar un material.");
      return;
    }
    const familia_id =
      pasillo.tipo === "familia" ? pasillo.id || null : pasillo.tipo === "subfamilia" ? pasillo.familiaId || null : null;
    const sub_familia_id = pasillo.tipo === "subfamilia" ? pasillo.id || null : null;
    setAlta({
      clave: "",
      descripcion: "",
      unidad_id: unidad.id,
      familia_id,
      sub_familia_id,
      proveedor_id: null,
      merma_porcentaje: 0,
      marca: null,
      activo: true,
    });
    setSeleccionadoId(null);
    setPanel("ficha");
    setError(null);
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">Estantería</h2>
          <p className={cn("truncate text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
            {error ?? `${tituloPasillo} · ${visibles.length} material${visibles.length === 1 ? "" : "es"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Buscador value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargar },
              { icono: Plus, titulo: "Agregar", onClick: agregar },
              {
                icono: FileText,
                titulo: panel === "ficha" ? "Ocultar ficha" : "Ver ficha",
                onClick: () => {
                  if (alta) {
                    cerrarDetalle();
                    return;
                  }
                  setPanel((v) => (v === "ficha" ? null : "ficha"));
                },
                disabled: !seleccionadoId && !alta && panel !== "ficha",
              },
              {
                icono: DollarSign,
                titulo: panel === "precios" ? "Ocultar precios" : "Ver precios",
                onClick: () =>
                  setPanel((v) => {
                    if (v === "precios") return null;
                    return "precios";
                  }),
                disabled: !!alta || (!seleccionadoId && panel !== "precios"),
              },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel id="estanteria-pasillos" defaultSize="20" minSize="14" className="flex min-h-0 flex-col">
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
                return (
                  <div key={fam.id}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        title={abierto ? "Contraer" : "Expandir"}
                        onClick={() => toggleExpandido(fam.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {abierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => entrarFamilia(fam.id)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 py-1 pr-2 text-left text-[13px] text-muted-foreground hover:text-foreground",
                          (nodoActivo("familia", fam.id) ||
                            (pasillo.tipo === "subfamilia" && pasillo.familiaId === fam.id)) &&
                            "text-foreground",
                        )}
                      >
                        <span className="truncate">{fam.nombre}</span>
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

          <ResizablePanel
            id="estanteria-anaquel"
            defaultSize="50"
            minSize="30"
            className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            {visibles.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {materiales.length === 0
                  ? "El catálogo está vacío. Cárgalos desde la vista Materiales."
                  : "Nada en este pasillo con el filtro actual."}
              </p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                  {visibles.map((m) => {
                    const sinPrecio = !m.precio_vigente;
                    const seleccionado = m.id === seleccionadoId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => abrirDetalle(m.id, panel ?? "ficha")}
                        className={cn(
                          "flex flex-col rounded-md border border-border bg-card p-2.5 text-left hover:border-foreground/25 hover:bg-muted/40",
                          seleccionado && "border-primary ring-1 ring-primary",
                          !m.activo && "opacity-55",
                          sinPrecio && !seleccionado && "border-dashed",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate font-mono text-[11px] font-semibold">{m.clave}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {simboloPorUnidadId[m.unidad_id] ?? m.unidad_id}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 min-h-8 text-[12px] leading-snug">{m.descripcion}</p>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <span className={cn("text-[12px] font-medium", sinPrecio && "text-amber-700 dark:text-amber-400")}>
                            {formatearDinero(m.precio_vigente)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">merma {m.merma_porcentaje ?? 0}%</span>
                        </div>
                        {(m.marca || !m.familia_id) && (
                          <p className="mt-1 truncate text-[10px] text-muted-foreground">
                            {m.marca ?? "Sin familia"}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </ResizablePanel>

          {panel ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="estanteria-detalle"
                defaultSize="30"
                minSize="22"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                {panel === "precios" ? (
                  <PreciosMaterialPanel
                    materialId={seleccionadoId}
                    materialClave={materialSeleccionado?.clave}
                    materialDescripcion={materialSeleccionado?.descripcion}
                    onCerrar={cerrarDetalle}
                    onPrecioRegistrado={recargar}
                  />
                ) : (
                  <MaterialFormPanel
                    material={alta ? null : materialSeleccionado}
                    nuevo={alta}
                    unidades={unidades}
                    proveedores={proveedores}
                    familias={familias}
                    nombresPorUsuarioId={nombresPorUsuarioId}
                    onCerrar={cerrarDetalle}
                    onGuardado={recargar}
                    onCreado={(creado) => {
                      setAlta(null);
                      setBusqueda("");
                      setMateriales((prev) => [...prev, creado]);
                      setSeleccionadoId(creado.id);
                      recargar();
                    }}
                  />
                )}
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
