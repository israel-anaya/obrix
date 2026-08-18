import type { ReactNode } from "react";

export type CsvPolitica = "parcial" | "estricto";
export type CsvModo = "importar" | "exportar";

export interface CsvColumna {
  nombre: string;
  obligatorio: boolean;
}

export interface CsvProblema {
  mensaje: string;
  grupo?: string;
}

export interface CsvPrevisualizacion {
  listos: number;
  omitidos: number;
  problemas: CsvProblema[];
  avisos: string[];
  /** Si está, no se puede continuar (columnas ausentes, archivo vacío, etc.). */
  fatal?: string;
  /** Datos ya parseados que `ejecutar` reutiliza. */
  payload?: unknown;
}

export interface CsvProgreso {
  actual: number;
  total: number | null;
  mensaje: string;
}

export interface CsvResultado {
  creados: number;
  actualizados: number;
  omitidos: number;
  problemas: CsvProblema[];
  avisos: string[];
  /** Ruta del archivo escrito (export o reporte). */
  ruta?: string;
}

export interface CsvContextoEjecucion {
  contenido: string;
  path: string | null;
  preview: CsvPrevisualizacion;
  extra: Record<string, unknown>;
}

export interface CsvExtraCamposProps {
  extra: Record<string, unknown>;
  setExtra: (patch: Record<string, unknown>) => void;
  preview: CsvPrevisualizacion;
}

export interface CsvAdaptador {
  titulo: string;
  modo: CsvModo;
  columnas: CsvColumna[];
  politica: CsvPolitica;
  plantilla?: () => string;
  archivoDefault?: string;
  mensajeEjecutando?: string;
  etiquetaConfirmar?: string;
  /** Import: lee el archivo y arma conteos / errores de fila. */
  previsualizar?: (contenido: string) => CsvPrevisualizacion | Promise<CsvPrevisualizacion>;
  /** Export: conteo sin archivo de entrada. */
  previsualizarExport?: () => CsvPrevisualizacion | Promise<CsvPrevisualizacion>;
  extraCampos?: (props: CsvExtraCamposProps) => ReactNode;
  /** `null` si los extra están listos; si no, mensaje para deshabilitar Continuar. */
  extraListo?: (extra: Record<string, unknown>, preview: CsvPrevisualizacion) => string | null;
  ejecutar: (
    ctx: CsvContextoEjecucion,
    onProgreso: (p: CsvProgreso) => void,
  ) => Promise<CsvResultado>;
}

export function resultadoVacio(): CsvResultado {
  return { creados: 0, actualizados: 0, omitidos: 0, problemas: [], avisos: [] };
}

export function problemasDeTextos(textos: string[], grupo?: string): CsvProblema[] {
  return textos.map((mensaje) => (grupo ? { mensaje, grupo } : { mensaje }));
}

/** El usuario cerró el picker de destino — no es un fallo, se vuelve a revisar. */
export class CsvCancelado extends Error {
  constructor() {
    super("cancelado");
    this.name = "CsvCancelado";
  }
}
