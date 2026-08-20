import { ProgressBar } from "@/components/ProgressBar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Ongoing-operation dialog — the same pattern as CSV import/export
 * (`CsvOperationDialog` in its "running" phase): a progress bar, not
 * closeable until it finishes or fails.
 */
export function OperationProgressDialog({
  open,
  title,
  message,
  error,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  error?: string | null;
  onClose?: () => void;
}) {
  const running = open && !error;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !running) onClose?.();
      }}
    >
      <DialogContent
        className="max-w-lg"
        showCloseButton={!running}
        onPointerDownOutside={(e) => {
          if (running) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (running) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{error ? "No se pudo completar la operación." : message}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <ProgressBar current={0} total={null} message={message} />
        )}
        {error && (
          <DialogFooter>
            <Button size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
