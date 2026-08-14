import { ROW_HEIGHT } from "../gridLayout";

/** Widths that repeat down the column so it does not look like a chequerboard,
 * and no two neighbouring rows come out identical. */
const WIDTHS = ["70%", "45%", "85%", "55%", "78%", "38%", "62%"];

/**
 * The shape of the table while the rows are on their way — instead of the
 * "Sin registros." that says the opposite of what is happening.
 *
 * It is drawn with the same columns and the same row height as the real body,
 * so when the data lands nothing shifts. There is no virtualizer here: it only
 * ever paints what fits on screen.
 */
export function SkeletonRows({
  count,
  columnIds,
  cellStyles,
  cellClasses,
}: {
  count: number;
  columnIds: string[];
  cellStyles: Map<string, React.CSSProperties>;
  cellClasses: Map<string, string>;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, rowIdx) => (
        <tr key={rowIdx} aria-hidden data-skeleton className="flex" style={{ height: ROW_HEIGHT }}>
          {columnIds.map((columnId, colIdx) => (
            <td key={columnId} style={cellStyles.get(columnId)} className={cellClasses.get(columnId)}>
              {!columnId.startsWith("__") && (
                <div className="flex h-full items-center px-1">
                  <div
                    className="h-2.5 animate-pulse rounded bg-muted-foreground/15"
                    style={{ width: WIDTHS[(rowIdx + colIdx) % WIDTHS.length] }}
                  />
                </div>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
