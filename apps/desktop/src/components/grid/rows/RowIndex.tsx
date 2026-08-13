import { cn } from "@/lib/utils";
import { useIsRowActive } from "../gridContext";

export function RowIndex({ rowId, index }: { rowId: string; index: number }) {
  const active = useIsRowActive(rowId);
  return (
    <div
      className={cn(
        "flex h-full items-center justify-end px-1 text-[10px] tabular-nums text-muted-foreground",
        active && "font-medium text-foreground",
      )}
    >
      {index}
    </div>
  );
}
