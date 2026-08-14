import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";
import type { DataGridMeta, Row } from "./types";

export const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnSizingFeature,
  columnResizingFeature,
  // Order and visibility are arranged by the user and persisted (see
  // `useGridLayout`); the table only applies them.
  columnOrderingFeature,
  columnVisibilityFeature,
  tableMeta: {} as DataGridMeta,
});

export const columnHelper = createColumnHelper<typeof features, Row>();
