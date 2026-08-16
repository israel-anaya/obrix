import type { Material } from "@/lib/types";

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

const COL_DESCRIPCION = "descripcion";
const COL_COSTO = "costo";

function normalizarEncabezado(texto: string): string {
  return texto
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function claveDescripcion(texto: string): string {
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
 * materiales y la actualización de salarios en lote: se quedan dígitos,
 * punto y signo.
 */
export function parsearCosto(texto: string): number | null {
  const limpio = texto.replace(/[^\d.-]/g, "");
  if (!limpio || limpio === "-" || limpio === ".") return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

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

  const texto = contenido.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lineas = texto.split("\n").filter((l) => l.trim().length > 0);
  if (lineas.length < 2) {
    errores.push("El archivo no tiene filas de datos.");
    return { filas, materialesNoRegistrados, errores };
  }

  const encabezados = partirCampos(lineas[0]).map(normalizarEncabezado);
  const idxDescripcion = encabezados.indexOf(COL_DESCRIPCION);
  const idxCosto = encabezados.indexOf(COL_COSTO);
  if (idxDescripcion < 0 || idxCosto < 0) {
    errores.push('El CSV debe tener las columnas "Descripción" y "Costo".');
    return { filas, materialesNoRegistrados, errores };
  }

  const porDescripcion = new Map<string, Material>();
  for (const m of materiales) {
    const clave = claveDescripcion(m.descripcion);
    if (!porDescripcion.has(clave)) porDescripcion.set(clave, m);
  }

  const vistas = new Map<string, string>();

  for (let i = 1; i < lineas.length; i++) {
    const filaNro = i + 1;
    const campos = partirCampos(lineas[i]);
    const descripcion = (campos[idxDescripcion] ?? "").trim();
    const costoTexto = campos[idxCosto] ?? "";

    if (!descripcion) {
      errores.push(`Fila ${filaNro}: descripción vacía.`);
      continue;
    }

    const clave = claveDescripcion(descripcion);
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

    const costo = parsearCosto(costoTexto);
    if (costo === null) {
      errores.push(`Fila ${filaNro}: costo "${costoTexto.trim()}" no es un número válido.`);
      continue;
    }

    filas.push({ descripcion: registrado.descripcion, costo, materialId: registrado.id });
  }

  return { filas, materialesNoRegistrados, errores };
}
