import { createContext, useContext } from "react";
import type { Organizacion } from "@/lib/types";

export interface OrganizacionContextValue {
  organizaciones: Organizacion[];
  organizacionActivaId: string | null;
  cambiarOrganizacion: (organizacionId: string) => void | Promise<void>;
  /**
   * Vuelve a pedir la lista de organizaciones al backend — hay que llamarlo
   * después de crear/editar/eliminar una organización (p. ej. desde
   * `OrganizacionSeccion`), porque `App` solo la carga una vez al abrir el
   * portafolio; sin esto, cualquier vista que lea `organizaciones` de este
   * contexto (el switcher del sidebar, el default de moneda en
   * `PreciosMaterialPanel`) se queda con datos viejos hasta reabrir.
   */
  reload: () => void | Promise<void>;
}

/**
 * El "evento" de cambio de organización activa: `App` es la única fuente
 * que escribe el valor (ver `handleCambiarOrganizacion`); cualquier vista
 * que necesite reaccionar (recargar datos, limpiar selección, etc.) se
 * suscribe con `useOrganizacionActiva()` en vez de recibir props a mano por
 * cada nivel del árbol.
 */
export const OrganizacionContext = createContext<OrganizacionContextValue | null>(null);

export function useOrganizacionActiva(): OrganizacionContextValue {
  const ctx = useContext(OrganizacionContext);
  if (!ctx) {
    throw new Error("useOrganizacionActiva debe usarse dentro de <OrganizacionContext.Provider>");
  }
  return ctx;
}
