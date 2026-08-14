import type { CategoriaFasar } from "@/lib/types";

export interface FilaSalarioNominal {
  categoria: string;
  salarioNominal: number;
  insumoId: string;
}

export type ResultadoCsvSalarioNominal =
  | { ok: true; filas: FilaSalarioNominal[] }
  | {
      ok: false;
      /** Categorías del CSV que no existen en el tabulador. */
      categoriasNoRegistradas: string[];
      /** Otros problemas (columnas, salario inválido, duplicados, vacío). */
      errores: string[];
    };

const COL_CATEGORIA = "categoria";
const COL_SALARIO = "salario nominal";

function normalizarEncabezado(texto: string): string {
  return texto
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function claveCategoria(texto: string): string {
  return texto.trim().toLowerCase();
}

/** Parte una línea CSV respetando comillas simples de campo. */
function partirCampos(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        actual += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ",") {
      campos.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

/**
 * "$420.76" / "420.76" / "1,234.56" → número. Misma idea que el import de
 * materiales: se quedan dígitos, punto y signo.
 */
export function parsearSalarioNominal(texto: string): number | null {
  const limpio = texto.replace(/[^\d.-]/g, "");
  if (!limpio || limpio === "-" || limpio === ".") return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Lee un CSV con columnas `Categoría` y `Salario Nominal` y lo cruza contra
 * las categorías del tabulador (por descripción, sin distinguir mayúsculas).
 * Si alguna fila no hace match, `ok` es false y no se debe continuar.
 */
export function validarCsvSalarioNominal(contenido: string, categorias: CategoriaFasar[]): ResultadoCsvSalarioNominal {
  const categoriasNoRegistradas: string[] = [];
  const errores: string[] = [];
  const fallido = (): ResultadoCsvSalarioNominal => ({ ok: false, categoriasNoRegistradas, errores });

  const texto = contenido.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lineas = texto.split("\n").filter((l) => l.trim().length > 0);
  if (lineas.length < 2) {
    errores.push("El archivo no tiene filas de datos.");
    return fallido();
  }

  const encabezados = partirCampos(lineas[0]).map(normalizarEncabezado);
  const idxCategoria = encabezados.indexOf(COL_CATEGORIA);
  const idxSalario = encabezados.indexOf(COL_SALARIO);
  if (idxCategoria < 0 || idxSalario < 0) {
    errores.push('El CSV debe tener las columnas "Categoría" y "Salario Nominal".');
    return fallido();
  }

  const porNombre = new Map<string, CategoriaFasar>();
  for (const c of categorias) {
    const clave = claveCategoria(c.descripcion);
    if (!porNombre.has(clave)) porNombre.set(clave, c);
  }

  const vistas = new Map<string, string>();
  const filas: FilaSalarioNominal[] = [];

  for (let i = 1; i < lineas.length; i++) {
    const filaNro = i + 1;
    const campos = partirCampos(lineas[i]);
    const categoria = (campos[idxCategoria] ?? "").trim();
    const salarioTexto = campos[idxSalario] ?? "";

    if (!categoria) {
      errores.push(`Fila ${filaNro}: categoría vacía.`);
      continue;
    }

    const clave = claveCategoria(categoria);
    const anterior = vistas.get(clave);
    if (anterior) {
      errores.push(`Fila ${filaNro}: la categoría "${categoria}" está duplicada (también en "${anterior}").`);
      continue;
    }
    vistas.set(clave, categoria);

    const registrada = porNombre.get(clave);
    if (!registrada) {
      categoriasNoRegistradas.push(categoria);
      continue;
    }

    const salarioNominal = parsearSalarioNominal(salarioTexto);
    if (salarioNominal === null) {
      errores.push(`Fila ${filaNro}: salario nominal "${salarioTexto.trim()}" no es un número válido.`);
      continue;
    }

    filas.push({ categoria: registrada.descripcion, salarioNominal, insumoId: registrada.id });
  }

  if (categoriasNoRegistradas.length > 0 || errores.length > 0) {
    return fallido();
  }
  if (filas.length === 0) {
    errores.push("El archivo no tiene filas de datos.");
    return fallido();
  }
  return { ok: true, filas };
}
