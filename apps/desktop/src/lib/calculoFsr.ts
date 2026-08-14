import { ErrorFormula } from "@/lib/formulaEngine";
import { evaluarModelo, validarModelo, type ValoresEntrada } from "@/lib/modeloCalculo";
import type { FactorSalarioReal, ModeloCalculo } from "@/lib/types";

/**
 * Valores de entrada para evaluar el modelo de un FSR: los parámetros
 * capturados en `parametros_json`, con `salario_nominal` pisado por el
 * salario base que se está registrando. Los parámetros tipo `rango` no se
 * leen de aquí — `evaluarModelo` los toma de `valor_default` en el modelo.
 */
export function valoresParaCalculo(
  modelo: ModeloCalculo,
  parametrosJson: string,
  salarioNominal: number,
): ValoresEntrada {
  let capturados: ValoresEntrada = {};
  try {
    capturados = JSON.parse(parametrosJson);
  } catch {
    capturados = {};
  }
  const valores: ValoresEntrada = {};
  for (const p of modelo.parametros) {
    if (p.tipo === "rango") continue;
    valores[p.id] =
      p.id === "salario_nominal" ? salarioNominal : (capturados[p.id] ?? p.valor_default ?? (p.tipo === "booleano" ? false : 0));
  }
  return valores;
}

export type ResultadoCalculoSalario = { fsr: number; salarioReal: number } | { error: string };

/** Corre el modelo de cálculo del FSR con el salario nominal dado. */
export function calcularSalarioConFsr(factor: FactorSalarioReal, salarioNominal: number): ResultadoCalculoSalario {
  if (!Number.isFinite(salarioNominal) || salarioNominal <= 0) {
    return { error: "El salario nominal debe ser un número mayor a 0." };
  }
  try {
    const modelo: ModeloCalculo = JSON.parse(factor.modelo_calculo_json);
    const errorModelo = validarModelo(modelo.parametros, modelo.calculados);
    if (errorModelo) return { error: errorModelo };
    const valores = valoresParaCalculo(modelo, factor.parametros_json, salarioNominal);
    const resultado = evaluarModelo(modelo.parametros, modelo.calculados, valores);
    const fsr = resultado.scope.fsr;
    const salarioReal = resultado.scope.monto_salario_real;
    if (typeof fsr !== "number" || typeof salarioReal !== "number") {
      return { error: "El modelo de cálculo de este FSR no produjo fsr/monto_salario_real." };
    }
    return { fsr, salarioReal };
  } catch (e) {
    return { error: e instanceof ErrorFormula ? e.message : String(e) };
  }
}
