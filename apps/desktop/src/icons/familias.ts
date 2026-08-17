import { createLucideIcon, Package, type IconNode, type LucideIcon } from "lucide-react";

/**
 * Pictogramas de familia de insumo. El dibujo vive en `icons/familias/*.svg`
 * (viewBox 24×24, trazo `currentColor`, mismo contrato visual que Lucide).
 * Este módulo solo registra cada archivo como `LucideIcon`.
 */

const SVG_POR_RUTA = import.meta.glob("./familias/*.svg", {
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

/** Ids estables (`familia-*`) → componente. Un SVG por id en `icons/familias/`. */
export const ICONOS_FAMILIA: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(SVG_POR_RUTA).map(([ruta, svg]) => {
    const id = idDesdeRuta(ruta);
    return [id, createLucideIcon(id, iconNodeDesdeSvg(svg))];
  }),
);

/** Nombre de familia raíz (CSV) → id `familia-*`. Puente hasta que `familia_insumo.icono` exista. */
const ID_POR_NOMBRE: Record<string, string> = {
  "Cementos, cales y yesos": "familia-cementos-cales-yesos",
  Agregados: "familia-agregados",
  "Concretos y morteros": "familia-concretos-morteros",
  Aceros: "familia-aceros",
  Mampostería: "familia-mamposteria",
  Maderas: "familia-maderas",
  Impermeabilizantes: "familia-impermeabilizantes",
  "Pinturas y recubrimientos": "familia-pinturas-recubrimientos",
  "Pisos y azulejos": "familia-pisos-azulejos",
  "Cancelería y vidrio": "familia-canceleria-vidrio",
  "Instalaciones hidráulicas": "familia-instalaciones-hidraulicas",
  "Instalaciones sanitarias": "familia-instalaciones-sanitarias",
  "Instalaciones eléctricas": "familia-instalaciones-electricas",
  Ferretería: "familia-ferreteria",
  "Combustibles y lubricantes": "familia-combustibles-lubricantes",
  "Mano de obra": "familia-mano-de-obra",
  "Equipo y herramienta": "familia-equipo-herramienta",
  "Instalaciones de gas": "familia-instalaciones-de-gas",
  Jardinería: "familia-jardineria",
  "Muebles, cocinas y accesorios": "familia-muebles-cocinas-accesorios",
  "Básicos auxiliares": "familia-basicos-auxiliares",
};

export function iconoFamiliaPorId(id: string | null | undefined): LucideIcon {
  if (id && ICONOS_FAMILIA[id]) return ICONOS_FAMILIA[id];
  return Package;
}

export function iconoFamiliaPorNombre(nombre: string): LucideIcon {
  return iconoFamiliaPorId(ID_POR_NOMBRE[nombre]);
}

/** Prefiere `familia_insumo.icono`; si el portafolio aún no lo tiene, cae al nombre. */
export function iconoDeFamilia(fam: { icono?: string | null; nombre: string }): LucideIcon {
  if (fam.icono) return iconoFamiliaPorId(fam.icono);
  return iconoFamiliaPorNombre(fam.nombre);
}
