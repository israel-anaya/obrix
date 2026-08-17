import { ClipboardPaste, Copy, Plus, Scissors, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

/**
 * Right-click menu over the body. It offers no more than the keyboard already
 * does — the point is that the actions are where people look for them, and that
 * the menu names the shortcut next to each one.
 *
 * While a row is in draft, adding and deleting are off: both would throw away
 * an edit that has not been saved.
 */
export function RowContextMenu({
  children,
  editing,
  onCopy,
  onCut,
  onPaste,
  onAddRow,
  onDeleteRows,
  canDelete,
  canAdd,
  addLabel = "Agregar fila",
}: {
  children: React.ReactNode;
  editing: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onAddRow: () => void;
  onDeleteRows: () => void;
  canDelete: boolean;
  canAdd: boolean;
  /** Cómo se llama aquí un registro — el `VerticalGrid` los pinta como columnas, no como filas. */
  addLabel?: string;
}) {
  return (
    <ContextMenu>
      {/* `asChild`: the trigger is the scroll container itself, so right-clicking
          anywhere over the rows opens the menu and focus comes back here when it
          closes — the arrow keys keep working straight after. */}
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem onSelect={onCopy}>
          <Copy size={16} />
          Copiar
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCut}>
          <Scissors size={16} />
          Cortar
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onPaste}>
          <ClipboardPaste size={16} />
          Pegar
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canAdd || editing} onSelect={onAddRow}>
          <Plus size={16} />
          {addLabel}
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          disabled={!canDelete || editing}
          onSelect={onDeleteRows}
        >
          <Trash2 size={16} />
          Eliminar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
