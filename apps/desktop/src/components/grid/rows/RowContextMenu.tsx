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
}) {
  return (
    <ContextMenu>
      {/* `asChild`: the trigger is the scroll container itself, so right-clicking
          anywhere over the rows opens the menu and focus comes back here when it
          closes — the arrow keys keep working straight after. */}
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem onSelect={onCopy}>
          <Copy />
          Copiar
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCut}>
          <Scissors />
          Cortar
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onPaste}>
          <ClipboardPaste />
          Pegar
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canAdd || editing} onSelect={onAddRow}>
          <Plus />
          Agregar fila
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          disabled={!canDelete || editing}
          onSelect={onDeleteRows}
        >
          <Trash2 />
          Eliminar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
