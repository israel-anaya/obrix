import { useCallback, useEffect, useState } from "react";
import { createConcepto, listConceptos } from "@/lib/tauri";
import type { Concepto, NuevoConcepto } from "@/lib/types";

export function useConceptos() {
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setConceptos(await listConceptos());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const crear = useCallback(
    async (nuevo: NuevoConcepto) => {
      try {
        await createConcepto(nuevo);
        await reload();
      } catch (e) {
        setError(String(e));
      }
    },
    [reload],
  );

  return { conceptos, error, crear, reload };
}
