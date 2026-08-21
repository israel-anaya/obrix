import { Fragment, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronRight, GlobeCheck, GripVertical, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FilterableCombobox } from "@/components/FilterableCombobox";
import { PercentageInput } from "@/components/PercentageInput";
import { QuantityInput } from "@/components/QuantityInput";
import type { useRowDrag } from "@/hooks/useRowDrag";
import { cn } from "@/lib/utils";
import { ChipDelta, FechaPrecioFrescura, MarcadorInsercion } from "./Indicadores";
import { fmt } from "./formato";

export interface FilaReceta {
  id: string;
  clave: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  rendimiento?: string;
  costo: string;
  importe: string;
  fechaPrecio: string | null;
  usaCostoNacional?: boolean;
  fechaSalarioVigente?: string | null;
}

/** Columnas activas en la tabla de receta — deben coincidir entre `TablaReceta` (thead) y cada `RecetaGrupoTabla` (tbody). */
export interface ColumnasReceta {
  mostrarNaturaleza?: boolean;
  mostrarRendimiento?: boolean;
}

export function totalColumnas(columnas: ColumnasReceta): number {
  // grip + clave + descripcion + unidad + cantidad + costo + importe + quitar
  return 8 + (columnas.mostrarNaturaleza ? 1 : 0) + (columnas.mostrarRendimiento ? 1 : 0);
}

/** Encabezado de la tabla completa: colgroup + thead, comunes a los tres dominios. */
export function TablaReceta({
  columnas,
  mostrarFechaPrecio,
  onToggleFechaPrecio,
  children,
}: {
  columnas: ColumnasReceta;
  mostrarFechaPrecio: boolean;
  onToggleFechaPrecio: () => void;
  children: ReactNode;
}) {
  return (
    <table className="w-full table-fixed border-collapse text-xs">
      <colgroup>
        <col className="w-6" />
        <col className="w-[98px]" />
        <col />
        {columnas.mostrarNaturaleza && <col className="w-8" />}
        <col className="w-[61px]" />
        {columnas.mostrarRendimiento && <col className="w-24" />}
        <col className="w-24" />
        <col className="w-24" />
        <col className="w-28" />
        <col className="w-6" />
      </colgroup>
      <thead>
        <tr className="text-xs font-semibold text-foreground">
          <th colSpan={2} className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Clave</th>
          <th className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Descripción</th>
          {columnas.mostrarNaturaleza && (
            <th className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center" title="Naturaleza">
              <span className="sr-only">Naturaleza</span>
            </th>
          )}
          <th className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Unidad</th>
          {columnas.mostrarRendimiento && (
            <th className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Rendimiento</th>
          )}
          <th className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Cantidad</th>
          <th className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">
            <span className="inline-flex items-center justify-center gap-1">
              Costo
              <button
                type="button"
                aria-pressed={mostrarFechaPrecio}
                title="Mostrar/ocultar fecha de precios"
                onClick={onToggleFechaPrecio}
                className={cn(
                  "rounded p-0.5 font-normal",
                  mostrarFechaPrecio ? "text-primary" : "text-muted-foreground/70 hover:text-foreground",
                )}
              >
                <CalendarDays size={16} className={mostrarFechaPrecio ? "fill-current" : undefined} />
              </button>
            </span>
          </th>
          <th colSpan={2} className="border border-foreground/30 bg-muted/40 py-1.5 px-2 text-center">Importe</th>
        </tr>
      </thead>
      {children}
    </table>
  );
}

/**
 * Un grupo de la receta (una sección de la tabla: material, mano de obra,
 * consumo, etc.) — renglones con drag-and-drop, edición inline de
 * cantidad/rendimiento y su fila de subtotal. Compartido por básico
 * auxiliar, cuadrilla y equipo de costo horario.
 */
