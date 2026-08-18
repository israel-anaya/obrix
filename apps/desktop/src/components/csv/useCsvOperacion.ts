import { useCallback, useEffect, useState } from "react";
import { CsvCancelado, type CsvAdaptador, type CsvPrevisualizacion, type CsvProgreso, type CsvResultado } from "@/components/csv/tipos";

export type CsvFase = "elegir" | "revisar" | "ejecutando" | "resumen";

const PREVIEW_VACIO: CsvPrevisualizacion = {
  listos: 0,
  omitidos: 0,
  problemas: [],
  avisos: [],
};

export function useCsvOperacion(adaptador: CsvAdaptador | null) {
  const [fase, setFase] = useState<CsvFase>("elegir");
  const [path, setPath] = useState<string | null>(null);
  const [contenido, setContenido] = useState("");
  const [preview, setPreview] = useState<CsvPrevisualizacion>(PREVIEW_VACIO);
  const [extra, setExtraState] = useState<Record<string, unknown>>({});
  const [progreso, setProgreso] = useState<CsvProgreso | null>(null);
  const [resultado, setResultado] = useState<CsvResultado | null>(null);
  const [errorFatal, setErrorFatal] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFase(adaptador?.modo === "exportar" ? "revisar" : "elegir");
    setPath(null);
    setContenido("");
    setPreview(PREVIEW_VACIO);
    setExtraState({});
    setProgreso(null);
    setResultado(null);
    setErrorFatal(null);
  }, [adaptador?.modo]);

  useEffect(() => {
    if (!adaptador) {
      setFase("elegir");
      setPath(null);
      setContenido("");
      setPreview(PREVIEW_VACIO);
      setExtraState({});
      setProgreso(null);
      setResultado(null);
      setErrorFatal(null);
      return;
    }
    let cancelado = false;
    setFase(adaptador.modo === "exportar" ? "revisar" : "elegir");
    setPath(null);
    setContenido("");
    setPreview(PREVIEW_VACIO);
    setExtraState({});
    setProgreso(null);
    setResultado(null);
    setErrorFatal(null);
    if (adaptador.modo === "exportar" && adaptador.previsualizarExport) {
      void Promise.resolve(adaptador.previsualizarExport()).then((p) => {
        if (!cancelado) setPreview(p);
      });
    }
    return () => {
      cancelado = true;
    };
  }, [adaptador]);

  const setExtra = useCallback((patch: Record<string, unknown>) => {
    setExtraState((prev) => ({ ...prev, ...patch }));
  }, []);

  const cargarArchivo = useCallback(
    async (nuevoPath: string, nuevoContenido: string) => {
      if (!adaptador?.previsualizar) return;
      setErrorFatal(null);
      setPath(nuevoPath);
      setContenido(nuevoContenido);
      try {
        const p = await adaptador.previsualizar(nuevoContenido);
        setPreview(p);
        setFase("revisar");
      } catch (e) {
        setErrorFatal(String(e));
        setPreview({ ...PREVIEW_VACIO, fatal: String(e) });
        setFase("revisar");
      }
    },
    [adaptador],
  );

  const ejecutar = useCallback(async () => {
    if (!adaptador) return;
    setFase("ejecutando");
    setErrorFatal(null);
    const mensaje = adaptador.mensajeEjecutando ?? (adaptador.modo === "exportar" ? "Exportando…" : "Importando…");
    setProgreso({ actual: 0, total: preview.listos || null, mensaje });
    try {
      const r = await adaptador.ejecutar(
        { contenido, path, preview, extra },
        (p) => setProgreso(p),
      );
      setResultado(r);
      setFase("resumen");
    } catch (e) {
      if (e instanceof CsvCancelado) {
        setFase("revisar");
        return;
      }
      setErrorFatal(String(e));
      setResultado({
        creados: 0,
        actualizados: 0,
        omitidos: 0,
        problemas: [{ mensaje: String(e), grupo: "Error" }],
        avisos: [],
      });
      setFase("resumen");
    } finally {
      setProgreso(null);
    }
  }, [adaptador, contenido, path, preview, extra]);

  const extraError = adaptador?.extraListo?.(extra, preview) ?? null;
  const bloqueadoPorPolitica =
    adaptador?.politica === "estricto" && (preview.problemas.length > 0 || preview.omitidos > 0);
  const puedeConfirmar =
    !preview.fatal &&
    !errorFatal &&
    extraError === null &&
    !bloqueadoPorPolitica &&
    preview.listos > 0;

  return {
    fase,
    path,
    preview,
    extra,
    setExtra,
    progreso,
    resultado,
    errorFatal,
    extraError,
    bloqueadoPorPolitica,
    puedeConfirmar,
    cargarArchivo,
    ejecutar,
    reset,
    marcarFatal: (mensaje: string) => {
      setErrorFatal(mensaje);
      setPreview({ ...PREVIEW_VACIO, fatal: mensaje });
      setFase("revisar");
    },
    volverAElegir: () => {
      setFase("elegir");
      setPreview(PREVIEW_VACIO);
      setPath(null);
      setContenido("");
      setErrorFatal(null);
    },
  };
}
