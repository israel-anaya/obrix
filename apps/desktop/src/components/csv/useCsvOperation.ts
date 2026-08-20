import { useCallback, useEffect, useState } from "react";
import { CsvCancelled, type CsvAdapter, type CsvPreview, type CsvProgress, type CsvResult } from "@/components/csv/types";

export type CsvPhase = "choose" | "review" | "running" | "summary";

const EMPTY_PREVIEW: CsvPreview = {
  ready: 0,
  skipped: 0,
  issues: [],
  warnings: [],
};

export function useCsvOperation(adapter: CsvAdapter | null) {
  const [phase, setPhase] = useState<CsvPhase>("choose");
  const [path, setPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<CsvPreview>(EMPTY_PREVIEW);
  const [extra, setExtraState] = useState<Record<string, unknown>>({});
  const [progress, setProgress] = useState<CsvProgress | null>(null);
  const [result, setResult] = useState<CsvResult | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase(adapter?.mode === "export" ? "review" : "choose");
    setPath(null);
    setContent("");
    setPreview(EMPTY_PREVIEW);
    setExtraState({});
    setProgress(null);
    setResult(null);
    setFatalError(null);
  }, [adapter?.mode]);

  useEffect(() => {
    if (!adapter) {
      setPhase("choose");
      setPath(null);
      setContent("");
      setPreview(EMPTY_PREVIEW);
      setExtraState({});
      setProgress(null);
      setResult(null);
      setFatalError(null);
      return;
    }
    let cancelled = false;
    setPhase(adapter.mode === "export" ? "review" : "choose");
    setPath(null);
    setContent("");
    setPreview(EMPTY_PREVIEW);
    setExtraState({});
    setProgress(null);
    setResult(null);
    setFatalError(null);
    if (adapter.mode === "export" && adapter.previewExport) {
      void Promise.resolve(adapter.previewExport()).then((p) => {
        if (!cancelled) setPreview(p);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const setExtra = useCallback((patch: Record<string, unknown>) => {
    setExtraState((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadFile = useCallback(
    async (newPath: string, newContent: string) => {
      if (!adapter?.preview) return;
      setFatalError(null);
      setPath(newPath);
      setContent(newContent);
      try {
        const p = await adapter.preview(newContent);
        setPreview(p);
        setPhase("review");
      } catch (e) {
        setFatalError(String(e));
        setPreview({ ...EMPTY_PREVIEW, fatal: String(e) });
        setPhase("review");
      }
    },
    [adapter],
  );

  const run = useCallback(async () => {
    if (!adapter) return;
    setPhase("running");
    setFatalError(null);
    const message = adapter.runningMessage ?? (adapter.mode === "export" ? "Exportando…" : "Importando…");
    setProgress({ current: 0, total: preview.ready || null, message });
    try {
      const r = await adapter.run(
        { content, path, preview, extra },
        (p) => setProgress(p),
      );
      setResult(r);
      setPhase("summary");
    } catch (e) {
      if (e instanceof CsvCancelled) {
        setPhase("review");
        return;
      }
      setFatalError(String(e));
      setResult({
        created: 0,
        updated: 0,
        skipped: 0,
        issues: [{ message: String(e), group: "Error" }],
        warnings: [],
      });
      setPhase("summary");
    } finally {
      setProgress(null);
    }
  }, [adapter, content, path, preview, extra]);

  const extraError = adapter?.extraReady?.(extra, preview) ?? null;
  const blockedByPolicy =
    adapter?.policy === "strict" && (preview.issues.length > 0 || preview.skipped > 0);
  const canConfirm =
    !preview.fatal &&
    !fatalError &&
    extraError === null &&
    !blockedByPolicy &&
    preview.ready > 0;

  return {
    phase,
    path,
    preview,
    extra,
    setExtra,
    progress,
    result,
    fatalError,
    extraError,
    blockedByPolicy,
    canConfirm,
    loadFile,
    run,
    reset,
    markFatal: (message: string) => {
      setFatalError(message);
      setPreview({ ...EMPTY_PREVIEW, fatal: message });
      setPhase("review");
    },
    backToChoose: () => {
      setPhase("choose");
      setPreview(EMPTY_PREVIEW);
      setPath(null);
      setContent("");
      setFatalError(null);
    },
  };
}
