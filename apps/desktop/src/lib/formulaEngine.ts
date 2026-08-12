/**
 * Intérprete de expresiones para fórmulas definidas por el usuario (ver
 * `modeloCalculo.ts`). Sintaxis infija: + - * / %, comparaciones
 * <= < > >= == !=, lógicos && || !, funciones round/min/max/if/abs y el
 * helper de rango rango(id, valor). Sin dependencias de negocio — no sabe
 * nada de FASAR ni de ningún dominio en particular.
 */

export type Token =
  | { tipo: "numero"; valor: number }
  | { tipo: "texto"; valor: string }
  | { tipo: "identificador"; valor: string }
  | { tipo: "operador"; valor: string }
  | { tipo: "paren_abre" }
  | { tipo: "paren_cierra" }
  | { tipo: "coma" };

export class ErrorFormula extends Error {}

function tokenizar(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const OPERADORES_2 = ["<=", ">=", "==", "!=", "&&", "||"];
  while (i < formula.length) {
    const c = formula[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ tipo: "paren_abre" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ tipo: "paren_cierra" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ tipo: "coma" });
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const cierre = c;
      let j = i + 1;
      let texto = "";
      while (j < formula.length && formula[j] !== cierre) {
        texto += formula[j];
        j++;
      }
      if (j >= formula.length) throw new ErrorFormula(`Cadena sin cerrar en: ${formula}`);
      tokens.push({ tipo: "texto", valor: texto });
      i = j + 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < formula.length && /[0-9.]/.test(formula[j])) j++;
      const num = Number(formula.slice(i, j));
      if (Number.isNaN(num)) throw new ErrorFormula(`Número inválido en: ${formula}`);
      tokens.push({ tipo: "numero", valor: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < formula.length && /[a-zA-Z0-9_]/.test(formula[j])) j++;
      tokens.push({ tipo: "identificador", valor: formula.slice(i, j) });
      i = j;
      continue;
    }
    const dos = formula.slice(i, i + 2);
    if (OPERADORES_2.includes(dos)) {
      tokens.push({ tipo: "operador", valor: dos });
      i += 2;
      continue;
    }
    if ("+-*/%<>!".includes(c)) {
      tokens.push({ tipo: "operador", valor: c });
      i++;
      continue;
    }
    throw new ErrorFormula(`Carácter inesperado '${c}' en: ${formula}`);
  }
  return tokens;
}

export type Nodo =
  | { tipo: "numero"; valor: number }
  | { tipo: "booleano"; valor: boolean }
  | { tipo: "texto"; valor: string }
  | { tipo: "identificador"; nombre: string }
  | { tipo: "unario"; operador: string; operando: Nodo }
  | { tipo: "binario"; operador: string; izquierda: Nodo; derecha: Nodo }
  | { tipo: "llamada"; nombre: string; argumentos: Nodo[] };

const PRECEDENCIA: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private actual(): Token | undefined {
    return this.tokens[this.pos];
  }

  parse(): Nodo {
    const nodo = this.parseExpresion(0);
    if (this.pos < this.tokens.length) {
      throw new ErrorFormula("Token inesperado al final de la fórmula");
    }
    return nodo;
  }

  private parseExpresion(precedenciaMinima: number): Nodo {
    let izquierda = this.parseUnario();
    for (;;) {
      const tok = this.actual();
      if (!tok || tok.tipo !== "operador") break;
      const prec = PRECEDENCIA[tok.valor];
      if (prec === undefined || prec < precedenciaMinima) break;
      this.pos++;
      const derecha = this.parseExpresion(prec + 1);
      izquierda = { tipo: "binario", operador: tok.valor, izquierda, derecha };
    }
    return izquierda;
  }

  private parseUnario(): Nodo {
    const tok = this.actual();
    if (tok?.tipo === "operador" && (tok.valor === "-" || tok.valor === "!")) {
      this.pos++;
      return { tipo: "unario", operador: tok.valor, operando: this.parseUnario() };
    }
    return this.parsePrimario();
  }

  private parsePrimario(): Nodo {
    const tok = this.actual();
    if (!tok) throw new ErrorFormula("Fórmula incompleta");
    if (tok.tipo === "numero") {
      this.pos++;
      return { tipo: "numero", valor: tok.valor };
    }
    if (tok.tipo === "texto") {
      this.pos++;
      return { tipo: "texto", valor: tok.valor };
    }
    if (tok.tipo === "paren_abre") {
      this.pos++;
      const inner = this.parseExpresion(0);
      if (this.actual()?.tipo !== "paren_cierra") throw new ErrorFormula("Falta ')' en la fórmula");
      this.pos++;
      return inner;
    }
    if (tok.tipo === "identificador") {
      this.pos++;
      if (tok.valor === "true" || tok.valor === "false") {
        return { tipo: "booleano", valor: tok.valor === "true" };
      }
      if (this.actual()?.tipo === "paren_abre") {
        this.pos++;
        const argumentos: Nodo[] = [];
        if (this.actual()?.tipo !== "paren_cierra") {
          argumentos.push(this.parseExpresion(0));
          while (this.actual()?.tipo === "coma") {
            this.pos++;
            argumentos.push(this.parseExpresion(0));
          }
        }
        if (this.actual()?.tipo !== "paren_cierra") throw new ErrorFormula(`Falta ')' en la llamada a ${tok.valor}`);
        this.pos++;
        return { tipo: "llamada", nombre: tok.valor, argumentos };
      }
      return { tipo: "identificador", nombre: tok.valor };
    }
    throw new ErrorFormula("Token inesperado en la fórmula");
  }
}

