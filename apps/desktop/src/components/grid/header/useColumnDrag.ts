import { useCallback, useMemo, useRef, useState } from "react";

/** Where the header splits: on the left half the dragged column drops before
 * it, on the right half after it. */
const MIDPOINT = 0.5;

/**
 * Reordering columns by dragging their header.
 *
 * Native HTML5 drag and drop, on purpose: the browser paints the drag image and
 * handles the whole gesture, so there is no `mousemove` listener competing with
 * the resize handle — which lives in the same header and starts on `mousedown`.
 * The handle is the sorting button, never the `<th>`, so grabbing the edge to
 * resize does not start a drag.
 */
export function useColumnDrag({
  fields,
  onMove,
}: {
  /** Visible data columns, in the order they are painted. */
  fields: string[];
  onMove: (field: string, beforeField: string | null) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ field: string; before: boolean } | null>(null);
  // `dragover` fires several times a second over the same header: the state is
  // only touched when the drop position really changes.
  const dropAtRef = useRef(dropAt);
  dropAtRef.current = dropAt;
  const draggingRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    draggingRef.current = null;
    setDragging(null);
    setDropAt(null);
  }, []);

  const handleProps = useCallback(
    (field: string) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        draggingRef.current = field;
        setDragging(field);
        e.dataTransfer.effectAllowed = "move";
        // Some browsers cancel the drag outright when no data is set.
        e.dataTransfer.setData("text/plain", field);
      },
      onDragEnd: clear,
    }),
    [clear],
  );

  /** Which half of the header the pointer is over — read straight from the
   * event, never from state: `drop` can arrive in the same tick as the
   * `dragover` that would have set it. */
  const halfUnder = (e: React.DragEvent): boolean => {
    const box = e.currentTarget.getBoundingClientRect();
    return e.clientX - box.left < box.width * MIDPOINT;
  };

  const cellProps = useCallback(
    (field: string) => ({
      onDragOver: (e: React.DragEvent) => {
        if (draggingRef.current === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const before = halfUnder(e);
        const current = dropAtRef.current;
        if (!current || current.field !== field || current.before !== before) {
          setDropAt({ field, before });
        }
      },
      onDrop: (e: React.DragEvent) => {
        const from = draggingRef.current;
        if (from === null) return clear();
        e.preventDefault();
        // Dropping on the right half means "after this column", which is the
        // same as "before the next one" — and before nothing when it is the
        // last one, hence the `null`.
        const beforeField = halfUnder(e) ? field : (fields[fields.indexOf(field) + 1] ?? null);
        clear();
        if (beforeField !== from) onMove(from, beforeField);
      },
    }),
    [fields, onMove, clear],
  );

  /** The line marking where the column would land, and the faded look of the
   * one being dragged. */
  const cellClass = useCallback(
    (field: string): string | false => {
      if (dragging === null) return false;
      if (dragging === field) return "opacity-40";
      if (dropAt?.field !== field) return false;
      return dropAt.before
        ? "shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
        : "shadow-[inset_-2px_0_0_0_hsl(var(--primary))]";
    },
    [dragging, dropAt],
  );

  return useMemo(
    () => ({ handleProps, cellProps, cellClass }),
    [handleProps, cellProps, cellClass],
  );
}
