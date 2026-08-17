import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, DollarSign, Pencil, Plus, RefreshCcw } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import { PercentageInput } from "@/components/PercentageInput";
import { SearchInput } from "@/components/SearchInput";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PreciosMaterialPanel } from "@/features/catalogos/PreciosMaterialPanel";
import { iconoDeFamilia } from "@/icons/familias";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { toast } from "@/hooks/use-toast";
import { formatearFecha } from "@/lib/fecha";
import { ordenarPor } from "@/lib/ordenar";
import {
  createMaterial,
  listFamiliasInsumo,
  listMateriales,
  listProveedores,
  listUnidadesMedida,
  listUsuarios,
  updateMaterial,
} from "@/lib/tauri";
import type { FamiliaInsumo, Material, MaterialData, Proveedor, UnidadMedida } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_FAMILIA_ID = "";
const SIN_SUBFAMILIA_ID = "";
// Radix no permite un `SelectItem` con value="" — estos "sin X" son null en
// el backend y necesitan un valor propio para poder ofrecerse como opción.
const SIN_FAMILIA_VALOR = "__sin_familia__";
const SIN_SUBFAMILIA_VALOR = "__sin_subfamilia__";
const SIN_PROVEEDOR_VALOR = "__sin_proveedor__";

type Pasillo =
  | { tipo: "todo" }
  | { tipo: "familia"; id: string }
  | { tipo: "subfamilia"; familiaId: string; id: string };

