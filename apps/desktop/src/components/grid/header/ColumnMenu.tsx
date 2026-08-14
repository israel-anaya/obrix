import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DataGridColumn } from "../types";

/**
 * Which columns are shown, and the way back to the default layout.
 *
 * It hangs from the corner of the header, over the row-number column: that cell
 * is empty, is pinned to the left and is always on screen no matter how far the
 * grid is scrolled — the same place a spreadsheet puts its corner.
 */
export function ColumnMenu({
  columns,
  hiddenFields,
  onToggle,
  onReset,
}: {
  /** Every column of the catalog, in the user's order. */
  columns: DataGridColumn[];
  hiddenFields: ReadonlySet<string>;
  onToggle: (field: string) => void;
  onReset: () => void;
}) {
  const visibleCount = columns.length - hiddenFields.size;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Columnas"
        className="flex h-full w-full items-center justify-center text-muted-foreground outline-none hover:text-foreground data-open:text-foreground"
      >
        <SlidersHorizontal size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 text-xs">
        <DropdownMenuLabel className="text-xs">Columnas</DropdownMenuLabel>
        {columns.map((column) => {
          const visible = !hiddenFields.has(column.field);
          return (
            <DropdownMenuCheckboxItem
              key={column.field}
              checked={visible}
              // Hiding the last one would leave a grid with nothing in it.
              disabled={visible && visibleCount === 1}
              // The menu stays open: hiding columns is usually several at once.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggle(column.field)}
              className="text-xs"
            >
              {column.header}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onReset()} className="text-xs">
          <RotateCcw size={12} />
          Restablecer diseño
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
