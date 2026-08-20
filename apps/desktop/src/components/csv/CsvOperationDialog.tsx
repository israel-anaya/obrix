import { Download, FileSpreadsheet, Upload } from "lucide-react";
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
import { writeChosenCsv, readChosenCsv } from "@/components/csv/files";
import type { CsvAdapter, CsvIssue, CsvResult } from "@/components/csv/types";
import { useCsvOperation } from "@/components/csv/useCsvOperation";
import { generarCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

function IssueList({ issues, warnings }: { issues: CsvIssue[]; warnings: string[] }) {
  if (issues.length === 0 && warnings.length === 0) return null;
  const groups = new Map<string, string[]>();
  for (const i of issues) {
    const g = i.group ?? "Problemas";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(i.message);
  }
  return (
    <div className="flex max-h-64 flex-col gap-3 overflow-auto text-xs">
      {warnings.map((w) => (
        <p key={w} className="text-muted-foreground">
          {w}
        </p>
      ))}
      {[...groups.entries()].map(([group, messages]) => (
        <div key={group}>
          <p className="font-medium text-amber-600">{group}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground">
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function summaryText(r: CsvResult, mode: "import" | "export"): string {
  if (mode === "export") {
    const n = r.created || r.updated;
    return r.path
      ? `Se exportaron ${n} registro${n === 1 ? "" : "s"} a ${r.path}.`
      : `Se exportaron ${n} registro${n === 1 ? "" : "s"}.`;
  }
  const parts: string[] = [];
  if (r.created > 0) parts.push(`${r.created} creado${r.created === 1 ? "" : "s"}`);
  if (r.updated > 0) parts.push(`${r.updated} actualizado${r.updated === 1 ? "" : "s"}`);
  if (r.skipped > 0) parts.push(`${r.skipped} omitido${r.skipped === 1 ? "" : "s"}`);
  if (r.issues.length > 0) {
    parts.push(`${r.issues.length} con problemas`);
  }
  if (parts.length === 0) return "No se aplicó ningún cambio.";
  return `Importación completa: ${parts.join(", ")}.`;
}

export function CsvOperationDialog({
  adapter,
  onClose,
  onDone,
}: {
  adapter: CsvAdapter | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const open = adapter !== null;
  const op = useCsvOperation(adapter);
  const running = op.phase === "running";

  const close = () => {
    if (running) return;
    if (op.phase === "summary") onDone?.();
    onClose();
  };

  const choose = async () => {
    try {
      const chosen = await readChosenCsv();
      if (!chosen) return;
      await op.loadFile(chosen.path, chosen.content);
    } catch (e) {
      op.markFatal(String(e));
    }
  };

  const downloadTemplate = async () => {
    if (!adapter?.template) return;
    const name = adapter.defaultFile ?? "plantilla.csv";
    await writeChosenCsv(name.replace(/\.csv$/i, "") + "-plantilla.csv", adapter.template());
  };

  const downloadReport = async () => {
    if (!op.result || op.result.issues.length === 0) return;
    const content = generarCsv(
      ["Grupo", "Mensaje"],
      op.result.issues.map((i) => [i.group ?? "", i.message]),
    );
    await writeChosenCsv("reporte-errores.csv", content);
  };

  const confirm = async () => {
    await op.run();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
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
        {adapter && (
          <>
            <DialogHeader>
              <DialogTitle>{adapter.title}</DialogTitle>
              <DialogDescription>{phaseDescription(adapter, op)}</DialogDescription>
            </DialogHeader>

            {op.phase === "choose" && (
              <div className="flex flex-col gap-3 text-xs">
                <p className="text-muted-foreground">Columnas esperadas:</p>
                <ul className="list-disc pl-4">
                  {adapter.columns.map((c) => (
                    <li key={c.name}>
                      {c.name}
                      {c.required ? "" : " (opcional)"}
                    </li>
                  ))}
                </ul>
                {op.fatalError && <p className="text-destructive">{op.fatalError}</p>}
              </div>
            )}

            {op.phase === "review" && (
              <div className="flex flex-col gap-3">
                {op.preview.fatal || op.fatalError ? (
                  <p className="text-xs text-destructive">{op.preview.fatal ?? op.fatalError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {adapter.mode === "export"
                      ? `Se exportarán ${op.preview.ready} registro${op.preview.ready === 1 ? "" : "s"}.`
                      : `${op.preview.ready} fila${op.preview.ready === 1 ? "" : "s"} lista${op.preview.ready === 1 ? "" : "s"} para aplicar${
                          op.preview.skipped > 0 ? `, ${op.preview.skipped} se omitirán` : ""
                        }.`}
                  </p>
                )}
                <IssueList issues={op.preview.issues} warnings={op.preview.warnings} />
                {adapter.extraFields && !op.preview.fatal && (
                  <div className="flex flex-col gap-2">
                    {adapter.extraFields({ extra: op.extra, setExtra: op.setExtra, preview: op.preview })}
                  </div>
                )}
                {op.extraError && <p className="text-xs text-destructive">{op.extraError}</p>}
                {op.blockedByPolicy && (
                  <p className="text-xs text-destructive">
                    El archivo no hace match al 100%. Corrige el CSV para continuar.
                  </p>
                )}
              </div>
            )}

            {op.phase === "running" && op.progress && (
              <ProgressBar
                current={op.progress.current}
                total={op.progress.total}
                message={op.progress.message}
              />
            )}

            {op.phase === "summary" && op.result && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium">{summaryText(op.result, adapter.mode)}</p>
                <IssueList issues={op.result.issues} warnings={op.result.warnings} />
              </div>
            )}

            <DialogFooter>
              {op.phase === "choose" && (
                <>
                  {adapter.template && (
                    <Button variant="outline" size="sm" onClick={() => void downloadTemplate()}>
                      <Download />
                      Plantilla
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={close}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => void choose()}>
                    <Upload />
                    Elegir archivo
                  </Button>
                </>
              )}
              {op.phase === "review" && (
                <>
                  {adapter.mode === "import" && (
                    <Button variant="outline" size="sm" onClick={op.backToChoose}>
                      Cambiar archivo
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={close}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void confirm()}
                    disabled={!op.canConfirm}
                    className={cn(!op.canConfirm && "opacity-50")}
                  >
                    {adapter.mode === "export" ? (
                      <>
                        <FileSpreadsheet />
                        Exportar
                      </>
                    ) : (
                      (adapter.confirmLabel ?? "Importar")
                    )}
                  </Button>
                </>
              )}
              {op.phase === "summary" && (
                <>
                  {op.result && op.result.issues.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => void downloadReport()}>
                      <Download />
                      Reporte de errores
                    </Button>
                  )}
                  <Button size="sm" onClick={close}>
                    Cerrar
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function phaseDescription(
  adapter: CsvAdapter,
  op: ReturnType<typeof useCsvOperation>,
): string {
  if (op.phase === "choose") {
    return "Elige un archivo CSV. Puedes descargar una plantilla con las columnas esperadas.";
  }
  if (op.phase === "review") {
    return adapter.mode === "export"
      ? "Confirma para elegir dónde guardar el archivo."
      : "Revisa el archivo antes de aplicar los cambios.";
  }
  if (op.phase === "running") {
    return adapter.runningMessage ?? "Trabajando…";
  }
  return "Resultado de la operación.";
}