type PanelDetalle = "precios";

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
 * tarjetas al centro, precios a la derecha. No sustituye al grid — aquí se
 * recorre y se completa un material a la vez. Alta y edición abren un
 * `Sheet` (mismo patrón que `CuadrillasFicha`); seleccionar una tarjeta
 * solo la marca, no abre el panel.
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
  // Alta y edición viven en un `Sheet` (mismo patrón que `CuadrillasFicha`).
  // `editandoId` es `null` cuando se está creando.
  const [alta, setAlta] = useState<MaterialData | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardandoAlta, setGuardandoAlta] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  useEffect(() => {
    if (errorAlta) toast({ description: errorAlta, variant: "destructive" });
  }, [errorAlta]);

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
  const materialEditando = editandoId ? (materiales.find((m) => m.id === editandoId) ?? null) : null;
  const hijasAlta = alta?.familia_id ? (hijasPorPadreId[alta.familia_id] ?? []) : [];

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

  const cancelarFormulario = () => {
    setAlta(null);
    setEditandoId(null);
    setErrorAlta(null);
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
    setEditandoId(null);
    setAlta({
      clave: "",
      descripcion: "",
      unidad_id: unidad.id,
      familia_id,
      sub_familia_id,
      proveedor_id: null,
      merma_porcentaje: 0,
      marca: null,
    });
    setErrorAlta(null);
    setError(null);
  };

  const iniciarEdicion = (m: Material) => {
    setEditandoId(m.id);
    setAlta({
      clave: m.clave,
      descripcion: m.descripcion,
      unidad_id: m.unidad_id,
      familia_id: m.familia_id,
      sub_familia_id: m.sub_familia_id,
      proveedor_id: m.proveedor_id,
      merma_porcentaje: m.merma_porcentaje,
      marca: m.marca,
    });
    setErrorAlta(null);
    setError(null);
  };

  const guardarFormulario = async () => {
    if (!alta) return;
    if (!alta.clave.trim() || !alta.descripcion.trim() || !alta.unidad_id) {
      setErrorAlta("Clave, descripción y unidad son requeridos.");
      return;
    }
    setGuardandoAlta(true);
    setErrorAlta(null);
    const datos: MaterialData = {
      ...alta,
      clave: alta.clave.trim(),
      descripcion: alta.descripcion.trim(),
    };
    try {
      if (editandoId) {
        await updateMaterial(editandoId, datos);
        setSeleccionadoId(editandoId);
      } else {
        const creado = await createMaterial(datos);
        setBusqueda("");
        setMateriales((prev) => [...prev, creado]);
        setSeleccionadoId(creado.id);
      }
      cancelarFormulario();
      recargar();
    } catch (e) {
      setErrorAlta(String(e));
    } finally {
      setGuardandoAlta(false);
    }
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
          <SearchInput value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: Plus, titulo: "Nuevo material", onClick: agregar },
              {
                icono: Pencil,
                titulo: "Editar material seleccionado",
                onClick: () => materialSeleccionado && iniciarEdicion(materialSeleccionado),
                disabled: !materialSeleccionado,
              },
              {
                icono: DollarSign,
                titulo: panel === "precios" ? "Ocultar precios" : "Ver precios",
                onClick: () =>
                  setPanel((v) => {
                    if (v === "precios") return null;
                    return "precios";
                  }),
                disabled: !seleccionadoId && panel !== "precios",
              },
            ]}
            menu={[{ icono: RefreshCcw, titulo: "Recargar", onClick: recargar }]}
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
                        onClick={() => entrarFamilia(fam.id)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 py-1 pr-2 text-left text-[13px] text-muted-foreground hover:text-foreground",
                          (nodoActivo("familia", fam.id) ||
                            (pasillo.tipo === "subfamilia" && pasillo.familiaId === fam.id)) &&
                            "text-foreground",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <IconoFamilia size={24} className="shrink-0" />
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
              <div className="@container min-h-0 flex-1 overflow-auto p-2">
                <div className="grid grid-cols-2 gap-2 @min-[28rem]:grid-cols-3 @min-[40rem]:grid-cols-4">
                  {visibles.map((m) => {
                    const sinPrecio = !m.precio_vigente;
                    const seleccionado = m.id === seleccionadoId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSeleccionadoId(m.id)}
                        className={cn(
                          "flex flex-col rounded-md border border-border bg-card p-2 text-left hover:border-foreground/25 hover:bg-muted/40",
                          seleccionado && "border-primary ring-1 ring-primary",
                          sinPrecio && !seleccionado && "border-dashed",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate font-mono text-[11px] font-semibold">{m.clave}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {simboloPorUnidadId[m.unidad_id] ?? m.unidad_id}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-snug">{m.descripcion}</p>
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
                    onCerrar={() => setPanel(null)}
                    onPrecioRegistrado={recargar}
                  />
                ) : null}
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>

      <Sheet open={!!alta} onOpenChange={(open) => !open && cancelarFormulario()}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editandoId ? "Editar material" : "Nuevo material"}</SheetTitle>
          </SheetHeader>
          {alta && (
            <div className="flex flex-col gap-3 px-4">
              {errorAlta && <p className="text-xs text-destructive">{errorAlta}</p>}
              <Campo label="Clave">
                <input
                  autoFocus
                  value={alta.clave}
                  onChange={(e) => setAlta({ ...alta, clave: e.target.value })}
                  className={CAMPO_INPUT_CLASE}
                />
              </Campo>
              <Campo label="Descripción">
                <textarea
                  value={alta.descripcion}
                  onChange={(e) => setAlta({ ...alta, descripcion: e.target.value })}
                  rows={4}
                  className={cn(CAMPO_INPUT_CLASE, "resize-none")}
                />
              </Campo>
              <Campo label="Unidad">
                <Select value={alta.unidad_id} onValueChange={(v) => setAlta({ ...alta, unidad_id: v })}>
                  <SelectTrigger className={CAMPO_INPUT_CLASE}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ordenarPor(unidades, (u) => u.simbolo).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.simbolo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Familia">
                <Select
                  value={alta.familia_id ?? SIN_FAMILIA_VALOR}
                  onValueChange={(v) =>
                    setAlta({ ...alta, familia_id: v === SIN_FAMILIA_VALOR ? null : v, sub_familia_id: null })
                  }
                >
                  <SelectTrigger className={CAMPO_INPUT_CLASE}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_FAMILIA_VALOR}>— Sin familia —</SelectItem>
                    {ordenarPor(raices, (f) => f.nombre).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Sub familia">
                <Select
                  value={alta.sub_familia_id ?? SIN_SUBFAMILIA_VALOR}
                  onValueChange={(v) =>
                    setAlta({ ...alta, sub_familia_id: v === SIN_SUBFAMILIA_VALOR ? null : v })
                  }
                  disabled={hijasAlta.length === 0}
                >
                  <SelectTrigger className={cn(CAMPO_INPUT_CLASE, hijasAlta.length === 0 && "opacity-50")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_SUBFAMILIA_VALOR}>— Sin sub familia —</SelectItem>
                    {ordenarPor(hijasAlta, (h) => h.nombre).map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Proveedor">
                <Select
                  value={alta.proveedor_id ?? SIN_PROVEEDOR_VALOR}
                  onValueChange={(v) =>
                    setAlta({ ...alta, proveedor_id: v === SIN_PROVEEDOR_VALOR ? null : v })
                  }
                >
                  <SelectTrigger className={CAMPO_INPUT_CLASE}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_PROVEEDOR_VALOR}>— Sin proveedor —</SelectItem>
                    {ordenarPor(proveedores, (p) => p.razon_social).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.razon_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Marca">
                <input
                  value={alta.marca ?? ""}
                  onChange={(e) => setAlta({ ...alta, marca: e.target.value || null })}
                  className={CAMPO_INPUT_CLASE}
                />
              </Campo>
              <Campo label="Merma (%)">
                <PercentageInput
                  value={String(alta.merma_porcentaje ?? 0)}
                  onCommit={(v) => setAlta({ ...alta, merma_porcentaje: Number(v) || 0 })}
                  className={CAMPO_INPUT_CLASE}
                />
              </Campo>

              {editandoId && materialEditando && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
                  <span>Creado</span>
                  <span className="text-right">{formatearFecha(materialEditando.created_at)}</span>
                  <span>Creado por</span>
                  <span className="truncate text-right">
                    {nombresPorUsuarioId[materialEditando.created_by] ?? materialEditando.created_by}
                  </span>
                  <span>Actualizado</span>
                  <span className="text-right">
                    {materialEditando.updated_at ? formatearFecha(materialEditando.updated_at) : "—"}
                  </span>
                  <span>Actualizado por</span>
                  <span className="truncate text-right">
                    {materialEditando.updated_by
                      ? (nombresPorUsuarioId[materialEditando.updated_by] ?? materialEditando.updated_by)
                      : "—"}
                  </span>
                </div>
              )}
            </div>
          )}
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={cancelarFormulario}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardarFormulario()}
              disabled={guardandoAlta}
              className={cn(
                "rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90",
                guardandoAlta && "opacity-50",
              )}
            >
              {guardandoAlta ? "Guardando…" : "Guardar"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
