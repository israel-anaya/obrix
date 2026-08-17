export interface DataGridColumn {
  field: string;
  header: string;
  /** Initial width in px — required; the user can resize it by hand. */
  width: number;
  /**
   * Fills whatever horizontal space the other columns leave, instead of
   * staying at a fixed width — `width` becomes its minimum instead of its
   * fixed size, and it drops its own resize handle (dragging a column that
   * auto-fills would fight the layout). At most one per grid.
   */
  grow?: boolean;
  numeric?: boolean;
  /** Fixed decimal places for display only (numeric columns) — the raw value keeps full precision, and the editor shows it unrounded. */
  decimals?: number;
  /** Edited and shown as a checkbox — for columns whose value is true/false. */
  boolean?: boolean;
  /** Text appended to the value for display only (e.g. "%") — it does not affect the real value when editing. */
  suffix?: string;
  /**
   * When given, the cell is edited with a picker instead of free text — for
   * columns whose value is an enum. As a function, the options depend on
   * another field of the same row (e.g. subfamily based on the chosen family).
   */
  options?: readonly string[] | ((row: Row) => readonly string[]);
  /** Audit columns (created_at/created_by/updated_at/updated_by) — visible but never editable. */
  readOnly?: boolean;
  /**
   * Captured when the record is created and fixed from then on — for a key or a
   * code the rest of the data hangs off, which cannot change once it exists.
   * The column takes input while the new row is a draft; on an existing record
   * it behaves like `readOnly` (no editor, no paste, no Delete).
   */
  readOnlyOnEdit?: boolean;
  /** Name of the row field carrying the node depth — when given, the cell is indented like a tree. */
  indentBy?: string;
  /** Rendered as stars (0–5) in read mode; editing still works on the raw numeric value. */
  stars?: boolean;
  /** Rendered with the Mexico-region date format (see `lib/fecha.ts`) — the real value is unchanged. */
  date?: boolean;
  /**
   * Starts hidden; the user can show it from the column menu. Survives a
   * reset of the layout (it hides again) and a first visit with no stored
   * layout. Showing it is remembered as `revealed` in `gridLayoutStorage`.
   */
  hiddenByDefault?: boolean;
  /** @deprecated No longer applies — per-column filtering was replaced by a global search (see `DataGrid`). */
  noFilter?: boolean;
  /** Value a new row starts with (via `addRow`), instead of "" / 0 / false. */
  default?: string | number | boolean;
}

export interface DataGridConfig {
  title: string;
  columns: DataGridColumn[];
}

export type Row = Record<string, string | number | boolean> & { _id: string };

export interface DataGridHandle {
  addRow: () => void;
  deleteSelectedRows: () => void;
}

export interface DataGridPersistProps {
  /** Real rows, controlled by the parent — when given, the grid stops managing sample data in memory. */
  initialRows?: Row[];
  /** Fires when a new record is committed (check icon), with the values as edited by the user. */
  onAddRow?: (row: Row) => void | Promise<void>;
  /** Replaces the in-memory removal with a real delete; receives the selected `_id`s. */
  onDeleteRows?: (ids: string[]) => void | Promise<void>;
  /** Fires when an edit to an existing row is committed (check icon). */
  onEditRow?: (row: Row) => void | Promise<void>;
  /** Fires when `onAddRow`/`onEditRow`/`onDeleteRows` rejects — the grid keeps the draft, but does not revert on its own. Default (when omitted): a destructive toast with the message. Pass this to opt out of the toast and handle it yourself (e.g. an inline error banner). */
  onSaveError?: (message: string) => void;
  /** Fires when `onAddRow`/`onEditRow` resolves without an error (not on delete, which has no success feedback). Default (when omitted): a success toast ("Guardado exitosamente"). Pass this to opt out or show custom feedback. */
  onSaveSuccess?: () => void;
  /** Fires when an in-flight edit or insert is cancelled (X button) — to clear a previous save error. */
  onCancelEdit?: () => void;
}

export interface EditState {
  id: string;
  isNew: boolean;
  /** Snapshot taken when editing starts — so it can be reverted on cancel. */
  original: Row;
}

/** When `initialValue` is given, the editor starts with that value (replacing
 * the cell's) instead of the current one — the "type to replace" case. */
export interface OpenCell {
  rowId: string;
  field: string;
  initialValue?: string;
}

export interface DataGridMeta {
  editing: EditState | null;
  highlightSelection: boolean;
  saving: boolean;
  selectCell: (rowId: string, field: string) => void;
  openCellAt: (rowId: string, field: string, initialValue?: string) => void;
  commitCellChange: (rowId: string, field: string, value: string | number | boolean) => void;
  closeCell: () => void;
  commitEdit: () => void;
  cancelEdit: () => void;
  errorFields: ReadonlySet<string>;
  saveError: string | null;
}

export type SelectedCell = { rowId: string; field: string } | null;

export type GridChrome = {
  editing: EditState | null;
  saving: boolean;
  errorFields: ReadonlySet<string>;
  saveError: string | null;
  highlightSelection: boolean;
};

/**
 * The row's draft kind, not the resolved class: the row and its pinned cells
 * paint the same tint in different ways (see `index.css`).
 */
export type DraftKind = "" | "new" | "edit";
