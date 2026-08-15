import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { DataGrid, type DataGridConfig, type DataGridHandle, type Row } from "@/components/grid/DataGrid";
import {
  createCuadrillaDetalle,
  deleteCuadrillaDetalle,
  listCategoriasFasar,
  listCuadrillaDetalles,
  listHerramientas,
  updateCuadrillaDetalle,
} from "@/lib/tauri";
import type { CategoriaFasar, Cuadrilla, CuadrillaDetalle, Herramienta } from "@/lib/types";
import { cn } from "@/lib/utils";

const ELEGIR_INTEGRANTE = "— Elige un integrante —";
const ELEGIR_HERRAMIENTA = "— Elige una herramienta —";

function fmt(valor: string, decimales = 2): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/**
 * Panel: composición de una `cuadrilla` — dos matrices planas (integrantes de
 * `categoria_fasar` y herramienta de `herramienta`, ver diccionario de
 * datos) más los tres subtotales que resultan de sumarlas. Cada alta/edición/
 * baja recalcula esos subtotales en el backend (`CuadrillaDetalleService::
 * recalcular`) — este panel solo refleja lo que vuelve de ahí, nunca calcula
 * un total por su cuenta. Pensado para vivir junto al grid de cuadrillas,
 * mismo patrón que `SalarioCategoriaFasarPanel`.
 */
