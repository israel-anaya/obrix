import { useEffect, useState } from "react";
import { CAMPO_INPUT_CLASE, Campo } from "@/components/Campo";
import type { CsvAdaptador, CsvExtraCamposProps } from "@/components/csv/tipos";
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

function ExtraCamposCostosLote({ extra, setExtra }: CsvExtraCamposProps) {
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
      <Campo label="Moneda">
        <Select value={moneda} onValueChange={(v) => setExtra({ moneda: v })}>
          <SelectTrigger className={CAMPO_INPUT_CLASE}>
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
      </Campo>
      <Campo label="Región">
        <Select value={regionId || NACIONAL_VALOR} onValueChange={(v) => setExtra({ regionId: v === NACIONAL_VALOR ? "" : v })}>
          <SelectTrigger className={CAMPO_INPUT_CLASE}>
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
      </Campo>
      <Campo label="Vigente desde">
        <input
          type="date"
          value={fechaVigencia}
          onChange={(e) => setExtra({ fechaVigencia: e.target.value })}
          className={CAMPO_INPUT_CLASE}
        />
      </Campo>
    </>
  );
}

export function adaptadorCostosLote(materiales: Material[]): CsvAdaptador {
  return {
    titulo: "Actualizar costos en lote",
    modo: "importar",
    columnas: [
      { nombre: "Descripción", obligatorio: true },
      { nombre: "Costo", obligatorio: true },
    ],
    politica: "parcial",
    plantilla: () => plantillaCsv(["Descripción", "Costo"]),
    archivoDefault: "costos-materiales.csv",
    mensajeEjecutando: "Actualizando costos…",
    etiquetaConfirmar: "Actualizar",
    extraCampos: (props) => <ExtraCamposCostosLote {...props} />,
    extraListo: (extra) => {
      if (!extra.moneda) return "Elige una moneda.";
      if (!extra.fechaVigencia) return "La fecha de vigencia es requerida.";
      return null;
    },
    previsualizar: (contenido) => {
      const r = validarCsvCostoMaterial(contenido, materiales);
      const fatal = r.filas.length === 0 && r.errores.some((e) => e.includes("columnas") || e.includes("filas de datos"))
        ? r.errores[0]
        : r.filas.length === 0
          ? "Ningún material del archivo coincide con el catálogo."
          : undefined;
      const problemas = [
        ...r.materialesNoRegistrados.map((m) => ({
          mensaje: m,
          grupo: "No registrados (no se actualizarán)",
        })),
        ...r.errores.map((mensaje) => ({ mensaje, grupo: "Otras filas con problemas" })),
      ];
      return {
        listos: r.filas.length,
        omitidos: r.materialesNoRegistrados.length + r.errores.filter((e) => !e.includes("columnas")).length,
        problemas,
        avisos: [],
        fatal,
        payload: r,
      };
    },
    ejecutar: async (ctx, onProgreso) => {
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
      onProgreso({ actual: 0, total: items.length, mensaje: "Actualizando costos…" });
      await createPreciosMaterialLote(items);
      onProgreso({ actual: items.length, total: items.length, mensaje: "Actualizando costos…" });
      return {
        creados: 0,
        actualizados: items.length,
        omitidos: estado.materialesNoRegistrados.length,
        problemas: [
          ...estado.materialesNoRegistrados.map((m) => ({
            mensaje: m,
            grupo: "No registrados (no se actualizaron)",
          })),
          ...estado.errores.map((mensaje) => ({ mensaje, grupo: "Otras filas con problemas" })),
        ],
        avisos: [],
      };
    },
  };
}
