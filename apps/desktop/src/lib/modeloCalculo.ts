import { identificadoresUsados, parsearFormula, evaluar, ErrorFormula, type Escalar, type Nodo } from "@/lib/formulaEngine";
import type { CampoCalculado, Parametro, RangoRenglon, ValorRango } from "@/lib/types";

/** Valores capturados para las variables de entrada de un modelo de cálculo (`parametros_json`). */
export type ValoresEntrada = Record<string, number | boolean | ValorRango>;

/** Identificador válido: minúsculas, dígitos y guión bajo, empieza con letra. */
export const RE_ID_VARIABLE = /^[a-z][a-z0-9_]*$/;

/**
 * Orden de evaluación de los campos calculados — las variables de entrada
 * (numero/booleano/rango) no tienen dependencias y quedan disponibles desde
 * el inicio. Kahn's algorithm; si sobran nodos al final hay un ciclo.
 */
export function ordenTopologico(calculados: CampoCalculado[]): { orden: string[] } | { error: string } {
  const idsCalculados = new Set(calculados.map((c) => c.id));
  const dependencias = new Map<string, Set<string>>();

  for (const c of calculados) {
    let deps: Set<string>;
    try {
      deps = identificadoresUsados(parsearFormula(c.formula ?? ""));
    } catch {
      deps = new Set();
    }
    dependencias.set(c.id, new Set([...deps].filter((d) => idsCalculados.has(d) && d !== c.id)));
  }

  const orden: string[] = [];
  const pendientes = new Set(idsCalculados);
  let progreso = true;
  while (pendientes.size > 0 && progreso) {
    progreso = false;
    for (const id of [...pendientes]) {
      const deps = dependencias.get(id) ?? new Set();
      if ([...deps].every((d) => orden.includes(d))) {
        orden.push(id);
        pendientes.delete(id);
        progreso = true;
      }
    }
  }
  if (pendientes.size > 0) {
    return { error: `Ciclo de dependencias entre: ${[...pendientes].join(", ")}` };
  }
  return { orden };
}

/**
 * Valida un modelo de cálculo completo: ids únicos y con formato válido, fórmulas
 * que parsean, identificadores que resuelven a variables declaradas, sin
 * ciclos, y presencia de las variables de convención `salario_nominal` (dato
 * de entrada) y `fsr`/`monto_salario_real` (salidas).
 */
export function validarModelo(parametros: Parametro[], calculados: CampoCalculado[]): string | null {
  if (parametros.length === 0 && calculados.length === 0) return "El modelo de cálculo debe tener al menos una variable.";

  const ids = new Set<string>();
  for (const v of [...parametros, ...calculados]) {
    if (!RE_ID_VARIABLE.test(v.id)) {
      return `Id inválido: '${v.id}' — usa minúsculas, dígitos y guión bajo, empezando con letra.`;
    }
    if (ids.has(v.id)) return `Id repetido: '${v.id}'.`;
    ids.add(v.id);
  }
  for (const c of calculados) {
    if (!c.formula?.trim()) return `La variable '${c.id}' es de tipo fórmula pero no tiene fórmula.`;
  }

  for (const c of calculados) {
    let usados: Set<string>;
    try {
      usados = identificadoresUsados(parsearFormula(c.formula ?? ""));
    } catch (e) {
      return `Fórmula inválida en '${c.id}': ${e instanceof Error ? e.message : String(e)}`;
    }
    for (const usado of usados) {
      if (!ids.has(usado)) return `La fórmula de '${c.id}' usa la variable desconocida '${usado}'.`;
    }
  }

  const orden = ordenTopologico(calculados);
  if ("error" in orden) return orden.error;

  if (!parametros.some((p) => p.id === "salario_nominal")) {
    return "Falta la variable de entrada 'salario_nominal' (el dato que se captura por trabajador).";
  }
  if (!calculados.some((c) => c.id === "fsr")) return "Falta la variable calculada 'fsr' (salida: Factor de Salario Real).";
  if (!calculados.some((c) => c.id === "monto_salario_real")) {
    return "Falta la variable calculada 'monto_salario_real' (salida: salario real diario).";
  }

  return null;
}

