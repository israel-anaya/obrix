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

  const reload = useCallback(async () => {
    try {
      setItems(await api.list());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [api]);

  useEffect(() => {
    reload();
  }, [reload]);

  const crear = useCallback(
    async (payload: Nuevo) => {
      try {
        await api.crear(payload);
        await reload();
      } catch (e) {
        setError(String(e));
        // El llamador (p. ej. el grid, para saber si debe conservar el borrador y permitir reintentar) necesita enterarse del fallo.
        throw e;
      }
    },
    [api, reload],
  );

  const actualizar = useCallback(
    async (id: string, payload: Nuevo) => {
      try {
        await api.actualizar(id, payload);
        await reload();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [api, reload],
  );

  const eliminar = useCallback(
    async (ids: string[]) => {
      try {
        await Promise.all(ids.map((id) => api.eliminar(id)));
        await reload();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [api, reload],
  );

  return { items, error, crear, actualizar, eliminar, reload };
}
