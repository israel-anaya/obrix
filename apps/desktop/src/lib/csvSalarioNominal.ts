import type { CategoriaFasar } from "@/lib/types";
import { celda, claveTexto, indiceColumna, parsearCsv, parsearNumeroPositivo } from "@/lib/csv";

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

export const parsearSalarioNominal = parsearNumeroPositivo;

/**
 * Lee un CSV con columnas `Categoría` y `Salario Nominal` y lo cruza contra
 * las categorías del tabulador (por descripción, sin distinguir mayúsculas).
 * Si alguna fila no hace match, `ok` es false y no se debe continuar.
 */
export function validarCsvSalarioNominal(contenido: string, categorias: CategoriaFasar[]): ResultadoCsvSalarioNominal {
  const categoriasNoRegistradas: string[] = [];
  const errores: string[] = [];
  const fallido = (): ResultadoCsvSalarioNominal => ({ ok: false, categoriasNoRegistradas, errores });

  const tabla = parsearCsv(contenido);
  if (tabla.filas.length === 0) {
    errores.push("El archivo no tiene filas de datos.");
    return fallido();
  }

  const idxCategoria = indiceColumna(tabla, "Categoría", "categoria");
  const idxSalario = indiceColumna(tabla, "Salario Nominal");
  if (idxCategoria < 0 || idxSalario < 0) {
    errores.push('El CSV debe tener las columnas "Categoría" y "Salario Nominal".');
    return fallido();
  }

  const porNombre = new Map<string, CategoriaFasar>();
  for (const c of categorias) {
    const clave = claveTexto(c.descripcion);
    if (!porNombre.has(clave)) porNombre.set(clave, c);
  }

  const vistas = new Map<string, string>();
  const filas: FilaSalarioNominal[] = [];

  for (let i = 0; i < tabla.filas.length; i++) {
    const filaNro = i + 2;
    const categoria = celda(tabla.filas[i], idxCategoria);
    const salarioTexto = celda(tabla.filas[i], idxSalario);

    if (!categoria) {
      errores.push(`Fila ${filaNro}: categoría vacía.`);
      continue;
    }

    const clave = claveTexto(categoria);
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

    const salarioNominal = parsearNumeroPositivo(salarioTexto);
    if (salarioNominal === null) {
      errores.push(`Fila ${filaNro}: salario nominal "${salarioTexto}" no es un número válido.`);
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
