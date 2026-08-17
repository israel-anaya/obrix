import { useCallback, useEffect, useState } from "react";

export interface CatalogoGeneralApi<T, Nuevo> {
  list: () => Promise<T[]>;
  crear: (payload: Nuevo) => Promise<T>;
  actualizar: (id: string, payload: Nuevo) => Promise<T>;
  eliminar: (id: string) => Promise<void>;
}

/**
 * Hook genérico de list/crear/actualizar/eliminar para los catálogos
 * generales de Configuración — evita tener un hook casi idéntico por
 * entidad. `api` debe tener identidad estable entre renders (definirlo a
 * nivel de módulo, no inline en el componente).
 */
export function useCatalogoGeneral<T extends { id: string }, Nuevo>(api: CatalogoGeneralApi<T, Nuevo>) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" cuando aún no ha preguntado.
  const [cargando, setCargando] = useState(true);

  /**
   * `marcarCarga` distingue las dos razones para volver a pedir la lista, que
   * al grid le importan de forma muy distinta:
   *
   * - Una carga completa (la primera vista, el botón Recargar, un cambio de
   *   organización): no hay nada válido en pantalla, así que se marca y el grid
   *   pinta el esqueleto en su lugar.
   * - El refresco que sigue a guardar o borrar: trae los mismos registros que
   *   ya se están viendo, y marcarlo haría que el grid parpadeara a esqueleto
   *   —perdiendo el scroll— después de cada ✓. El guardado ya avisa por su
   *   cuenta (tinte del borrador y toast), así que este va callado.
   */
  const cargar = useCallback(
    async (marcarCarga: boolean) => {
      if (marcarCarga) setCargando(true);
      try {
        setItems(await api.list());
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        if (marcarCarga) setCargando(false);
      }
    },
    [api],
  );

  const reload = useCallback(() => cargar(true), [cargar]);
  const refrescar = useCallback(() => cargar(false), [cargar]);

  useEffect(() => {
    reload();
  }, [reload]);

  const crear = useCallback(
    async (payload: Nuevo) => {
      try {
        await api.crear(payload);
        await refrescar();
      } catch (e) {
        setError(String(e));
        // El llamador (p. ej. el grid, para saber si debe conservar el borrador y permitir reintentar) necesita enterarse del fallo.
        throw e;
      }
    },
    [api, refrescar],
  );

  const actualizar = useCallback(
    async (id: string, payload: Nuevo) => {
      try {
        await api.actualizar(id, payload);
        await refrescar();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [api, refrescar],
  );

  const eliminar = useCallback(
    async (ids: string[]) => {
      try {
        await Promise.all(ids.map((id) => api.eliminar(id)));
        await refrescar();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [api, refrescar],
  );

  const limpiarError = useCallback(() => setError(null), []);

  return { items, error, cargando, crear, actualizar, eliminar, reload, refrescar, limpiarError };
}
