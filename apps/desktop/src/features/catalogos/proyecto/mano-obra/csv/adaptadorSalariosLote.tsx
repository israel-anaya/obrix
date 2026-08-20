import { useEffect, useMemo, useState } from "react";
import { FIELD_INPUT_CLASS, Field } from "@/components/Field";
import type { CsvAdapter, CsvExtraFieldsProps } from "@/components/csv/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcularSalarioConFsr } from "@/lib/calculoFsr";
import { plantillaCsv } from "@/lib/csv";
import { validarCsvSalarioNominal, type FilaSalarioNominal } from "@/lib/csvSalarioNominal";
import { createSalariosCategoriaFasarLote, listFactoresSalarioReal, listRegiones } from "@/lib/tauri";
import { ordenarPor } from "@/lib/ordenar";
import type { CategoriaFasar, FactorSalarioReal, Region, SalarioLoteItem } from "@/lib/types";
import { regionesVisibles } from "@/lib/types";

const NACIONAL = "Nacional";
const NACIONAL_VALOR = "__nacional__";

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function ExtraCamposSalariosLote({ extra, setExtra }: CsvExtraFieldsProps) {
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [factores, setFactores] = useState<FactorSalarioReal[]>([]);

  useEffect(() => {
    if (extra.fechaVigencia === undefined) {
      setExtra({ fechaVigencia: hoy(), regionId: "", factorId: "" });
    }
    listRegiones().then(setRegiones).catch(() => {});
    listFactoresSalarioReal().then(setFactores).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regionId = String(extra.regionId ?? "");
  const factorId = String(extra.factorId ?? "");
  const fechaVigencia = String(extra.fechaVigencia ?? hoy());

  const factoresDeRegion = useMemo(
    () => factores.filter((f) => (f.region_id ?? "") === regionId),
    [factores, regionId],
  );

  useEffect(() => {
    if (factorId && !factoresDeRegion.some((f) => f.id === factorId)) {
      setExtra({ factorId: "" });
    }
  }, [factoresDeRegion, factorId, setExtra]);

  const nombrePorRegionId = useMemo(
    () => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])),
    [regiones],
  );

  return (
    <>
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
      <Field label="Factor de Salario Real">
        <Select value={factorId} onValueChange={(v) => setExtra({ factorId: v })}>
          <SelectTrigger className={FIELD_INPUT_CLASS}>
            <SelectValue placeholder="— Elige un FSR —" />
          </SelectTrigger>
          <SelectContent>
            {ordenarPor(factoresDeRegion, (f) => f.nombre).map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nombre} ({f.region_id ? (nombrePorRegionId[f.region_id] ?? f.region_id) : NACIONAL})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {factoresDeRegion.length === 0 && (
          <p className="mt-0.5 text-[11px] text-destructive">
            No hay un FSR para {regionId ? (nombrePorRegionId[regionId] ?? regionId) : NACIONAL}.
          </p>
        )}
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

export function adaptadorSalariosLote(categorias: CategoriaFasar[]): CsvAdapter {
  return {
    title: "Actualizar salarios en lote",
    mode: "import",
    columns: [
      { name: "Categoría", required: true },
      { name: "Salario Nominal", required: true },
    ],
    policy: "strict",
    template: () => plantillaCsv(["Categoría", "Salario Nominal"]),
    defaultFile: "salarios-nominales.csv",
    runningMessage: "Actualizando salarios…",
    confirmLabel: "Actualizar",
    extraFields: (props) => <ExtraCamposSalariosLote {...props} />,
    extraReady: (extra, preview) => {
      if (preview.fatal || preview.issues.length > 0) return null;
      if (!extra.factorId) return "Elige un Factor de Salario Real.";
      if (!extra.fechaVigencia) return "La fecha de vigencia es requerida.";
      return null;
    },
    preview: (content) => {
      const r = validarCsvSalarioNominal(content, categorias);
      if (!r.ok) {
        const issues = [
          ...r.categoriasNoRegistradas.map((c) => ({
            message: c,
            group: "No registradas en el tabulador",
          })),
          ...r.errores.map((message) => ({ message, group: "Otros problemas" })),
        ];
        const fatal = r.errores.find((e) => e.includes("columnas") || e.includes("filas de datos"));
        return {
          ready: 0,
          skipped: r.categoriasNoRegistradas.length + r.errores.length,
          issues,
          warnings: [],
          fatal,
        };
      }
      return {
        ready: r.filas.length,
        skipped: 0,
        issues: [],
        warnings: [],
        payload: r.filas,
      };
    },
    run: async (ctx, onProgress) => {
      const filas = ctx.preview.payload as FilaSalarioNominal[];
      const factorId = String(ctx.extra.factorId ?? "");
      const fechaVigencia = String(ctx.extra.fechaVigencia ?? "");
      const regionId = (ctx.extra.regionId as string) || null;
      const factores = await listFactoresSalarioReal();
      const factor = factores.find((f) => f.id === factorId);
      if (!factor) throw new Error("El FSR elegido ya no está disponible.");

      const items: SalarioLoteItem[] = [];
      for (const fila of filas) {
        const calc = calcularSalarioConFsr(factor, fila.salarioNominal);
        if ("error" in calc) {
          throw new Error(`No se pudo calcular el FSR para "${fila.categoria}": ${calc.error}`);
        }
        items.push({
          insumo_id: fila.insumoId,
          salario_base_diario: String(fila.salarioNominal),
          factor_salario_real_id: factor.id,
          factor_salario_real: String(calc.fsr),
          salario_real_diario: String(calc.salarioReal),
          region_id: regionId,
          fecha_vigencia_desde: fechaVigencia,
        });
      }
      onProgress({ current: 0, total: items.length, message: "Actualizando salarios…" });
      await createSalariosCategoriaFasarLote(items);
      onProgress({ current: items.length, total: items.length, message: "Actualizando salarios…" });
      return {
        created: 0,
        updated: items.length,
        skipped: 0,
        issues: [],
        warnings: [],
      };
    },
  };
}
