import { createLucideIcon, type IconNode, type LucideIcon } from "lucide-react";

/**
 * Pictogramas de tipo de insumo. El dibujo vive en `icons/insumos/*.svg`
 * (viewBox 24×24, trazo `currentColor`, mismo contrato visual que Lucide).
 * Este módulo solo registra cada archivo como `LucideIcon`.
 */

const SVG_POR_RUTA = import.meta.glob("./insumos/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const FIGURAS = "path|circle|rect|line|ellipse|polyline|polygon";

function iconNodeDesdeSvg(svg: string): IconNode {
  const nodos: IconNode = [];
  const figura = new RegExp(`<(${FIGURAS})\\s([^>]*?)\\s*/>`, "gi");
  for (const match of svg.matchAll(figura)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[2].matchAll(/([a-zA-Z_:][\w:.-]*)="([^"]*)"/g)) {
      attrs[attr[1]] = attr[2];
    }
    nodos.push([match[1].toLowerCase() as IconNode[number][0], attrs]);
  }
  return nodos;
}

function idDesdeRuta(ruta: string): string {
  const archivo = ruta.split("/").pop() ?? ruta;
  return archivo.replace(/\.svg$/i, "");
}

/** Ids estables (`insumo-*`) → componente. Un SVG por id en `icons/insumos/`. */
export const ICONOS_INSUMO: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(SVG_POR_RUTA).map(([ruta, svg]) => {
    const id = idDesdeRuta(ruta);
    return [id, createLucideIcon(id, iconNodeDesdeSvg(svg))];
  }),
);