export function CuadrillaDetallePanel({
  cuadrilla,
  onCerrar,
  onComposicionCambiada,
}: {
  cuadrilla: Cuadrilla | null;
  onCerrar: () => void;
  onComposicionCambiada?: () => void;
}) {
  const cuadrillaId = cuadrilla?.id ?? null;
  const integrantesRef = useRef<DataGridHandle>(null);
  const herramientaRef = useRef<DataGridHandle>(null);

  const [detalles, setDetalles] = useState<CuadrillaDetalle[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFasar[]>([]);
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [totales, setTotales] = useState<Cuadrilla | null>(cuadrilla);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    listCategoriasFasar().then(setCategorias).catch(() => {});
    listHerramientas().then(setHerramientas).catch(() => {});
  }, []);

  useEffect(() => {
    setTotales(cuadrilla);
  }, [cuadrilla]);

  const cargarDetalles = (id: string) =>
    listCuadrillaDetalles(id)
      .then(setDetalles)
      .catch((e) => setError(String(e)));

  // Igual que en `SalarioCategoriaFasarPanel`: se espera un momento a que la
  // selección se quede quieta antes de cargar, para que navegar con flechas
  // por el grid maestro no dispare una consulta por cada fila de paso.
  useEffect(() => {
    if (!cuadrillaId) {
      setDetalles([]);
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    const espera = setTimeout(() => {
      listCuadrillaDetalles(cuadrillaId)
        .then((r) => {
          if (!cancelado) setDetalles(r);
        })
        .catch((e) => {
          if (!cancelado) setError(String(e));
        })
        .finally(() => {
          if (!cancelado) setCargando(false);
        });
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [cuadrillaId]);

  // Toda mutación de la composición devuelve la cuadrilla recalculada — se
  // refleja aquí al instante (sin esperar al refresco del grid maestro) y
  // también se re-lee el detalle, porque el backend puede haber tocado el
  // costo de otras filas (ver `recalcular`), no solo la que se acaba de tocar.
  const trasMutar = async (cuadrillaActualizada: Cuadrilla) => {
    setTotales(cuadrillaActualizada);
    onComposicionCambiada?.();
    if (cuadrillaId) await cargarDetalles(cuadrillaId);
  };

  const opcionPorCategoriaId = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.id, `${c.clave} — ${c.descripcion}`])),
    [categorias],
  );
  const categoriaIdPorOpcion = useMemo(
    () => Object.fromEntries(categorias.map((c) => [`${c.clave} — ${c.descripcion}`, c.id])),
    [categorias],
  );
  const opcionPorHerramientaId = useMemo(
    () => Object.fromEntries(herramientas.map((h) => [h.id, `${h.clave} — ${h.descripcion}`])),
    [herramientas],
  );
  const herramientaIdPorOpcion = useMemo(
    () => Object.fromEntries(herramientas.map((h) => [`${h.clave} — ${h.descripcion}`, h.id])),
    [herramientas],
  );

  const integrantes = useMemo(() => detalles.filter((d) => d.tipo === "categoria_fasar"), [detalles]);
  const herramientaDetalles = useMemo(() => detalles.filter((d) => d.tipo === "equipo_herramienta"), [detalles]);

  const configIntegrantes: DataGridConfig = useMemo(
    () => ({
      title: "Integrantes",
      columns: [
        {
          field: "integrante",
          header: "Integrante (categoría FASAR)",
          width: 260,
          options: [ELEGIR_INTEGRANTE, ...categorias.map((c) => `${c.clave} — ${c.descripcion}`)],
        },
        { field: "cantidad", header: "Cantidad", width: 90, numeric: true },
        { field: "costo", header: "Salario real", width: 110, readOnly: true },
        { field: "importe", header: "Importe", width: 110, readOnly: true },
      ],
    }),
    [categorias],
  );

  const filasIntegrantes: Row[] = useMemo(
    () =>
      integrantes.map((d) => ({
        _id: d.id,
        integrante: opcionPorCategoriaId[d.detalle_insumo_id] ?? ELEGIR_INTEGRANTE,
        cantidad: Number(d.cantidad),
        costo: `$${fmt(d.costo)}`,
        importe: `$${fmt(d.importe)}`,
      })),
    [integrantes, opcionPorCategoriaId],
  );

  const configHerramienta: DataGridConfig = useMemo(
    () => ({
      title: "Herramienta",
      columns: [
        {
          field: "herramienta",
          header: "Herramienta",
          width: 260,
          options: [ELEGIR_HERRAMIENTA, ...herramientas.map((h) => `${h.clave} — ${h.descripcion}`)],
        },
        { field: "cantidad", header: "% mano de obra", width: 110, numeric: true, suffix: "%" },
        { field: "costo", header: "Base (mano de obra)", width: 140, readOnly: true },
        { field: "importe", header: "Importe", width: 110, readOnly: true },
      ],
    }),
    [herramientas],
  );

  const filasHerramienta: Row[] = useMemo(
    () =>
      herramientaDetalles.map((d) => ({
        _id: d.id,
        herramienta: opcionPorHerramientaId[d.detalle_insumo_id] ?? ELEGIR_HERRAMIENTA,
        cantidad: Number(d.cantidad),
        costo: `$${fmt(d.costo)}`,
        importe: `$${fmt(d.importe)}`,
      })),
    [herramientaDetalles, opcionPorHerramientaId],
  );

  if (!cuadrillaId) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground">Composición</h3>
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
        <p className="px-3 py-2 text-xs text-muted-foreground">Selecciona una cuadrilla para ver su composición.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-xs font-semibold text-muted-foreground">
            Composición{cuadrilla?.clave ? ` — ${cuadrilla.clave}` : ""}
          </h3>
          <button
            type="button"
            title="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
        {cuadrilla?.descripcion && <p className="mt-0.5 text-xs text-foreground">{cuadrilla.descripcion}</p>}
      </div>

      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <section className="flex min-h-0 flex-1 flex-col border-b border-border">
          <div className="flex items-center justify-between px-3 py-1.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Integrantes (mano de obra)
            </h4>
            <button
              type="button"
              title="Agregar integrante"
              onClick={() => integrantesRef.current?.addRow()}
              className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus size={13} />
              <span className="text-[11px]">Agregar</span>
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <DataGrid
              ref={integrantesRef}
              config={configIntegrantes}
              initialRows={filasIntegrantes}
              loading={cargando}
              onAddRow={(fila) => {
                const detalleInsumoId = categoriaIdPorOpcion[String(fila.integrante)];
                if (!detalleInsumoId) throw new Error("Elige un integrante válido.");
                return createCuadrillaDetalle(cuadrillaId, {
                  detalle_insumo_id: detalleInsumoId,
                  cantidad: String(fila.cantidad),
                }).then(trasMutar);
              }}
              onEditRow={(fila) => {
                const detalleInsumoId = categoriaIdPorOpcion[String(fila.integrante)];
                if (!detalleInsumoId) throw new Error("Elige un integrante válido.");
                return updateCuadrillaDetalle(fila._id, {
                  detalle_insumo_id: detalleInsumoId,
                  cantidad: String(fila.cantidad),
                }).then(trasMutar);
              }}
              onDeleteRows={async (ids) => {
                let resultado: Cuadrilla | null = null;
                for (const id of ids) {
                  resultado = await deleteCuadrillaDetalle(id);
                }
                if (resultado) await trasMutar(resultado);
              }}
              onSaveError={(mensaje) => setError(mensaje)}
              onSaveSuccess={() => setError(null)}
            />
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col border-b border-border">
          <div className="flex items-center justify-between px-3 py-1.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Herramienta</h4>
            <button
              type="button"
              title="Agregar herramienta"
              onClick={() => herramientaRef.current?.addRow()}
              className="flex items-center gap-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus size={13} />
              <span className="text-[11px]">Agregar</span>
            </button>
          </div>
          <p className="px-3 pb-1 text-[11px] text-muted-foreground">
            El % por default de cada herramienta se define en el catálogo Herramienta.
          </p>
          <div className="min-h-0 flex-1">
            <DataGrid
              ref={herramientaRef}
              config={configHerramienta}
              initialRows={filasHerramienta}
              loading={cargando}
              onAddRow={(fila) => {
                const detalleInsumoId = herramientaIdPorOpcion[String(fila.herramienta)];
                if (!detalleInsumoId) throw new Error("Elige una herramienta válida.");
                return createCuadrillaDetalle(cuadrillaId, {
                  detalle_insumo_id: detalleInsumoId,
                  cantidad: String(fila.cantidad),
                }).then(trasMutar);
              }}
              onEditRow={(fila) => {
                const detalleInsumoId = herramientaIdPorOpcion[String(fila.herramienta)];
                if (!detalleInsumoId) throw new Error("Elige una herramienta válida.");
                return updateCuadrillaDetalle(fila._id, {
                  detalle_insumo_id: detalleInsumoId,
                  cantidad: String(fila.cantidad),
                }).then(trasMutar);
              }}
              onDeleteRows={async (ids) => {
                let resultado: Cuadrilla | null = null;
                for (const id of ids) {
                  resultado = await deleteCuadrillaDetalle(id);
                }
                if (resultado) await trasMutar(resultado);
              }}
              onSaveError={(mensaje) => setError(mensaje)}
              onSaveSuccess={() => setError(null)}
            />
          </div>
        </section>

        <section className="shrink-0 p-3">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Totales</h4>
          <dl className="flex flex-col gap-1 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Mano de obra</dt>
              <dd className="font-medium tabular-nums">${totales ? fmt(totales.sub_total_mano_obra) : "0.00"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Herramienta</dt>
              <dd className="font-medium tabular-nums">${totales ? fmt(totales.sub_total_herramienta) : "0.00"}</dd>
            </div>
            <div className={cn("flex items-center justify-between border-t border-border pt-1")}>
              <dt className="font-semibold">Costo total</dt>
              <dd className="font-semibold tabular-nums">${totales ? fmt(totales.costo_total) : "0.00"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
