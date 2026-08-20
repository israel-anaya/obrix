import { useCallback, useEffect, useState } from "react";

export interface CatalogGeneralApi<T, New> {
  list: () => Promise<T[]>;
  create: (payload: New) => Promise<T>;
  update: (id: string, payload: New) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

/**
 * Generic list/create/update/remove hook for Configuración's general
 * catalogs — avoids having an almost-identical hook per entity. `api` must
 * have stable identity across renders (define it at module level, not
 * inline in the component).
 */
export function useCatalogGeneral<T extends { id: string }, New>(api: CatalogGeneralApi<T, New>) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Starts as `true`: between mount and the first response the grid has zero
  // rows, and without this it would say "Sin registros" before even asking.
  const [loading, setLoading] = useState(true);

  /**
   * `markLoading` distinguishes the two reasons to re-fetch the list, which
   * matter very differently to the grid:
   *
   * - A full load (first view, the Recargar button, an organization
   *   switch): nothing valid is on screen, so it's marked and the grid
   *   paints the skeleton instead.
   * - The refresh that follows a save or delete: it brings the same records
   *   already being viewed, and marking it would make the grid flash to a
   *   skeleton —losing the scroll— after every ✓. The save already reports
   *   its own outcome (draft tint and toast), so this one stays quiet.
   */
  const load = useCallback(
    async (markLoading: boolean) => {
      if (markLoading) setLoading(true);
      try {
        setItems(await api.list());
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        if (markLoading) setLoading(false);
      }
    },
    [api],
  );

  const reload = useCallback(() => load(true), [load]);
  const refresh = useCallback(() => load(false), [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(
    async (payload: New) => {
      try {
        await api.create(payload);
        await refresh();
      } catch (e) {
        setError(String(e));
        // The caller (e.g. the grid, to know whether to keep the draft and allow retrying) needs to learn about the failure.
        throw e;
      }
    },
    [api, refresh],
  );

  const update = useCallback(
    async (id: string, payload: New) => {
      try {
        await api.update(id, payload);
        await refresh();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [api, refresh],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      try {
        await Promise.all(ids.map((id) => api.remove(id)));
        await refresh();
      } catch (e) {
        setError(String(e));
        throw e;
      }
    },
    [api, refresh],
  );

  const clearError = useCallback(() => setError(null), []);

  return { items, error, loading, create, update, remove, reload, refresh, clearError };
}
