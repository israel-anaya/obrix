import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ErrorFormula, evaluar, type Escalar } from "@/lib/formulaEngine";
import { buscarUsoRango, evaluarModelo, indiceRango, validarModelo, type ValoresEntrada } from "@/lib/modeloCalculo";
import type { CampoCalculado, Parametro, ValorRango } from "@/lib/types";

interface FilaPrueba {
  id: string;
  nombre: string;
  salarioNominal: number;
}

interface ResultadoPrueba {
  fila: FilaPrueba;
  scope: Record<string, Escalar> | null;
  rangos: Record<string, ValorRango> | null;
  error: string | null;
}

function fmt(valor: unknown, decimales = 2): string {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function FilaDato({ clave, etiqueta, valor, suma }: { clave: string; etiqueta: string; valor: string; suma?: boolean }) {
  return (
    <tr className={cn("border-b border-border/60", suma && "border-t border-border bg-muted/30 font-semibold")}>
      <td className="w-16 px-3 py-1 text-muted-foreground">{clave}</td>
      <td className="px-2 py-1">{etiqueta}</td>
      <td className="w-24 px-3 py-1 text-right num">{valor}</td>
    </tr>
  );
}

/**
 * Tabla de un parámetro tipo "rango": renglones configurados como columnas, más una fila por
 * cada categoría de prueba resaltando en qué renglón cayó y qué campo calculado la usó — genérico
 * para cualquier variable tipo "rango", no solo `tasa_cesantia_vejez`.
 */
function TablaRango({
  variable,
  calculados,
  resultadosPrueba,
}: {
  variable: Parametro;
  calculados: CampoCalculado[];
  resultadosPrueba: ResultadoPrueba[];
}) {
  const renglones = (variable.valor_default as ValorRango) ?? [];
  const uso = useMemo(() => buscarUsoRango(calculados, variable.id), [calculados, variable.id]);
  if (renglones.length === 0) return null;

  return (
    <div className="mt-6 overflow-hidden rounded border border-border">
      <div className="bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{variable.etiqueta}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-center">
            <th rowSpan={2} className="w-32 px-2 py-1.5 align-bottom font-medium">
              Rangos
            </th>
            {renglones.map((r, i) => (
              <th key={i} className="border-l border-border px-2 py-1 font-medium">
                {i > 0 && <div>{fmt(r.inferior)}</div>}
                {r.superior !== null && <div>{fmt(r.superior)}</div>}
              </th>
            ))}
            {uso && (
              <th rowSpan={2} className="border-l border-border px-2 py-1 align-bottom font-medium">
                Resultado ({uso.campoId})
              </th>
            )}
          </tr>
          <tr className="border-b border-border bg-muted/40 text-center">
            {renglones.map((r, i) => (
              <th key={i} className="border-l border-border px-2 py-1 font-normal text-muted-foreground">
                {fmt(r.valor, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {uso &&
            resultadosPrueba.map(({ fila, scope, rangos, error }) => {
              if (error || !scope || !rangos) {
                return (
                  <tr key={fila.id} className="border-b border-border/60 last:border-0">
                    <td colSpan={renglones.length + 2} className="px-2 py-1 text-destructive">
                      {error}
                    </td>
                  </tr>
                );
              }
              let valorEntrada: number | null = null;
              try {
                const evaluado = evaluar(uso.entrada, { scope, rangos });
                valorEntrada = typeof evaluado === "number" ? evaluado : null;
              } catch {
                valorEntrada = null;
              }
              const indice = valorEntrada !== null ? indiceRango(renglones, valorEntrada) : -1;
              return (
                <tr key={fila.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1" />
                  {renglones.map((r, i) => (
                    <td
                      key={i}
                      className={cn(
                        "border-l border-border px-2 py-1 text-right num",
                        i === indice && "bg-primary/15 font-semibold text-foreground",
                      )}
                    >
                      {i === indice ? fmt(r.valor, 3) : ""}
                    </td>
                  ))}
                  <td className="border-l border-border px-2 py-1 text-right num">{fmt(scope[uso.campoId])}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Contenido de la pestaña "Probar": corre el modelo de cálculo con filas de prueba
 * (categorías con distintos salarios nominales) y muestra desglose de días, cuotas
 * obrero-patronales y renglones de rango. Autocontenido para poder reutilizarse en
 * cualquier pantalla que ya tenga `parametros`/`calculados` a mano.
 */
export function PruebaModeloCalculo({ parametros, calculados }: { parametros: Parametro[]; calculados: CampoCalculado[] }) {
  const [filasPrueba, setFilasPrueba] = useState<FilaPrueba[]>([{ id: "1", nombre: "Categoría 1", salarioNominal: 400 }]);

  const errorValidacion = useMemo(() => validarModelo(parametros, calculados), [parametros, calculados]);

  const resultadosPrueba: ResultadoPrueba[] = useMemo(() => {
    if (errorValidacion) return [];
    return filasPrueba.map((fila) => {
      const valores: ValoresEntrada = {};
      for (const p of parametros) {
        valores[p.id] = p.id === "salario_nominal" ? fila.salarioNominal : (p.valor_default as never);
      }
      try {
        const resultado = evaluarModelo(parametros, calculados, valores);
        return { fila, scope: resultado.scope, rangos: resultado.rangos, error: null as string | null };
      } catch (e) {
        return { fila, scope: null, rangos: null, error: e instanceof ErrorFormula ? e.message : String(e) };
      }
    });
  }, [parametros, calculados, errorValidacion, filasPrueba]);

  // Los campos de "datos básicos" (días, Tp/Tl, FSBC, UMA) no dependen de salario_nominal,
  // así que se leen de la primera fila de prueba que haya evaluado bien en vez de disparar
  // una evaluación aparte con un salario ficticio (que puede fallar, p.ej. rango() con SBC=0).
  const resultadoBase = resultadosPrueba.find((r) => r.scope)?.scope ?? null;
  const parametrosRango = parametros.filter((p) => p.tipo === "rango");

  const agregarFilaPrueba = () =>
    setFilasPrueba((fs) => [...fs, { id: crypto.randomUUID(), nombre: `Categoría ${fs.length + 1}`, salarioNominal: 400 }]);
  const patchFilaPrueba = (id: string, patch: Partial<FilaPrueba>) =>
    setFilasPrueba((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {resultadoBase && (
        <div className="mb-6 overflow-hidden rounded border border-border">
          <div className="bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Datos básicos para el análisis del Factor de Salario Real
          </div>
          <table className="w-full text-xs">
            <tbody>
              <FilaDato clave="DICAL" etiqueta="Días calendario" valor={fmt(resultadoBase.dical)} />
              <FilaDato clave="DIAGI" etiqueta="Días de aguinaldo" valor={fmt(resultadoBase.diagi)} />
              <FilaDato clave="PIVAC" etiqueta="Días por prima vacacional" valor={fmt(resultadoBase.pivac)} />
              <FilaDato clave="" etiqueta="Días por prima adicional" valor={fmt(resultadoBase.prima_adicional_dias)} />
              <FilaDato clave="Tp" etiqueta="Total de días realmente pagados al año" valor={fmt(resultadoBase.tp)} suma />
              <FilaDato clave="DIDOM" etiqueta="Días de descanso obligatorio" valor={fmt(resultadoBase.didom)} />
              <FilaDato clave="DIVAC" etiqueta="Días de vacaciones" valor={fmt(resultadoBase.divac)} />
              <FilaDato clave="DIFEO" etiqueta="Días festivos por ley" valor={fmt(resultadoBase.difeo)} />
              <FilaDato clave="DIPEC" etiqueta="Días perdidos por clima (lluvia y otros)" valor={fmt(resultadoBase.dipec)} />
              <FilaDato clave="DIPCO" etiqueta="Días por costumbre" valor={fmt(resultadoBase.dipco)} />
              <FilaDato clave="DIPEN" etiqueta="Días por permisos y enfermedad no profesional" valor={fmt(resultadoBase.dipen)} />
              <FilaDato clave="DINLA" etiqueta="Días no laborados al año" valor={fmt(resultadoBase.dinla)} suma />
              <FilaDato clave="TI" etiqueta="Total de días realmente laborados al año (DICAL)-(DINLA)" valor={fmt(resultadoBase.tl)} suma />
              <FilaDato clave="Tp / TI" etiqueta="Días pagados / días laborados" valor={fmt(resultadoBase.tp_tl, 5)} suma />
              <FilaDato
                clave="FSBC"
                etiqueta="Factor de salario base de cotización (Tp/DICAL) para cálculo de IMSS"
                valor={fmt(resultadoBase.fsbc, 5)}
                suma
              />
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold">
            <span>Unidad de Medida y Actualización $</span>
            <span className="num">{fmt(resultadoBase.uma)}</span>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded border border-border">
        <div className="flex items-center justify-between bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <span>Tabla de salarios reales</span>
          <button
            type="button"
            onClick={agregarFilaPrueba}
            className="rounded p-0.5 hover:bg-primary-foreground/20"
            title="Agregar categoría"
          >
            <Plus size={14} />
          </button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-center">
              <th className="px-2 py-1.5 font-medium">Salario Nominal Diario "Sn"</th>
              <th className="px-2 py-1.5 font-medium">Salario Base de Cotización</th>
              <th className="px-2 py-1.5 font-medium">Tp/Tl</th>
              <th className="px-2 py-1.5 font-medium">Ps</th>
              <th className="px-2 py-1.5 font-medium">Fsr=Ps(Tp/Tl)+(Tp/Tl)</th>
              <th className="px-2 py-1.5 font-medium">Salario Real Sr = Sn × Fsr</th>
            </tr>
          </thead>
          <tbody>
            {resultadosPrueba.map(({ fila, scope, error }) => (
              <tr key={fila.id} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    value={fila.salarioNominal}
                    onChange={(e) => patchFilaPrueba(fila.id, { salarioNominal: Number(e.target.value) })}
                    className="campo-decimal h-7 text-right text-xs num"
                  />
                </td>
                {error ? (
                  <td colSpan={5} className="px-2 py-1 text-destructive">
                    {error}
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-1 text-right num">{fmt(scope?.monto_sbc)}</td>
                    <td className="px-2 py-1 text-right num">{fmt(scope?.tp_tl, 5)}</td>
                    <td className="px-2 py-1 text-right num">{fmt(scope?.ps, 5)}</td>
                    <td className="px-2 py-1 text-right num">{fmt(scope?.fsr, 6)}</td>
                    <td className="px-2 py-1 text-right font-medium num">{fmt(scope?.monto_salario_real)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-hidden rounded border border-border">
        <div className="bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Cuotas obrero-patronales
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-center">
              <th rowSpan={2} className="px-2 py-1.5 align-bottom font-medium">
                FSBC
              </th>
              <th rowSpan={2} className="px-2 py-1.5 align-bottom font-medium">
                Diferencia del SBC y 3 veces la UMA
              </th>
              <th colSpan={7} className="border-l border-border px-2 py-1 font-medium">
                Enfermedad y maternidad
              </th>
              <th rowSpan={2} className="border-l border-border px-2 py-1.5 align-bottom font-medium">
                Invalidez y vida
              </th>
              <th rowSpan={2} className="border-l border-border px-2 py-1.5 align-bottom font-medium">
                INFONAVIT
              </th>
              <th rowSpan={2} className="border-l border-border px-2 py-1.5 align-bottom font-medium">
                Impuesto Sobre Nómina
              </th>
            </tr>
            <tr className="border-b border-border bg-muted/40 text-center">
              <th className="border-l border-border px-2 py-1 font-medium">Cuota variable</th>
              <th className="px-2 py-1 font-medium">Cuota fija</th>
              <th className="px-2 py-1 font-medium">Prestaciones en especie pensionados</th>
              <th className="px-2 py-1 font-medium">Prestaciones en dinero</th>
              <th className="px-2 py-1 font-medium">Riesgo de trabajo</th>
              <th className="px-2 py-1 font-medium">Guarderías</th>
              <th className="px-2 py-1 font-medium">S.A.R.</th>
            </tr>
          </thead>
          <tbody>
            {resultadosPrueba.map(({ fila, scope, error }) =>
              error || !scope ? (
                <tr key={fila.id} className="border-b border-border/60 last:border-0">
                  <td colSpan={12} className="px-2 py-1 text-destructive">
                    {error}
                  </td>
                </tr>
              ) : (
                <tr key={fila.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1 text-right num">{fmt(scope.fsbc, 5)}</td>
                  <td className="px-2 py-1 text-right num">
                    {fmt((scope.monto_sbc as number) - (scope.monto_tres_uma as number))}
                  </td>
                  <td className="border-l border-border px-2 py-1 text-right num">{fmt(scope.monto_cuota_em_variable)}</td>
                  <td className="px-2 py-1 text-right num">{fmt(scope.monto_cuota_em_fija)}</td>
                  <td className="px-2 py-1 text-right num">{fmt(scope.monto_cuota_em_especie_pensionados)}</td>
                  <td className="px-2 py-1 text-right num">{fmt(scope.tasa_em_prestaciones_dinero)}</td>
                  <td className="px-2 py-1 text-right num">{fmt(scope.monto_cuota_riesgos_trabajo)}</td>
                  <td className="px-2 py-1 text-right num">{fmt(scope.monto_cuota_em_guarderias)}</td>
                  <td className="px-2 py-1 text-right num">{fmt(scope.monto_cuota_sar_retiro)}</td>
                  <td className="border-l border-border px-2 py-1 text-right num">{fmt(scope.monto_cuota_invalidez_vida)}</td>
                  <td className="border-l border-border px-2 py-1 text-right num">{fmt(scope.monto_cuota_infonavit)}</td>
                  <td className="border-l border-border px-2 py-1 text-right num">{fmt(scope.monto_cuota_isn)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {parametrosRango.map((v) => (
        <TablaRango key={v.id} variable={v} calculados={calculados} resultadosPrueba={resultadosPrueba} />
      ))}

      <div className="mt-6 overflow-hidden rounded border border-border">
        <div className="bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Suma prestaciones</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-center">
              <th className="px-2 py-1.5 font-medium">SP</th>
              <th className="border-l border-border px-2 py-1.5 font-medium">SP/SBC</th>
            </tr>
          </thead>
          <tbody>
            {resultadosPrueba.map(({ fila, scope, error }) =>
              error || !scope ? (
                <tr key={fila.id} className="border-b border-border/60 last:border-0">
                  <td colSpan={2} className="px-2 py-1 text-destructive">
                    {error}
                  </td>
                </tr>
              ) : (
                <tr key={fila.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1 text-right num">{fmt(scope.monto_sp)}</td>
                  <td className="border-l border-border px-2 py-1 text-right num">{fmt(scope.ps, 5)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
