import { memo, useCallback, useMemo } from "react";
import { FlexRender } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { DRAFT_PINNED_CELL_CLASS, DRAFT_ROW_CLASS, useDraftKind, useIsRowActive } from "../gridContext";
import { ROW_HEIGHT } from "../gridLayout";
import type { Row } from "../types";

type TableCell = { id: string; column: { id: string } };

/**
 * Memoized on purpose: the body re-renders on every grid state change (and on
 * every `mousemove` of a resize), but a row only depends on its `row`, its
 * index and whether it is selected — everything else (draft, active cell,
 * saving) arrives by subscribing to the stores. `selected` travels as a prop
 * because `row` is a stable reference that does not change when `rowSelection`
 * does, so reading `row.getIsSelected()` here would freeze the row on the
 * previous value.
 */
export const VirtualRow = memo(function VirtualRow({
  row,
  itemIndex,
  rowRefs,
  headerHeight,
  cellStyles,
  cellClasses,
  pinnedColumns,
  selected,
  selectionMode,
}: {
  row: {
    id: string;
    original: Row;
    getAllCells: () => TableCell[];
  };
  itemIndex: number;
  rowRefs: React.RefObject<Map<string, HTMLTableRowElement>>;
  headerHeight: number;
  cellStyles: Map<string, React.CSSProperties>;
  cellClasses: Map<string, string>;
  pinnedColumns: ReadonlySet<string>;
  selected: boolean;
  selectionMode: "multiple" | "single";
}) {
  const rowId = row.original._id;
  const active = useIsRowActive(rowId);
  const draftKind = useDraftKind(rowId);
  const isDraft = draftKind !== "";
  const visuallySelected = selectionMode === "single" ? active : selected;
  // A single background class per pinned cell — no stacking `bg-*` and letting
  // the last one win, which is what left the translucent tint showing through.
  const background = isDraft
    ? DRAFT_PINNED_CELL_CLASS[draftKind]
    : visuallySelected
      ? "bg-accent"
      : "bg-background";

  // Stable ref: an inline callback detaches and reattaches on every render
  // (React calls it with `null`, then with the node), rebuilding the Map row by row.
  const assignRef = useCallback(
    (el: HTMLTableRowElement | null) => {
      if (el) rowRefs.current.set(rowId, el);
      else rowRefs.current.delete(rowId);
    },
    [rowRefs, rowId],
  );

  // The height goes on the `<tr>` so it is exactly `ROW_HEIGHT` regardless of
  // what the content measures — that is what lets the virtualizer trust
  // `estimateSize` and never measure or observe a row.
  const rowStyle = useMemo(
    () => ({ height: ROW_HEIGHT, scrollMarginTop: headerHeight }),
    [headerHeight],
  );

  return (
    <tr
      data-index={itemIndex}
      ref={assignRef}
      style={rowStyle}
      tabIndex={0}
      className={cn(
        // El cursor se hereda: declarado una vez en la fila cubre las celdas,
        // las columnas ancladas y el hueco entre ellas. La flecha estándar, que
        // es lo que hace cualquier hoja de cálculo — ni manita ni barra de
        // texto (los editores sí piden `cursor-text` aparte).
        "flex cursor-default outline-none",
        DRAFT_ROW_CLASS[draftKind],
        !isDraft && visuallySelected && "bg-accent",
      )}
    >
      {row.getAllCells().map((cell) => {
        const columnId = cell.column.id;
        const pinned = pinnedColumns.has(columnId);
        return (
          <td
            key={cell.id}
            data-column-id={columnId}
            style={cellStyles.get(columnId)}
            className={pinned ? cn(cellClasses.get(columnId), background) : cellClasses.get(columnId)}
          >
            <FlexRender cell={cell as never} />
          </td>
        );
      })}
    </tr>
  );
});
