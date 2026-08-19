import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";

const MITAD_FILA = 0.5;

/** Separación entre el cursor y la miniatura, para no tapar el punto de destino. */
const DESPLAZAMIENTO_MINIATURA = 12;

/** WebKit deja pegada la imagen nativa del drag al soltar, así que se sustituye
 * por una transparente y la miniatura la dibujamos nosotros. Se crea al cargar
 * el módulo para que ya esté decodificada en el primer arrastre. */
const IMAGEN_VACIA =
  typeof Image === "undefined"
    ? null
    : Object.assign(new Image(), {
        src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      });

/** Contenido de la miniatura. Los números llegan ya formateados: cada ficha
 * sabe cuántos decimales lleva su cantidad (litros por hora, integrantes,
 * porcentaje de mano de obra…). */
export type EtiquetaFila = {
  titulo: string;
  cantidad?: string;
  unidad?: string;
  costo?: string;
};

/**
 * Reordenar renglones de una ficha arrastrando el handle (⋮⋮). HTML5 nativo,
 * el mismo enfoque que `useColumnDrag` en el grid: no hay `mousemove`
 * compitiendo con los inputs de cantidad. El handle es el único `draggable`;
 * la fila solo recibe drop.
 *
 * `etiqueta` da el contenido de la miniatura que sigue al cursor; sin ella no
 * se dibuja ninguna.
 */
export function useFilaDrag({
  ids,
  onMove,
  enabled,
  etiqueta,
}: {
  ids: string[];
  onMove: (id: string, indiceDestino: number) => void;
  enabled: boolean;
  etiqueta?: (id: string) => EtiquetaFila | null;
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [soltarEn, setSoltarEn] = useState<{ id: string; antes: boolean } | null>(null);
  const soltarEnRef = useRef(soltarEn);
  soltarEnRef.current = soltarEn;
  const arrastrandoRef = useRef<string | null>(null);
  const miniaturaRef = useRef<HTMLDivElement | null>(null);
  const posicionRef = useRef({ x: 0, y: 0 });

  const limpiar = useCallback(() => {
    arrastrandoRef.current = null;
    setArrastrando(null);
    setSoltarEn(null);
  }, []);

  const colocarMiniatura = useCallback((x: number, y: number) => {
    posicionRef.current = { x, y };
    const nodo = miniaturaRef.current;
    if (!nodo) return;
    // Se escribe directo en el DOM: `dragover` llega en cada movimiento y
    // renderizar la ficha entera a esa frecuencia se siente pesado.
    nodo.style.transform = `translate3d(${x + DESPLAZAMIENTO_MINIATURA}px, ${y + DESPLAZAMIENTO_MINIATURA}px, 0)`;
  }, []);

  // La miniatura nace ya en el cursor, antes de que el navegador pinte.
  useLayoutEffect(() => {
    if (arrastrando === null) return;
    colocarMiniatura(posicionRef.current.x, posicionRef.current.y);
  }, [arrastrando, colocarMiniatura]);

  // `dragover` en el documento sigue al cursor por toda la ventana, también
  // fuera de la tabla; el de la fila solo cubre las filas.
  useEffect(() => {
    if (arrastrando === null) return;
    const seguir = (e: globalThis.DragEvent) => colocarMiniatura(e.clientX, e.clientY);
    document.addEventListener("dragover", seguir);
    return () => document.removeEventListener("dragover", seguir);
  }, [arrastrando, colocarMiniatura]);

  const handleProps = useCallback(
    (id: string) =>
      enabled
        ? {
            draggable: true as const,
            onDragStart: (e: DragEvent) => {
              arrastrandoRef.current = id;
              posicionRef.current = { x: e.clientX, y: e.clientY };
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
  // último). Se marca también el hueco que deja la fila donde ya está: sin la
  // imagen nativa del drag, es la única referencia mientras se arrastra.
  const hueco = useMemo(() => {
    if (!soltarEn || !arrastrando) return null;
    const to = ids.indexOf(soltarEn.id);
    if (to < 0 || ids.indexOf(arrastrando) < 0) return null;
    return soltarEn.antes ? to : to + 1;
  }, [soltarEn, arrastrando, ids]);

  const vistaPrevia = useMemo(() => {
    if (arrastrando === null || !etiqueta) return null;
    const datos = etiqueta(arrastrando);
    if (!datos?.titulo) return null;
    return createPortal(
      <div
        ref={miniaturaRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-50 max-w-xs rounded-md border border-border bg-background/95 px-2 py-1 shadow-lg"
      >
        <div className="flex items-center gap-1 text-[11px] font-medium text-foreground">
          <GripVertical size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{datos.titulo}</span>
        </div>
        {(datos.cantidad || datos.unidad || datos.costo) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[18px] text-[10px] tabular-nums text-muted-foreground">
            {datos.cantidad && <span>{datos.cantidad}</span>}
            {datos.unidad && (
              <>
                {datos.cantidad && <span aria-hidden className="text-border">·</span>}
                <span>{datos.unidad}</span>
              </>
            )}
            {datos.costo && (
              <>
                {(datos.cantidad || datos.unidad) && <span aria-hidden className="text-border">·</span>}
                <span>{datos.costo}</span>
              </>
            )}
          </div>
        )}
      </div>,
      document.body,
    );
  }, [arrastrando, etiqueta]);

  return useMemo(
    () => ({ handleProps, filaProps, filaClass, hueco, vistaPrevia }),
    [handleProps, filaProps, filaClass, hueco, vistaPrevia],
  );
}