export interface ResultadoEvaluacion {
  scope: Record<string, Escalar>;
  rangos: Record<string, ValorRango>;
  orden: string[];
}

/**
 * Evalúa un modelo de cálculo completo dados los valores de entrada capturados
 * (`parametros_json` + el salario nominal de la calculadora). Lanza
 * `ErrorFormula` si alguna fórmula falla en tiempo de evaluación (ej. una
 * variable de rango referida no existe, o ningún renglón cubre el valor).
 */
export function evaluarModelo(parametros: Parametro[], calculados: CampoCalculado[], valoresEntrada: ValoresEntrada): ResultadoEvaluacion {
  const ordenResultado = ordenTopologico(calculados);
  if ("error" in ordenResultado) throw new ErrorFormula(ordenResultado.error);

  const scope: Record<string, Escalar> = {};
  const rangos: Record<string, ValorRango> = {};

  for (const p of parametros) {
    const valor = valoresEntrada[p.id] ?? p.valor_default;
    if (p.tipo === "rango") {
      rangos[p.id] = (valor as ValorRango) ?? [];
    } else {
      scope[p.id] = (valor as number | boolean) ?? (p.tipo === "booleano" ? false : 0);
    }
  }

  const porId = new Map(calculados.map((c) => [c.id, c]));
  const contexto = { scope, rangos };
  for (const id of ordenResultado.orden) {
    const c = porId.get(id)!;
    scope[id] = evaluar(parsearFormula(c.formula ?? ""), contexto);
  }

  return { scope, rangos, orden: ordenResultado.orden };
}

/** Uso de `rango(id, expr)` encontrado en una fórmula: qué campo lo usa y con qué expresión evalúa la entrada. */
export interface UsoRango {
  campoId: string;
  entrada: Nodo;
}

function buscarLlamadaRango(nodo: Nodo, rangoId: string): Nodo | null {
  switch (nodo.tipo) {
    case "unario":
      return buscarLlamadaRango(nodo.operando, rangoId);
    case "binario":
      return buscarLlamadaRango(nodo.izquierda, rangoId) ?? buscarLlamadaRango(nodo.derecha, rangoId);
    case "llamada":
      if (nodo.nombre === "rango" && nodo.argumentos[0]?.tipo === "texto" && nodo.argumentos[0].valor === rangoId) {
        return nodo.argumentos[1] ?? null;
      }
      for (const arg of nodo.argumentos) {
        const encontrado = buscarLlamadaRango(arg, rangoId);
        if (encontrado) return encontrado;
      }
      return null;
    default:
      return null;
  }
}

/**
 * Primer campo calculado cuya fórmula usa `rango(rangoId, ...)`, junto con la expresión de
 * entrada que evalúa contra ese rango — permite, para cualquier variable tipo "rango", mostrar
 * en qué renglón cae un caso concreto sin acoplarse a un id de campo en particular.
 */
export function buscarUsoRango(calculados: CampoCalculado[], rangoId: string): UsoRango | null {
  for (const c of calculados) {
    if (!c.formula) continue;
    let raiz: Nodo;
    try {
      raiz = parsearFormula(c.formula);
    } catch {
      continue;
    }
    const entrada = buscarLlamadaRango(raiz, rangoId);
    if (entrada) return { campoId: c.id, entrada };
  }
  return null;
}

/** Índice del primer renglón de `renglones` que cubre `valor`, o -1 si ninguno lo cubre. */
export function indiceRango(renglones: RangoRenglon[], valor: number): number {
  return renglones.findIndex((r) => valor >= r.inferior && (r.superior === null || valor <= r.superior));
}

/** Valida la forma de una variable de rango — mismas reglas para cualquier variable tipo `"rango"`. */
export function validarRango(renglones: RangoRenglon[]): string | null {
  if (renglones.length === 0) return "El rango no puede estar vacío.";
  let anterior = -Infinity;
  for (const r of renglones) {
    if (r.superior !== null && r.superior < r.inferior) {
      return `El renglón '${r.clasificacion || r.inferior}' tiene el límite superior menor que el inferior.`;
    }
    if (r.inferior < anterior) {
      return "Los renglones deben estar ordenados de menor a mayor por su límite inferior.";
    }
    anterior = r.inferior;
  }
  return null;
}
