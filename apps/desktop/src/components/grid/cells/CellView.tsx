import { memo } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { displayValue } from "../gridValues";
import type { DataGridColumn, Row } from "../types";

const STAR_EMPTY = "text-muted-foreground/30";
const STAR_FILLED = "fill-amber-400 text-amber-400";

/**
 * Memoized on purpose: 5 icons per cell (up to 3 nodes each for the half star),
 * and a star column rebuilt them on every render of the cell — selecting it,
 * saving it, entering a draft. With `value` and `onPick` stable (see
 * `GridCell`), the subtree is not rebuilt.
 */
const Stars = memo(function Stars({
  value,
  onPick,
}: {
  value: unknown;
  onPick?: (n: number) => void;
}) {
  const numeric = Number(value);
  const rounded = Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 2) / 2 : 0;
  return (
    <div
      className="flex h-full items-center gap-0.5"
      title={Number.isFinite(numeric) && numeric > 0 ? String(value) : undefined}
      onClick={onPick ? (e) => e.stopPropagation() : undefined}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.min(Math.max(rounded - i, 0), 1);
        const className = fill === 1 ? STAR_FILLED : STAR_EMPTY;
        const icon =
          fill > 0 && fill < 1 ? (
            <span className="relative inline-block" style={{ width: 13, height: 13 }}>
              <Star size={13} className={cn("absolute inset-0", STAR_EMPTY)} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
                <Star size={13} className={STAR_FILLED} />
              </span>
            </span>
          ) : (
            <Star size={13} className={className} />
          );
        if (!onPick) return <span key={i}>{icon}</span>;
        return (
          <button
            key={i}
            type="button"
            title={`${i + 1}`}
            className="rounded-sm p-0 hover:scale-110"
            onClick={(e) => {
              e.stopPropagation();
              onPick(i + 1);
            }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
});

/**
 * A cell's view — checkbox, stars, indented, or the formatted text. `boolean`
 * columns render as a checkbox (the value stays a `boolean`); the change goes
 * into the row's draft and persists with ✓.
 */
export function CellView({
  row,
  column,
  onToggleBoolean,
  onStar,
}: {
  row: Row;
  column: DataGridColumn;
  onToggleBoolean?: () => void;
  onStar?: (n: number) => void;
}) {
  if (column.stars) return <Stars value={row[column.field]} onPick={onStar} />;
  if (column.boolean) {
    return (
      <div className="flex h-full w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={Boolean(row[column.field])}
          disabled={!onToggleBoolean}
          onChange={() => onToggleBoolean?.()}
          className="cursor-pointer disabled:cursor-default"
        />
      </div>
    );
  }
  const text = displayValue(row, column);
  const content = column.indentBy ? (
    <span style={{ paddingLeft: (Number(row[column.indentBy]) || 0) * 16 }}>{text}</span>
  ) : (
    text
  );
  return (
    <span
      title={text || undefined}
      className={cn("block min-w-0 truncate", column.numeric && "w-full text-right tabular-nums")}
    >
      {content}
    </span>
  );
}
