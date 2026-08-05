import { useCallback, useEffect, useState } from "react";
import { createInsumo, listInsumos } from "@/lib/tauri";
import type { Insumo, NuevoInsumo } from "@/lib/types";

export function useInsumos() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setInsumos(await listInsumos());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const crear = useCallback(
    async (nuevo: NuevoInsumo) => {
      try {
        await createInsumo(nuevo);
        await reload();
      } catch (e) {
        setError(String(e));
      }
    },
    [reload],
  );

  return { insumos, error, crear, reload };
}