export function RecetaGrupoTabla({
  titulo,
  Icono,
  color,
  filas,
  columnas,
  inputCantidad = "cantidad",
  agregando,
  onCerrarAgregar,
  opciones,
  onAgregar,
  onQuitar,
  onCommitCantidad,
  onCommitRendimiento,
  mostrarFechaPrecio,
  soportaFechaPrecio = true,
  mostrarDestello = false,
  destello,
  drag,
  colapsado,
  onToggleColapsado,
  subtotal,
  renderNaturaleza,
  nombreRegionVista,
}: {
  titulo: string;
  Icono: LucideIcon;
  color: string;
  filas: FilaReceta[];
  columnas: ColumnasReceta;
  inputCantidad?: "cantidad" | "porcentaje";
  agregando: boolean;
  onCerrarAgregar: () => void;
  opciones: { id: string; label: string }[];
  onAgregar: (id: string) => void;
  onQuitar: (fila: FilaReceta) => void;
  onCommitCantidad: (id: string, valor: string) => void;
  onCommitRendimiento?: (id: string, valor: string) => void;
  mostrarFechaPrecio: boolean;
  /** Algunos grupos (p. ej. herramienta de cuadrilla) no tienen fecha de precio que mostrar. */
  soportaFechaPrecio?: boolean;
  mostrarDestello?: boolean;
  destello: { ticket: number; total: number; filaId: string; fila: number } | null;
  drag: ReturnType<typeof useRowDrag>;
  colapsado: boolean;
  onToggleColapsado: () => void;
  subtotal: string;
  renderNaturaleza?: (fila: FilaReceta) => ReactNode;
  nombreRegionVista?: string | null;
}) {
  if (filas.length === 0 && !agregando) return null;
  const nCols = totalColumnas(columnas);
  const colSpanSubtotal = nCols - 2;
  const verFechaPrecio = mostrarFechaPrecio && soportaFechaPrecio;

  return (
    <tbody>
      <tr>
        <td colSpan={nCols} className="pt-3 pb-1 first:pt-2">
          <button
            type="button"
            onClick={onToggleColapsado}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            {colapsado ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
            <Icono size={16} className={color} />
            {titulo}
            {colapsado && filas.length > 0 && (
              <span className="normal-case tracking-normal text-muted-foreground/70">({filas.length})</span>
            )}
          </button>
        </td>
      </tr>
      {colapsado ? null : (
        <>
          {filas.length === 0 && !agregando && (
            <tr>
              <td colSpan={nCols} className="py-1.5 text-muted-foreground">
                Sin renglones todavía.
              </td>
            </tr>
          )}
          {filas.map((f, i) => (
            <Fragment key={f.id}>
              {drag.gap === i && <MarcadorInsercion colSpan={nCols} />}
              <tr className={cn("group border-b border-border/50 hover:bg-muted/30", drag.rowClass(f.id))} {...drag.rowProps(f.id)}>
                <td className="py-1 pr-1">
                  <span
                    title="Arrastra para reordenar"
                    className="inline-flex cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                    {...drag.handleProps(f.id)}
                  >
                    <GripVertical size={16} />
                  </span>
                </td>
                <td className="py-1 pr-2 font-mono text-muted-foreground">{f.clave}</td>
                <td className="py-1 px-2">
                  <span className="line-clamp-2 break-words" title={f.descripcion}>
                    {f.descripcion}
                  </span>
                </td>
                {columnas.mostrarNaturaleza && <td className="py-1 pr-2">{renderNaturaleza?.(f)}</td>}
                <td className="py-1 px-2 text-left text-muted-foreground">{f.unidad}</td>
                {columnas.mostrarRendimiento && (
                  <td className="py-1 pr-2 text-right">
                    <QuantityInput
                      value={f.rendimiento ?? "0"}
                      onCommit={(v) => onCommitRendimiento?.(f.id, v)}
                      decimals={6}
                      className="w-24 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
                    />
                  </td>
                )}
                <td className="py-1 pr-2 text-right">
                  {inputCantidad === "porcentaje" ? (
                    <PercentageInput
                      value={f.cantidad}
                      onCommit={(v) => onCommitCantidad(f.id, v)}
                      decimals={2}
                      className="w-16 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
                    />
                  ) : (
                    <QuantityInput
                      value={f.cantidad}
                      onCommit={(v) => onCommitCantidad(f.id, v)}
                      decimals={6}
                      className="w-24 border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background"
                    />
                  )}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
                  <div className="inline-flex items-center justify-end gap-1">
                    {f.usaCostoNacional && nombreRegionVista ? (
                      <span title={`Costo nacional (sin costo en ${nombreRegionVista})`}>
                        <GlobeCheck size={16} className="shrink-0 text-primary" aria-label="Costo nacional" />
                      </span>
                    ) : null}
                    <span>${fmt(f.costo)}</span>
                  </div>
                  {verFechaPrecio && f.fechaPrecio ? (
                    <FechaPrecioFrescura fecha={f.fechaPrecio} fechaSalarioVigente={f.fechaSalarioVigente} />
                  ) : null}
                </td>
                <td
                  className={cn(
                    "w-28 py-1 pr-0 text-right font-medium tabular-nums transition-colors duration-700",
                    destello?.filaId === f.id && destello.fila > 0 && "bg-emerald-500/20",
                    destello?.filaId === f.id && destello.fila < 0 && "bg-rose-500/20",
                  )}
                >
                  <span className="inline-flex items-baseline justify-end gap-1">
                    {mostrarDestello && destello?.filaId === f.id && (
                      <ChipDelta key={destello.ticket} valor={destello.fila} className="text-[10px]" />
                    )}
                    ${fmt(f.importe)}
                  </span>
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    title="Quitar"
                    onClick={() => onQuitar(f)}
                    className="rounded p-0.5 text-destructive opacity-0 pointer-events-none transition-opacity hover:bg-destructive/10 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                  >
                    <X size={16} />
                  </button>
                </td>
              </tr>
              {drag.gap === filas.length && i === filas.length - 1 && <MarcadorInsercion colSpan={nCols} />}
            </Fragment>
          ))}
          {agregando && (
            <tr>
              <td colSpan={nCols} className="pt-1.5">
                <FilterableCombobox
                  options={opciones}
                  onSelect={(id) => {
                    onCerrarAgregar();
                    if (id) onAgregar(id);
                  }}
                  onCancel={onCerrarAgregar}
                />
              </td>
            </tr>
          )}
        </>
      )}
      {filas.length > 0 && (
        <tr className="border-t-2 border-foreground/20">
          <td colSpan={colSpanSubtotal} className="py-1.5 pr-3 text-right">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Subtotal {titulo.toLowerCase()}
            </span>
          </td>
          <td className="w-28 py-1.5 pr-0 text-right font-semibold tabular-nums">${fmt(subtotal)}</td>
          <td />
        </tr>
      )}
    </tbody>
  );
}
