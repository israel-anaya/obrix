import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";

const MID_ROW = 0.5;

/** Gap between the cursor and the thumbnail, so it doesn't cover the drop point. */
const THUMBNAIL_OFFSET = 12;

/** WebKit leaves the native drag image stuck on drop, so it gets swapped for a
 * transparent one and we draw the thumbnail ourselves. Created at module load
 * so it's already decoded by the first drag. */
const EMPTY_IMAGE =
  typeof Image === "undefined"
    ? null
    : Object.assign(new Image(), {
        src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      });

/** Thumbnail content. Numbers arrive already formatted: each record panel
 * knows how many decimals its quantity carries (liters per hour, members,
 * labor percentage…). */
export type RowLabel = {
  title: string;
  quantity?: string;
  unit?: string;
  cost?: string;
};

/**
 * Reorder a record panel's rows by dragging the handle (⋮⋮). Native HTML5,
 * the same approach as `useColumnDrag` in the grid: no `mousemove` competing
 * with the quantity inputs. The handle is the only `draggable`; the row only
 * receives drop.
 *
 * `label` provides the thumbnail content that follows the cursor; without it
 * none is drawn.
 */
export function useRowDrag({
  ids,
  onMove,
  enabled,
  label,
}: {
  ids: string[];
  onMove: (id: string, targetIndex: number) => void;
  enabled: boolean;
  label?: (id: string) => RowLabel | null;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; before: boolean } | null>(null);
  const dropAtRef = useRef(dropAt);
  dropAtRef.current = dropAt;
  const draggingRef = useRef<string | null>(null);
  const thumbnailRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });

  const clear = useCallback(() => {
    draggingRef.current = null;
    setDragging(null);
    setDropAt(null);
  }, []);

  const placeThumbnail = useCallback((x: number, y: number) => {
    positionRef.current = { x, y };
    const node = thumbnailRef.current;
    if (!node) return;
    // Written straight to the DOM: `dragover` fires on every move, and
    // re-rendering the whole record panel at that rate feels sluggish.
    node.style.transform = `translate3d(${x + THUMBNAIL_OFFSET}px, ${y + THUMBNAIL_OFFSET}px, 0)`;
  }, []);

  // The thumbnail is born already at the cursor, before the browser paints.
  useLayoutEffect(() => {
    if (dragging === null) return;
    placeThumbnail(positionRef.current.x, positionRef.current.y);
  }, [dragging, placeThumbnail]);

  // `dragover` on the document follows the cursor across the whole window,
  // even outside the table; the row's own only covers the rows.
  useEffect(() => {
    if (dragging === null) return;
    const follow = (e: globalThis.DragEvent) => placeThumbnail(e.clientX, e.clientY);
    document.addEventListener("dragover", follow);
    return () => document.removeEventListener("dragover", follow);
  }, [dragging, placeThumbnail]);

  const handleProps = useCallback(
    (id: string) =>
      enabled
        ? {
            draggable: true as const,
            onDragStart: (e: DragEvent) => {
              draggingRef.current = id;
              positionRef.current = { x: e.clientX, y: e.clientY };
              setDragging(id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
              if (EMPTY_IMAGE) e.dataTransfer.setDragImage(EMPTY_IMAGE, 0, 0);
            },
            onDragEnd: clear,
          }
        : {},
    [enabled, clear],
  );

  const topHalf = (e: DragEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    return e.clientY - box.top < box.height * MID_ROW;
  };

  const rowProps = useCallback(
    (id: string) =>
      enabled
        ? {
            onDragOver: (e: DragEvent) => {
              if (draggingRef.current === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const before = topHalf(e);
              const current = dropAtRef.current;
              if (!current || current.id !== id || current.before !== before) {
                setDropAt({ id, before });
              }
            },
            onDrop: (e: DragEvent) => {
              const from = draggingRef.current;
              if (from === null) return clear();
              e.preventDefault();
              const to = ids.indexOf(id);
              const fromIndex = ids.indexOf(from);
              if (to < 0 || fromIndex < 0) return clear();
              let dest = topHalf(e) ? to : to + 1;
              if (fromIndex < dest) dest -= 1;
              clear();
              if (dest !== fromIndex) onMove(from, dest);
            },
          }
        : {},
    [enabled, ids, onMove, clear],
  );

  const rowClass = useCallback(
    (id: string): string | false => {
      if (dragging === id) return "opacity-40";
      return false;
    },
    [dragging],
  );

  // Index of the visual gap (0 = before the first, `ids.length` = after the
  // last). The gap left by the row's own current position is marked too:
  // without the native drag image, it's the only reference while dragging.
  const gap = useMemo(() => {
    if (!dropAt || !dragging) return null;
    const to = ids.indexOf(dropAt.id);
    if (to < 0 || ids.indexOf(dragging) < 0) return null;
    return dropAt.before ? to : to + 1;
  }, [dropAt, dragging, ids]);

  const preview = useMemo(() => {
    if (dragging === null || !label) return null;
    const data = label(dragging);
    if (!data?.title) return null;
    return createPortal(
      <div
        ref={thumbnailRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-50 max-w-xs rounded-md border border-border bg-background/95 px-2 py-1 shadow-lg"
      >
        <div className="flex items-center gap-1 text-[11px] font-medium text-foreground">
          <GripVertical size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{data.title}</span>
        </div>
        {(data.quantity || data.unit || data.cost) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[18px] text-[10px] tabular-nums text-muted-foreground">
            {data.quantity && <span>{data.quantity}</span>}
            {data.unit && (
              <>
                {data.quantity && <span aria-hidden className="text-border">·</span>}
                <span>{data.unit}</span>
              </>
            )}
            {data.cost && (
              <>
                {(data.quantity || data.unit) && <span aria-hidden className="text-border">·</span>}
                <span>{data.cost}</span>
              </>
            )}
          </div>
        )}
      </div>,
      document.body,
    );
  }, [dragging, label]);

  return useMemo(
    () => ({ handleProps, rowProps, rowClass, gap, preview }),
    [handleProps, rowProps, rowClass, gap, preview],
  );
}
