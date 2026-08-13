import { Check, Loader2, X } from "lucide-react";
import { ROW_DRAFT, ROW_HIGHLIGHT, ROW_SAVING, useGridUi, useIsRowActive, useRowActionsState } from "../gridContext";

export function RowActions({ rowId }: { rowId: string }) {
  const meta = useGridUi().meta.current;
  const state = useRowActionsState(rowId);
  const active = useIsRowActive(rowId);
  const isDraft = (state & ROW_DRAFT) !== 0;
  const saving = (state & ROW_SAVING) !== 0;
  const dot = (state & ROW_HIGHLIGHT) !== 0 && active && !isDraft;
  if (isDraft) {
    return (
      <div className="flex h-full items-center justify-center gap-px">
        <button
          type="button"
          title="Confirmar (Ctrl+Enter)"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            meta.commitEdit();
          }}
          className="rounded p-px text-emerald-600 hover:bg-muted disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
        <button
          type="button"
          title="Cancelar (Esc)"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            meta.cancelEdit();
          }}
          className="rounded p-px text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </div>
    );
  }
  if (dot) {
    return (
      <div className="flex h-full items-center justify-center" title="Fila seleccionada">
        <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.25)]" />
      </div>
    );
  }
  return null;
}
