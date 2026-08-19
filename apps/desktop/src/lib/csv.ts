/** Filtro nativo de Tauri para el picker de CSV. */
export const FILTRO_CSV = [{ name: "CSV", extensions: ["csv"] }];

/** Recorta BOM UTF-8 y unifica saltos de línea. */
export function quitarBom(texto: string): string {
  return texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Encabezado comparable: minúsculas, sin acentos, sin BOM. */
export function normalizarEncabezado(texto: string): string {
  return texto
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Clave de cruce (descripciones, nombres) sin distinguir mayúsculas. */
export function claveTexto(texto: string): string {
  return texto.trim().toLowerCase();
}

/** Parte una línea CSV respetando comillas RFC 4180. */
export function partirCampos(linea: string): string[] {
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
 * "$420.76" / "420.76" / "1,234.56" → número finito. Se quedan dígitos,
 * punto y signo. `null` si no hay número.
 */
export function parsearNumero(texto: string): number | null {
  const limpio = texto.replace(/[^\d.-]/g, "");
  if (!limpio || limpio === "-" || limpio === ".") return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Igual que `parsearNumero`, pero exige `n > 0` (costos, salarios). */
export function parsearNumeroPositivo(texto: string): number | null {
  const n = parsearNumero(texto);
  if (n === null || n <= 0) return null;
  return n;
}

export interface CsvTabla {
  encabezados: string[];
  encabezadosNormalizados: string[];
  filas: string[][];
}

/**
 * Lee un CSV completo. Filas en blanco se descartan. Si no hay encabezado
 * o no hay filas de datos, `filas` queda vacío.
 */
export function parsearCsv(contenido: string): CsvTabla {
  const texto = quitarBom(contenido);
  const lineas = texto.split("\n").filter((l) => l.trim().length > 0);
  if (lineas.length === 0) {
    return { encabezados: [], encabezadosNormalizados: [], filas: [] };
  }
  const encabezados = partirCampos(lineas[0]);
  const encabezadosNormalizados = encabezados.map(normalizarEncabezado);
  const filas = lineas.slice(1).map(partirCampos);
  return { encabezados, encabezadosNormalizados, filas };
}

/** Índice de la primera columna cuyo encabezado normalizado coincide con alguno de `nombres`. */
export function indiceColumna(tabla: CsvTabla, ...nombres: string[]): number {
  const buscados = nombres.map(normalizarEncabezado);
  return tabla.encabezadosNormalizados.findIndex((h) => buscados.includes(h));
}

export function celda(fila: string[], indice: number): string {
  if (indice < 0) return "";
  return (fila[indice] ?? "").trim();
}

export function escaparCampo(valor: string): string {
  if (/[",\n\r]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export function generarCsv(encabezados: string[], filas: string[][]): string {
  const lineas = [encabezados.map(escaparCampo).join(",")];
  for (const fila of filas) {
    lineas.push(fila.map((c) => escaparCampo(c ?? "")).join(","));
  }
  return lineas.join("\n") + "\n";
}

export function plantillaCsv(columnas: string[]): string {
  return generarCsv(columnas, []);
}

/** Une bloques `MAESTRO` / `DETALLE` (u otras etiquetas) en un solo CSV. */
export function generarCsvConSecciones(
  secciones: { nombre: string; encabezados: string[]; filas: string[][] }[],
): string {
  return secciones
    .map((s) => `${s.nombre}\n${generarCsv(s.encabezados, s.filas).trimEnd()}`)
    .join("\n\n") + "\n";
}

/**
 * Parte un CSV de secciones (`MAESTRO` / `DETALLE` en una línea sola).
 * Las líneas vacías se ignoran; el resto se parsea como tabla de esa sección.
 */
export function parsearCsvConSecciones(contenido: string): {
  maestro?: CsvTabla;
  detalle?: CsvTabla;
} {
  const lineas = quitarBom(contenido).split("\n");
  const bloques: Record<string, string[]> = {};
  let actual: "maestro" | "detalle" | null = null;
  for (const linea of lineas) {
    const recortada = linea.trim();
    if (!recortada) continue;
    const campos = partirCampos(recortada);
    if (campos.length === 1) {
      const etiqueta = normalizarEncabezado(campos[0]);
      if (etiqueta === "maestro" || etiqueta === "detalle") {
        actual = etiqueta;
        if (!bloques[actual]) bloques[actual] = [];
        continue;
      }
    }
    if (actual) bloques[actual].push(linea);
  }
  const out: { maestro?: CsvTabla; detalle?: CsvTabla } = {};
  if (bloques.maestro?.length) out.maestro = parsearCsv(bloques.maestro.join("\n"));
  if (bloques.detalle?.length) out.detalle = parsearCsv(bloques.detalle.join("\n"));
  return out;
}

/** Convierte una fila de campos en un mapa encabezado-normalizado → valor. */
export function filaComoMapa(tabla: CsvTabla, fila: string[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (let i = 0; i < tabla.encabezadosNormalizados.length; i++) {
    mapa[tabla.encabezadosNormalizados[i]] = celda(fila, i);
  }
  return mapa;
}
