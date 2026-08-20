import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { ActionBarMenu } from "@/components/ActionBar";
import { SearchInput } from "@/components/SearchInput";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import { listCategoriasFasar, listFamiliasInsumo } from "@/lib/tauri";
import type { CategoriaFasar, FamiliaInsumo } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIN_SUBFAMILIA_ID = "";
const HORAS_POR_JORNADA = 8;
const DIAS_SEMANA = 7;
const DIAS_MES = 30;
const DIAS_ANIO = 365;

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

/**
 * Tabulador DIARIO/HORA/SEMANA/MES/AÑO derivado del salario real vigente de
 * cada oficio del escalafón (jornada de 8 horas, semana de 7 días). Es
 * lectura directa de `salario_real_diario` — no una tabla de referencia
 * fija, así que categorías sin vigencia se muestran sin proyección.
 */
export function CostoManoObraSeccion() {
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [familias, setFamilias] = useState<FamiliaInsumo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [gremioId, setGremioId] = useState<string | null>(null);

  const recargar = () => {
    setError(null);
    listCategoriasFasar().then(setCategorias).catch((e) => setError(String(e)));
    listFamiliasInsumo().then(setFamilias).catch((e) => setError(String(e)));
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

  const q = busqueda.trim().toLowerCase();
  const conteoPorSubfamilia = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const c of categorias) {
      if (!coincide(c, q)) continue;
      const id = c.sub_familia_id ?? SIN_SUBFAMILIA_ID;
      mapa[id] = (mapa[id] ?? 0) + 1;
    }
    return mapa;
  }, [categorias, q]);

  const gremios = useMemo(() => {
    const hijas = familias.filter((f) => f.parent_id !== null);
    const lista = hijas
      .map((f) => ({ id: f.id, nombre: f.nombre, n: conteoPorSubfamilia[f.id] ?? 0 }))
      .filter((g) => g.n > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const sin = conteoPorSubfamilia[SIN_SUBFAMILIA_ID] ?? 0;
    if (sin > 0) lista.push({ id: SIN_SUBFAMILIA_ID, nombre: "Sin subfamilia", n: sin });
    return lista;
  }, [familias, conteoPorSubfamilia]);

  const visibles = useMemo(() => {
    return categorias
      .filter((c) => coincide(c, q))
      .filter((c) => (gremioId === null ? true : (c.sub_familia_id ?? SIN_SUBFAMILIA_ID) === gremioId))
      .sort((a, b) => {
        const ra = parseMonto(a.salario_vigente?.salario_real_diario);
        const rb = parseMonto(b.salario_vigente?.salario_real_diario);
        if (ra === 0 && rb !== 0) return -1;
        if (rb === 0 && ra !== 0) return 1;
        if (ra !== rb) return ra - rb;
        return a.descripcion.localeCompare(b.descripcion, "es");
      });
  }, [categorias, q, gremioId]);

  const sinSalario = visibles.filter((c) => parseMonto(c.salario_vigente?.salario_real_diario) <= 0).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold">Costo de Mano de obra</h2>
          <p className={cn("truncate text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
            {error ?? `${visibles.length} oficios · ${sinSalario} sin salario · jornada de ${HORAS_POR_JORNADA} h`}
          </p>
          <SearchInput value={busqueda} onChange={setBusqueda} />
        </div>
        <ActionBarMenu menu={[{ icon: RefreshCcw, title: "Recargar", onClick: recargar }]} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full">
          <div className="flex w-44 shrink-0 flex-col border-r border-border">
            <div className="border-b border-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Gremios
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1 [scrollbar-gutter:stable]">
              <button
                type="button"
                onClick={() => setGremioId(null)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  gremioId === null && "bg-muted text-foreground",
                )}
              >
                <span>Todo el tabulador</span>
                <span className="num text-[11px]">{categorias.filter((c) => coincide(c, q)).length}</span>
              </button>
              {gremios.map((g) => (
                <button
                  key={g.id || "sin"}
                  type="button"
                  onClick={() => setGremioId(g.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    gremioId === g.id && "bg-muted text-foreground",
                  )}
                >
                  <span className="truncate">{g.nombre}</span>
                  <span className="num shrink-0 text-[11px]">{g.n}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
            {visibles.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {categorias.length === 0
                  ? "El tabulador está vacío. Cárgalo desde Tabuladores de Salario."
                  : "Nada coincide con el filtro actual."}
              </p>
            ) : (
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b border-border text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="border-r border-border px-2 py-1 text-left" rowSpan={2}>
                      Especialidad
                    </th>
                    <th className="border-r border-border px-2 py-1" rowSpan={2}>
                      Diario
                    </th>
                    <th className="border-r border-border px-2 py-1">SD / {HORAS_POR_JORNADA} Horas</th>
                    <th className="border-r border-border px-2 py-1">SD x {DIAS_SEMANA} Días</th>
                    <th className="border-r border-border px-2 py-1">SD x {DIAS_MES} Días</th>
                    <th className="px-2 py-1">SD x {DIAS_ANIO} Días</th>
                  </tr>
                  <tr className="border-b border-border text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="border-r border-border px-2 py-1">Hora</th>
                    <th className="border-r border-border px-2 py-1">Semana</th>
                    <th className="border-r border-border px-2 py-1">Mes</th>
                    <th className="px-2 py-1">Año</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c) => {
                    const diario = parseMonto(c.salario_vigente?.salario_real_diario);
                    const sinDato = diario <= 0;
                    return (
                      <tr key={c.id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="border-r border-border px-2 py-1">
                          <span>{c.descripcion}</span>
                          {c.sub_familia_id && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground">
                              {nombrePorFamiliaId[c.sub_familia_id] ?? ""}
                            </span>
                          )}
                        </td>
                        {sinDato ? (
                          <td colSpan={5} className="px-2 py-1 text-center text-[11px] text-amber-700 dark:text-amber-400">
                            Sin salario vigente
                          </td>
                        ) : (
                          <>
                            <td className="num border-r border-border px-2 py-1 text-right">{formatearDinero(diario)}</td>
                            <td className="num border-r border-border px-2 py-1 text-right">
                              {formatearDinero(diario / HORAS_POR_JORNADA)}
                            </td>
                            <td className="num border-r border-border px-2 py-1 text-right">
                              {formatearDinero(diario * DIAS_SEMANA)}
                            </td>
                            <td className="num border-r border-border px-2 py-1 text-right">
                              {formatearDinero(diario * DIAS_MES)}
                            </td>
                            <td className="num px-2 py-1 text-right">{formatearDinero(diario * DIAS_ANIO)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
