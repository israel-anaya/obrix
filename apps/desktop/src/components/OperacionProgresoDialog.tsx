import { BarraProgreso } from "@/components/BarraProgreso";
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
 * Diálogo de operación en curso — el mismo patrón que importar/exportar CSV
 * (`CsvOperacionDialog` en fase "ejecutando"): barra de progreso, sin cerrar
 * hasta que termine o falle.
 */
export function OperacionProgresoDialog({
  abierto,
  titulo,
  mensaje,
  error,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  error?: string | null;
  onCerrar?: () => void;
}) {
  const ejecutando = abierto && !error;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v && !ejecutando) onCerrar?.();
      }}
    >
      <DialogContent
        className="max-w-lg"
        showCloseButton={!ejecutando}
        onPointerDownOutside={(e) => {
          if (ejecutando) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (ejecutando) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{error ? "No se pudo completar la operación." : mensaje}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <BarraProgreso actual={0} total={null} mensaje={mensaje} />
        )}
        {error && (
          <DialogFooter>
            <Button size="sm" onClick={onCerrar}>
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
