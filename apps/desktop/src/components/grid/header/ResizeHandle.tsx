import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Resize handle: col-resize cursor, guide spanning the full height of the grid.
 *
 * The style sheet is inserted once and never touched again; what gets toggled
 * is a class on `<body>`. Adding and removing a `<style>` on every resize
 * invalidated the whole CSSOM and forced a rule re-match across the entire
 * document.
 */
const COL_RESIZE_CLASS = "grid-col-resize";

function applyColResizeCursor(active: boolean) {
  const id = "grid-cursor-col-resize";
  if (active && !document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `body.${COL_RESIZE_CLASS} *,body.${COL_RESIZE_CLASS} *::before,body.${COL_RESIZE_CLASS} *::after{cursor:col-resize!important}`;
    document.head.appendChild(style);
  }
  document.body.classList.toggle(COL_RESIZE_CLASS, active);
}

export function ResizeHandle({
  resizing,
  onMouseDown,
  onTouchStart,
  containerRef,
}: {
  resizing: boolean;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onTouchStart: React.TouchEventHandler<HTMLDivElement>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [guide, setGuide] = useState<{ left: number; top: number; height: number } | null>(null);
  const visible = hover || resizing;

  // Only does something while this handle is resizing: the effect used to run
  // when each of the header's N handles mounted and, on cleanup, could turn off
  // the cursor for another column that actually was being resized.
  useEffect(() => {
    if (!resizing) return;
    applyColResizeCursor(true);
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      applyColResizeCursor(false);
      document.body.style.userSelect = prev;
    };
  }, [resizing]);

  useLayoutEffect(() => {
    if (!visible) {
      setGuide(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const handle = handleRef.current;
      const box = containerRef.current;
      if (!handle || !box) return;
      const h = handle.getBoundingClientRect();
      const c = box.getBoundingClientRect();
      setGuide((prev) =>
        prev && prev.left === h.right && prev.top === c.top && prev.height === c.height
          ? prev
          : { left: h.right, top: c.top, height: c.height },
      );
    };
    // Same as in `CellCombobox`: capturing scroll arrives on every event of
    // the container, so it is coalesced into a rAF and marked passive.
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    measure();
    const box = containerRef.current;
    const th = handleRef.current?.parentElement;
    const ro = new ResizeObserver(schedule);
    if (box) ro.observe(box);
    if (th) ro.observe(th);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", schedule, true);
    };
  }, [visible, resizing, containerRef]);

  return (
    <>
      <div
        ref={handleRef}
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown(e);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          onTouchStart(e);
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="absolute right-0 top-0 z-20 h-full w-2.5 touch-none select-none"
        style={{ cursor: "col-resize" }}
      />
      {guide &&
        createPortal(
          <div
            className={cn("pointer-events-none fixed z-[500] w-0.5", resizing ? "bg-primary" : "bg-primary/40")}
            style={{ left: guide.left, top: guide.top, height: guide.height }}
          />,
          document.body,
        )}
    </>
  );
}
