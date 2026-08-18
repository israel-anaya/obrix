import type { Material } from "@/lib/types";
import { celda, claveTexto, indiceColumna, parsearCsv, parsearNumeroPositivo } from "@/lib/csv";

export interface FilaCostoMaterial {
  descripcion: string;
  costo: number;
  materialId: string;
}

export interface ResultadoCsvCostoMaterial {
  /** Filas que sí matchearon contra el catálogo y tienen un costo válido — listas para aplicar. */
  filas: FilaCostoMaterial[];
  /** Descripciones del CSV que no existen en el catálogo — se avisan, no bloquean el resto. */
  materialesNoRegistrados: string[];
  /** Otros problemas por fila (costo inválido, duplicados, descripción vacía) — tampoco bloquean el resto. */
  errores: string[];
}

export const parsearCosto = parsearNumeroPositivo;

/**
 * Lee un CSV con columnas `Descripción` y `Costo` y lo cruza contra los
 * materiales del catálogo (por descripción, sin distinguir mayúsculas). A
 * diferencia de la actualización de salarios, aquí no se exige match al
 * 100%: lo que matchea queda listo para aplicarse, y lo que no (material no
 * registrado, costo inválido, fila duplicada o vacía) se reporta sin
 * bloquear el resto.
 */
export function validarCsvCostoMaterial(contenido: string, materiales: Material[]): ResultadoCsvCostoMaterial {
  const materialesNoRegistrados: string[] = [];
  const errores: string[] = [];
  const filas: FilaCostoMaterial[] = [];

  const tabla = parsearCsv(contenido);
  if (tabla.filas.length === 0) {
    errores.push("El archivo no tiene filas de datos.");
    return { filas, materialesNoRegistrados, errores };
  }

  const idxDescripcion = indiceColumna(tabla, "Descripción", "descripcion");
  const idxCosto = indiceColumna(tabla, "Costo");
  if (idxDescripcion < 0 || idxCosto < 0) {
    errores.push('El CSV debe tener las columnas "Descripción" y "Costo".');
    return { filas, materialesNoRegistrados, errores };
  }

  const porDescripcion = new Map<string, Material>();
  for (const m of materiales) {
    const clave = claveTexto(m.descripcion);
    if (!porDescripcion.has(clave)) porDescripcion.set(clave, m);
  }

  const vistas = new Map<string, string>();

  for (let i = 0; i < tabla.filas.length; i++) {
    const filaNro = i + 2;
    const descripcion = celda(tabla.filas[i], idxDescripcion);
    const costoTexto = celda(tabla.filas[i], idxCosto);

    if (!descripcion) {
      errores.push(`Fila ${filaNro}: descripción vacía.`);
      continue;
    }

    const clave = claveTexto(descripcion);
    const anterior = vistas.get(clave);
    if (anterior) {
      errores.push(`Fila ${filaNro}: el material "${descripcion}" está duplicado (también en "${anterior}").`);
      continue;
    }
    vistas.set(clave, descripcion);

    const registrado = porDescripcion.get(clave);
    if (!registrado) {
      materialesNoRegistrados.push(descripcion);
      continue;
    }

    const costo = parsearNumeroPositivo(costoTexto);
    if (costo === null) {
      errores.push(`Fila ${filaNro}: costo "${costoTexto}" no es un número válido.`);
      continue;
    }

    filas.push({ descripcion: registrado.descripcion, costo, materialId: registrado.id });
  }

  return { filas, materialesNoRegistrados, errores };
}
