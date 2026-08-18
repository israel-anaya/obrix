import { Download, FileSpreadsheet, Upload } from "lucide-react";
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
import { escribirCsvElegido, leerCsvElegido } from "@/components/csv/archivos";
import type { CsvAdaptador, CsvProblema, CsvResultado } from "@/components/csv/tipos";
import { useCsvOperacion } from "@/components/csv/useCsvOperacion";
import { generarCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

function ListaProblemas({ problemas, avisos }: { problemas: CsvProblema[]; avisos: string[] }) {
  if (problemas.length === 0 && avisos.length === 0) return null;
  const grupos = new Map<string, string[]>();
  for (const p of problemas) {
    const g = p.grupo ?? "Problemas";
    (grupos.get(g) ?? grupos.set(g, []).get(g)!).push(p.mensaje);
  }
  return (
    <div className="flex max-h-64 flex-col gap-3 overflow-auto text-xs">
      {avisos.map((a) => (
        <p key={a} className="text-muted-foreground">
          {a}
        </p>
      ))}
      {[...grupos.entries()].map(([grupo, mensajes]) => (
        <div key={grupo}>
          <p className="font-medium text-amber-600">{grupo}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground">
            {mensajes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function textoResumen(r: CsvResultado, modo: "importar" | "exportar"): string {
  if (modo === "exportar") {
    const n = r.creados || r.actualizados;
    return r.ruta
      ? `Se exportaron ${n} registro${n === 1 ? "" : "s"} a ${r.ruta}.`
      : `Se exportaron ${n} registro${n === 1 ? "" : "s"}.`;
  }
  const partes: string[] = [];
  if (r.creados > 0) partes.push(`${r.creados} creado${r.creados === 1 ? "" : "s"}`);
  if (r.actualizados > 0) partes.push(`${r.actualizados} actualizado${r.actualizados === 1 ? "" : "s"}`);
  if (r.omitidos > 0) partes.push(`${r.omitidos} omitido${r.omitidos === 1 ? "" : "s"}`);
  if (r.problemas.length > 0) {
    partes.push(`${r.problemas.length} con problemas`);
  }
  if (partes.length === 0) return "No se aplicó ningún cambio.";
  return `Importación completa: ${partes.join(", ")}.`;
}

export function CsvOperacionDialog({
  adaptador,
  onCerrar,
  onTerminado,
}: {
  adaptador: CsvAdaptador | null;
  onCerrar: () => void;
  onTerminado?: () => void;
}) {
  const abierto = adaptador !== null;
  const op = useCsvOperacion(adaptador);
  const ejecutando = op.fase === "ejecutando";

  const cerrar = () => {
    if (ejecutando) return;
    if (op.fase === "resumen") onTerminado?.();
    onCerrar();
  };

  const elegir = async () => {
    try {
      const elegido = await leerCsvElegido();
      if (!elegido) return;
      await op.cargarArchivo(elegido.path, elegido.contenido);
    } catch (e) {
      op.marcarFatal(String(e));
    }
  };

  const descargarPlantilla = async () => {
    if (!adaptador?.plantilla) return;
    const nombre = adaptador.archivoDefault ?? "plantilla.csv";
    await escribirCsvElegido(nombre.replace(/\.csv$/i, "") + "-plantilla.csv", adaptador.plantilla());
  };

  const descargarReporte = async () => {
    if (!op.resultado || op.resultado.problemas.length === 0) return;
    const contenido = generarCsv(
      ["Grupo", "Mensaje"],
      op.resultado.problemas.map((p) => [p.grupo ?? "", p.mensaje]),
    );
    await escribirCsvElegido("reporte-errores.csv", contenido);
  };

  const confirmar = async () => {
    await op.ejecutar();
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) cerrar();
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
        {adaptador && (
          <>
            <DialogHeader>
              <DialogTitle>{adaptador.titulo}</DialogTitle>
              <DialogDescription>{descripcionFase(adaptador, op)}</DialogDescription>
            </DialogHeader>

            {op.fase === "elegir" && (
              <div className="flex flex-col gap-3 text-xs">
                <p className="text-muted-foreground">Columnas esperadas:</p>
                <ul className="list-disc pl-4">
                  {adaptador.columnas.map((c) => (
                    <li key={c.nombre}>
                      {c.nombre}
                      {c.obligatorio ? "" : " (opcional)"}
                    </li>
                  ))}
                </ul>
                {op.errorFatal && <p className="text-destructive">{op.errorFatal}</p>}
              </div>
            )}

            {op.fase === "revisar" && (
              <div className="flex flex-col gap-3">
                {op.preview.fatal || op.errorFatal ? (
                  <p className="text-xs text-destructive">{op.preview.fatal ?? op.errorFatal}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {adaptador.modo === "exportar"
                      ? `Se exportarán ${op.preview.listos} registro${op.preview.listos === 1 ? "" : "s"}.`
                      : `${op.preview.listos} fila${op.preview.listos === 1 ? "" : "s"} lista${op.preview.listos === 1 ? "" : "s"} para aplicar${
                          op.preview.omitidos > 0 ? `, ${op.preview.omitidos} se omitirán` : ""
                        }.`}
                  </p>
                )}
                <ListaProblemas problemas={op.preview.problemas} avisos={op.preview.avisos} />
                {adaptador.extraCampos && !op.preview.fatal && (
                  <div className="flex flex-col gap-2">
                    {adaptador.extraCampos({ extra: op.extra, setExtra: op.setExtra, preview: op.preview })}
                  </div>
                )}
                {op.extraError && <p className="text-xs text-destructive">{op.extraError}</p>}
                {op.bloqueadoPorPolitica && (
                  <p className="text-xs text-destructive">
                    El archivo no hace match al 100%. Corrige el CSV para continuar.
                  </p>
                )}
              </div>
            )}

            {op.fase === "ejecutando" && op.progreso && (
              <BarraProgreso
                actual={op.progreso.actual}
                total={op.progreso.total}
                mensaje={op.progreso.mensaje}
              />
            )}

            {op.fase === "resumen" && op.resultado && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium">{textoResumen(op.resultado, adaptador.modo)}</p>
                <ListaProblemas problemas={op.resultado.problemas} avisos={op.resultado.avisos} />
              </div>
            )}

            <DialogFooter>
              {op.fase === "elegir" && (
                <>
                  {adaptador.plantilla && (
                    <Button variant="outline" size="sm" onClick={() => void descargarPlantilla()}>
                      <Download />
                      Plantilla
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={cerrar}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => void elegir()}>
                    <Upload />
                    Elegir archivo
                  </Button>
                </>
              )}
              {op.fase === "revisar" && (
                <>
                  {adaptador.modo === "importar" && (
                    <Button variant="outline" size="sm" onClick={op.volverAElegir}>
                      Cambiar archivo
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={cerrar}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void confirmar()}
                    disabled={!op.puedeConfirmar}
                    className={cn(!op.puedeConfirmar && "opacity-50")}
                  >
                    {adaptador.modo === "exportar" ? (
                      <>
                        <FileSpreadsheet />
                        Exportar
                      </>
                    ) : (
                      (adaptador.etiquetaConfirmar ?? "Importar")
                    )}
                  </Button>
                </>
              )}
              {op.fase === "resumen" && (
                <>
                  {op.resultado && op.resultado.problemas.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => void descargarReporte()}>
                      <Download />
                      Reporte de errores
                    </Button>
                  )}
                  <Button size="sm" onClick={cerrar}>
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

function descripcionFase(
  adaptador: CsvAdaptador,
  op: ReturnType<typeof useCsvOperacion>,
): string {
  if (op.fase === "elegir") {
    return "Elige un archivo CSV. Puedes descargar una plantilla con las columnas esperadas.";
  }
  if (op.fase === "revisar") {
    return adaptador.modo === "exportar"
      ? "Confirma para elegir dónde guardar el archivo."
      : "Revisa el archivo antes de aplicar los cambios.";
  }
  if (op.fase === "ejecutando") {
    return adaptador.mensajeEjecutando ?? "Trabajando…";
  }
  return "Resultado de la operación.";
}
