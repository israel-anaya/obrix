/**
 * Exact row height, set on the `<tr>` (not estimated): 22px of content (the
 * cell's `min-h-[22px]`) + 4px from `py-0.5` + 1px of `border-b`. Being fixed
 * by construction, the virtualizer never has to measure a row —nor observe it
 * with a ResizeObserver— and the scroll/paging arithmetic built on this
 * constant is exact. If the padding, the border or the cell height changes,
 * this number has to be updated (a taller row gets clipped, it does not grow).
 */
export const ROW_HEIGHT = 27;

/**
 * Name of the CSS variable carrying a column's live width. Widths are published
 * once on the `<table>`: resizing then changes a single `style` on the
 * container and the browser re-measures, without re-rendering a single row
 * (with `columnResizeMode: "onChange"`, doing it per cell meant re-rendering
 * the whole body on every `mousemove`).
 */
export function widthVar(columnId: string): string {
  // Characters that are invalid in a custom property name are encoded by their
  // code point (and not to a fixed "_") so that two distinct columns never end
  // up sharing the same variable —and therefore the same width.
  return `--cw-${columnId.replace(/[^\w-]/g, (ch) => `_${ch.codePointAt(0)}_`)}`;
}
