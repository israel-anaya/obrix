import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

const MITAD_FILA = 0.5;

/** WebKit deja pegada la imagen nativa del drag al soltar, así que el arrastre
 * se dibuja solo con la fila translúcida y el marcador de inserción. Se crea al
 * cargar el módulo para que ya esté decodificada en el primer arrastre. */
const IMAGEN_VACIA =
  typeof Image === "undefined"
    ? null
    : Object.assign(new Image(), {
        src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      });

/**
 * Reordenar renglones de una ficha arrastrando el handle (⋮⋮). HTML5 nativo,
 * el mismo enfoque que `useColumnDrag` en el grid: no hay `mousemove`
 * compitiendo con los inputs de cantidad. El handle es el único `draggable`;
 * la fila solo recibe drop.
 */
export function useFilaDrag({
  ids,
  onMove,
  enabled,
}: {
  ids: string[];
  onMove: (id: string, indiceDestino: number) => void;
  enabled: boolean;
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [soltarEn, setSoltarEn] = useState<{ id: string; antes: boolean } | null>(null);
  const soltarEnRef = useRef(soltarEn);
  soltarEnRef.current = soltarEn;
  const arrastrandoRef = useRef<string | null>(null);

  const limpiar = useCallback(() => {
    arrastrandoRef.current = null;
    setArrastrando(null);
    setSoltarEn(null);
  }, []);

  // El webview no siempre entrega `dragend` al handle (p. ej. al soltar fuera
  // de la tabla), y sin él la fila se quedaría translúcida. Los listeners van en
  // burbuja para que el `drop` de la fila corra primero, y el `pointermove` solo
  // limpia sin botones presionados: nunca puede adelantarse al soltar.
  useEffect(() => {
    if (arrastrando === null) return;
    const limpiarSiSuelto = (e: PointerEvent) => {
      if (e.buttons === 0) limpiar();
    };
    window.addEventListener("dragend", limpiar);
    window.addEventListener("drop", limpiar);
    window.addEventListener("pointermove", limpiarSiSuelto);
    return () => {
      window.removeEventListener("dragend", limpiar);
      window.removeEventListener("drop", limpiar);
      window.removeEventListener("pointermove", limpiarSiSuelto);
    };
  }, [arrastrando, limpiar]);

  const handleProps = useCallback(
    (id: string) =>
      enabled
        ? {
            draggable: true as const,
            onDragStart: (e: DragEvent) => {
              arrastrandoRef.current = id;
              setArrastrando(id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
              if (IMAGEN_VACIA) e.dataTransfer.setDragImage(IMAGEN_VACIA, 0, 0);
            },
            onDragEnd: limpiar,
          }
        : {},
    [enabled, limpiar],
  );

  const mitadSuperior = (e: DragEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    return e.clientY - box.top < box.height * MITAD_FILA;
  };

  const filaProps = useCallback(
    (id: string) =>
      enabled
        ? {
            onDragOver: (e: DragEvent) => {
              if (arrastrandoRef.current === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const antes = mitadSuperior(e);
              const actual = soltarEnRef.current;
              if (!actual || actual.id !== id || actual.antes !== antes) {
                setSoltarEn({ id, antes });
              }
            },
            onDrop: (e: DragEvent) => {
              const from = arrastrandoRef.current;
              if (from === null) return limpiar();
              e.preventDefault();
              const to = ids.indexOf(id);
              const fromIndex = ids.indexOf(from);
              if (to < 0 || fromIndex < 0) return limpiar();
              let dest = mitadSuperior(e) ? to : to + 1;
              if (fromIndex < dest) dest -= 1;
              limpiar();
              if (dest !== fromIndex) onMove(from, dest);
            },
          }
        : {},
    [enabled, ids, onMove, limpiar],
  );

  const filaClass = useCallback(
    (id: string): string | false => {
      if (arrastrando === id) return "opacity-40";
      return false;
    },
    [arrastrando],
  );

  // Índice del hueco visual (0 = antes del primero, `ids.length` = después del
  // último). `null` si no hay drag o si soltar ahí no movería la fila.
  const hueco = useMemo(() => {
    if (!soltarEn || !arrastrando) return null;
    const to = ids.indexOf(soltarEn.id);
    const from = ids.indexOf(arrastrando);
    if (to < 0 || from < 0) return null;
    const dest = soltarEn.antes ? to : to + 1;
    if (dest === from || dest === from + 1) return null;
    return dest;
  }, [soltarEn, arrastrando, ids]);

  return useMemo(
    () => ({ handleProps, filaProps, filaClass, hueco }),
    [handleProps, filaProps, filaClass, hueco],
  );
}
