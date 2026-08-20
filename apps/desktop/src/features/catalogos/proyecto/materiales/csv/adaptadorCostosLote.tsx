import { useEffect, useState } from "react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import type { CsvAdapter, CsvExtraFieldsProps } from "@/components/csv/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validarCsvCostoMaterial, type ResultadoCsvCostoMaterial } from "@/lib/csvPrecioMaterial";
import { plantillaCsv } from "@/lib/csv";
import { createPreciosMaterialLote, listMonedas, listRegiones } from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type { Material, Moneda, PrecioLoteItem, Region } from "@/lib/types";
import { regionesVisibles } from "@/lib/types";

const NACIONAL = "Nacional";
const MONEDA_FALLBACK = "MXN";
const NACIONAL_VALOR = "__nacional__";

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function ExtraCamposCostosLote({ extra, setExtra }: CsvExtraFieldsProps) {
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);

  useEffect(() => {
    if (extra.fechaVigencia === undefined) {
      setExtra({ fechaVigencia: hoy(), moneda: MONEDA_FALLBACK, regionId: "" });
    }
    listRegiones().then(setRegiones).catch(() => {});
    listMonedas()
      .then((lista) => {
        setMonedas(lista);
        const moneda = extra.moneda as string | undefined;
        if (!moneda && lista.some((m) => m.codigo === MONEDA_FALLBACK)) {
          setExtra({ moneda: MONEDA_FALLBACK });
        } else if (!moneda && lista[0]) {
          setExtra({ moneda: lista[0].codigo });
        }
      })
      .catch(() => {});
    // Solo al montar el paso de revisión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moneda = String(extra.moneda ?? MONEDA_FALLBACK);
  const regionId = String(extra.regionId ?? "");
  const fechaVigencia = String(extra.fechaVigencia ?? hoy());

  return (
    <>
      <Field label="Moneda">
        <Select value={moneda} onValueChange={(v) => setExtra({ moneda: v })}>
          <SelectTrigger className={FIELD_INPUT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monedas.length === 0 && <SelectItem value={MONEDA_FALLBACK}>{MONEDA_FALLBACK}</SelectItem>}
            {ordenarPor(monedas, (m) => m.codigo).map((m) => (
              <SelectItem key={m.id} value={m.codigo}>
                {m.codigo} — {m.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Región">
        <Select value={regionId || NACIONAL_VALOR} onValueChange={(v) => setExtra({ regionId: v === NACIONAL_VALOR ? "" : v })}>
          <SelectTrigger className={FIELD_INPUT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NACIONAL_VALOR}>{NACIONAL} (default)</SelectItem>
            {ordenarPor(regionesVisibles(regiones), (r) => r.nombre).map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Vigente desde">
        <input
          type="date"
          value={fechaVigencia}
          onChange={(e) => setExtra({ fechaVigencia: e.target.value })}
          className={FIELD_INPUT_CLASS}
        />
      </Field>
    </>
  );
}

export function adaptadorCostosLote(materiales: Material[]): CsvAdapter {
  return {
    title: "Actualizar costos en lote",
    mode: "import",
    columns: [
      { name: "Descripción", required: true },
      { name: "Costo", required: true },
    ],
    policy: "partial",
    template: () => plantillaCsv(["Descripción", "Costo"]),
    defaultFile: "costos-materiales.csv",
    runningMessage: "Actualizando costos…",
    confirmLabel: "Actualizar",
    extraFields: (props) => <ExtraCamposCostosLote {...props} />,
    extraReady: (extra) => {
      if (!extra.moneda) return "Elige una moneda.";
      if (!extra.fechaVigencia) return "La fecha de vigencia es requerida.";
      return null;
    },
    preview: (content) => {
      const r = validarCsvCostoMaterial(content, materiales);
      const fatal = r.filas.length === 0 && r.errores.some((e) => e.includes("columnas") || e.includes("filas de datos"))
        ? r.errores[0]
        : r.filas.length === 0
          ? "Ningún material del archivo coincide con el catálogo."
          : undefined;
      const issues = [
        ...r.materialesNoRegistrados.map((m) => ({
          message: m,
          group: "No registrados (no se actualizarán)",
        })),
        ...r.errores.map((message) => ({ message, group: "Otras filas con problemas" })),
      ];
      return {
        ready: r.filas.length,
        skipped: r.materialesNoRegistrados.length + r.errores.filter((e) => !e.includes("columnas")).length,
        issues,
        warnings: [],
        fatal,
        payload: r,
      };
    },
    run: async (ctx, onProgress) => {
      const estado = ctx.preview.payload as ResultadoCsvCostoMaterial;
      const moneda = String(ctx.extra.moneda ?? "");
      const fechaVigencia = String(ctx.extra.fechaVigencia ?? "");
      const regionId = (ctx.extra.regionId as string) || null;
      const items: PrecioLoteItem[] = estado.filas.map((fila) => ({
        material_id: fila.materialId,
        precio: String(fila.costo),
        moneda,
        region_id: regionId,
        fecha_vigencia_desde: fechaVigencia,
      }));
      onProgress({ current: 0, total: items.length, message: "Actualizando costos…" });
      await createPreciosMaterialLote(items);
      onProgress({ current: items.length, total: items.length, message: "Actualizando costos…" });
      return {
        created: 0,
        updated: items.length,
        skipped: estado.materialesNoRegistrados.length,
        issues: [
          ...estado.materialesNoRegistrados.map((m) => ({
            message: m,
            group: "No registrados (no se actualizaron)",
          })),
          ...estado.errores.map((message) => ({ message, group: "Otras filas con problemas" })),
        ],
        warnings: [],
      };
    },
  };
}