export function parsearFormula(formula: string): Nodo {
  return new Parser(tokenizar(formula)).parse();
}

/** Un renglón de rango — ver `modeloCalculo.ts` para el tipo público `RangoRenglon`. */
export interface RangoRenglonEval {
  clasificacion: string;
  inferior: number;
  superior: number | null;
  valor: number;
}

const FUNCIONES_RANGO = new Set(["rango"]);

/**
 * Identificadores que la fórmula lee del scope: variables normales más, para
 * `rango(...)`, el id de la variable de rango (primer argumento, literal de
 * texto).
 */
export function identificadoresUsados(nodo: Nodo): Set<string> {
  const usados = new Set<string>();
  const visitar = (n: Nodo) => {
    switch (n.tipo) {
      case "identificador":
        usados.add(n.nombre);
        return;
      case "unario":
        visitar(n.operando);
        return;
      case "binario":
        visitar(n.izquierda);
        visitar(n.derecha);
        return;
      case "llamada":
        if (FUNCIONES_RANGO.has(n.nombre) && n.argumentos[0]?.tipo === "texto") {
          usados.add(n.argumentos[0].valor);
        }
        n.argumentos.forEach(visitar);
        return;
      default:
        return;
    }
  };
  visitar(nodo);
  return usados;
}

export type Escalar = number | boolean;

export interface ContextoEvaluacion {
  scope: Record<string, Escalar>;
  rangos: Record<string, RangoRenglonEval[]>;
}

function aNumero(v: Escalar, contexto: string): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v !== "number" || Number.isNaN(v)) throw new ErrorFormula(`Se esperaba un número en ${contexto}`);
  return v;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/** Primer renglón cuyo [inferior, superior] cubre `valor` (`superior === null` = sin límite superior). */
function resolverRango(renglones: RangoRenglonEval[], valor: number): RangoRenglonEval | undefined {
  return renglones.find((r) => valor >= r.inferior && (r.superior === null || valor <= r.superior));
}

export function evaluar(nodo: Nodo, contexto: ContextoEvaluacion): Escalar {
  switch (nodo.tipo) {
    case "numero":
      return nodo.valor;
    case "booleano":
      return nodo.valor;
    case "texto":
      throw new ErrorFormula("No se puede usar un texto como valor — solo como argumento de rango()");
    case "identificador": {
      if (!(nodo.nombre in contexto.scope)) throw new ErrorFormula(`Variable desconocida: '${nodo.nombre}'`);
      return contexto.scope[nodo.nombre];
    }
    case "unario": {
      if (nodo.operador === "-") return -aNumero(evaluar(nodo.operando, contexto), "operador unario -");
      return !evaluar(nodo.operando, contexto);
    }
    case "binario": {
      const { operador } = nodo;
      if (operador === "&&") return Boolean(evaluar(nodo.izquierda, contexto)) && Boolean(evaluar(nodo.derecha, contexto));
      if (operador === "||") return Boolean(evaluar(nodo.izquierda, contexto)) || Boolean(evaluar(nodo.derecha, contexto));
      const iz = evaluar(nodo.izquierda, contexto);
      const de = evaluar(nodo.derecha, contexto);
      if (operador === "==") return iz === de;
      if (operador === "!=") return iz !== de;
      const a = aNumero(iz, `operador '${operador}'`);
      const b = aNumero(de, `operador '${operador}'`);
      switch (operador) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return b === 0 ? 0 : a / b;
        case "%":
          return b === 0 ? 0 : a % b;
        case "<":
          return a < b;
        case "<=":
          return a <= b;
        case ">":
          return a > b;
        case ">=":
          return a >= b;
        default:
          throw new ErrorFormula(`Operador desconocido: ${operador}`);
      }
    }
    case "llamada": {
      const args = nodo.argumentos;
      switch (nodo.nombre) {
        case "round":
          return redondear(aNumero(evaluar(args[0], contexto), "round()"), aNumero(evaluar(args[1], contexto), "round()"));
        case "min":
          return Math.min(aNumero(evaluar(args[0], contexto), "min()"), aNumero(evaluar(args[1], contexto), "min()"));
        case "max":
          return Math.max(aNumero(evaluar(args[0], contexto), "max()"), aNumero(evaluar(args[1], contexto), "max()"));
        case "abs":
          return Math.abs(aNumero(evaluar(args[0], contexto), "abs()"));
        case "if":
          return Boolean(evaluar(args[0], contexto)) ? evaluar(args[1], contexto) : evaluar(args[2], contexto);
        case "rango": {
          if (args[0]?.tipo !== "texto") throw new ErrorFormula("rango() requiere el id de la variable de rango como texto ('...')");
          const renglones = contexto.rangos[args[0].valor];
          if (!renglones) throw new ErrorFormula(`No existe la variable de rango '${args[0].valor}'`);
          const entrada = aNumero(evaluar(args[1], contexto), "rango()");
          const renglon = resolverRango(renglones, entrada);
          if (!renglon) throw new ErrorFormula(`Ningún renglón de '${args[0].valor}' cubre el valor ${entrada}`);
          return renglon.valor;
        }
        default:
          throw new ErrorFormula(`Función desconocida: '${nodo.nombre}'`);
      }
    }
    default:
      throw new ErrorFormula("Nodo de fórmula desconocido");
  }
}

export function evaluarFormula(formula: string, contexto: ContextoEvaluacion): Escalar {
  return evaluar(parsearFormula(formula), contexto);
}
