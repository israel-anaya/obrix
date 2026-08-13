export interface CatalogoClipboard {
  copiar: () => Promise<void>;
  cortar: () => Promise<void>;
  pegar: () => Promise<void>;
}

/** Último grid que recibió foco — el menú Edit de `App` lo usa para Cortar/Copiar/Pegar. */
let activo: CatalogoClipboard | null = null;

export function catalogoClipboardActivo(): CatalogoClipboard | null {
  return activo;
}

export function setCatalogoClipboardActivo(api: CatalogoClipboard | null) {
  activo = api;
}
