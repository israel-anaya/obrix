import type { ReactNode } from "react";
import type { CatalogoFichaProps } from "@/features/configuracion/CatalogoGeneralSeccion";
import { MonedaFormPanel } from "@/features/configuracion/MonedaFormPanel";
import { RegionFormPanel } from "@/features/configuracion/RegionFormPanel";
import { UnidadMedidaFormPanel } from "@/features/configuracion/UnidadMedidaFormPanel";

/** Ficha de los catálogos generales que se abren con `CatalogoGeneralSeccion`. */
export function fichaCatalogoMaestro(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ((props: CatalogoFichaProps<any>) => ReactNode) | undefined {
  if (id === "unidades-medida") {
    return ({ item, nombresPorUsuarioId, onCerrar, onGuardado }) => (
      <UnidadMedidaFormPanel
        unidad={item}
        nombresPorUsuarioId={nombresPorUsuarioId}
        onCerrar={onCerrar}
        onGuardado={onGuardado}
      />
    );
  }
  if (id === "regiones") {
    return ({ item, nombresPorUsuarioId, onCerrar, onGuardado }) => (
      <RegionFormPanel
        region={item}
        nombresPorUsuarioId={nombresPorUsuarioId}
        onCerrar={onCerrar}
        onGuardado={onGuardado}
      />
    );
  }
  if (id === "monedas") {
    return ({ item, nombresPorUsuarioId, onCerrar, onGuardado }) => (
      <MonedaFormPanel
        moneda={item}
        nombresPorUsuarioId={nombresPorUsuarioId}
        onCerrar={onCerrar}
        onGuardado={onGuardado}
      />
    );
  }
  return undefined;
}
