import { Fragment, useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Download, Save, Upload } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RangoEditor } from "@/features/fsr/RangoEditor";
import { ErrorFormula } from "@/lib/formulaEngine";
import { evaluarModelo, validarModelo, type ValoresEntrada } from "@/lib/modeloCalculo";
import {
  escribirArchivoTexto,
  getFactorSalarioReal,
  leerArchivoTexto,
  listCategoriasFsr,
  updateFactorSalarioReal,
} from "@/lib/tauri";
import type { CampoCalculado, CategoriaFsr, FactorSalarioReal, ModeloCalculo, Parametro, ValorRango } from "@/lib/types";

const FILTRO_JSON = [{ name: "JSON", extensions: ["json"] }];

/** Nombre de archivo seguro a partir del nombre de la configuración FSR. */
function nombreArchivo(nombre: string): string {
  const slug = nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "fsr"}.json`;
}

function valoresIniciales(parametros: Parametro[], parametrosJson: string): ValoresEntrada {
  let capturados: ValoresEntrada = {};
  try {
    capturados = JSON.parse(parametrosJson);
  } catch {
    capturados = {};
  }
  const valores: ValoresEntrada = {};
  for (const p of parametros) {
    valores[p.id] = capturados[p.id] ?? p.valor_default ?? (p.tipo === "booleano" ? false : p.tipo === "rango" ? [] : 0);
  }
  return valores;
}

function CampoVariable({
  variable,
  valor,
  onCambiar,
}: {
  variable: Parametro;
  valor: number | boolean | ValorRango;
  onCambiar: (valor: number | boolean | ValorRango) => void;
}) {
  const ayuda = (variable.descripcion || variable.referencia_legal) && (
    <span className="text-xs text-muted-foreground">
      {variable.descripcion}
      {variable.descripcion && variable.referencia_legal && " — "}
      {variable.referencia_legal}
    </span>
  );

  if (variable.tipo === "booleano") {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm">{variable.etiqueta}</span>
        {ayuda}
        <Select value={String(Boolean(valor))} onValueChange={(v) => onCambiar(v === "true")}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Sí</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      </label>
    );
  }
  if (variable.tipo === "rango") {
    return (
      <div className="col-span-full flex flex-col gap-1">
        <span className="text-sm">{variable.etiqueta}</span>
        {ayuda}
        <RangoEditor renglones={valor as ValorRango} onCambiar={onCambiar} />
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm">{variable.etiqueta}</span>
      {ayuda}
      <Input
        type="number"
        step="any"
        value={typeof valor === "number" ? valor : 0}
        onChange={(e) => onCambiar(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </label>
  );
}

export function FsrPage({ factorSalarioRealId }: { factorSalarioRealId: string }) {
  const [fila, setFila] = useState<FactorSalarioReal | null>(null);
  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [calculados, setCalculados] = useState<CampoCalculado[]>([]);
  const [valores, setValores] = useState<ValoresEntrada>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoAt, setGuardadoAt] = useState<string | null>(null);

  const [categorias, setCategorias] = useState<CategoriaFsr[]>([]);
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [salarioNominal, setSalarioNominal] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    getFactorSalarioReal(factorSalarioRealId)
      .then((f) => {
        if (cancelado) return;
        const modelo: ModeloCalculo = JSON.parse(f.modelo_calculo_json);
        setFila(f);
        setParametros(modelo.parametros ?? []);
        setCalculados(modelo.calculados ?? []);
        setValores(valoresIniciales(modelo.parametros ?? [], f.parametros_json));
      })
      .catch((e) => setError(String(e)))
      .finally(() => !cancelado && setCargando(false));
    listCategoriasFsr()
      .then(setCategorias)
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [factorSalarioRealId]);

  const set = (id: string, valor: number | boolean | ValorRango) => {
    setValores((prev) => ({ ...prev, [id]: valor }));
  };

  const errorModelo = useMemo(() => validarModelo(parametros, calculados), [parametros, calculados]);
  const variablesEntrada = useMemo(() => parametros.filter((p) => p.id !== "salario_nominal"), [parametros]);
  const idsVariablesNumero = useMemo(() => parametros.filter((p) => p.tipo === "numero").map((p) => p.id), [parametros]);
  const grupos = useMemo(() => {
    const orden: string[] = [];
    const porGrupo = new Map<string, Parametro[]>();
    variablesEntrada.forEach((v) => {
      const g = v.grupo || "General";
      if (!porGrupo.has(g)) {
        porGrupo.set(g, []);
        orden.push(g);
      }
      porGrupo.get(g)!.push(v);
    });
    return orden.map((g) => ({ grupo: g, variables: porGrupo.get(g)! }));
  }, [variablesEntrada]);

  const faltanDatosBase = idsVariablesNumero.some((id) => (valores[id] as number) <= 0 && (id === "uma" || id === "salario_minimo"));

  const guardar = async () => {
    if (!fila || errorModelo) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizado = await updateFactorSalarioReal(fila.id, {
        nombre: fila.nombre,
        region_id: fila.region_id,
        modelo_calculo_json: fila.modelo_calculo_json,
        vigencia_desde: fila.vigencia_desde,
        vigencia_hasta: fila.vigencia_hasta,
        parametros_json: JSON.stringify(valores),
      });
      setFila(actualizado);
      setGuardadoAt(new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const exportarJson = async () => {
    if (!fila) return;
    const path = await save({ filters: FILTRO_JSON, defaultPath: nombreArchivo(fila.nombre) });
    if (!path) return;
    try {
      await escribirArchivoTexto(path, JSON.stringify(valores, null, 2));
    } catch (e) {
      setError(String(e));
    }
  };

  const importarJson = async () => {
    const path = await open({ filters: FILTRO_JSON, multiple: false });
    if (!path || typeof path !== "string") return;
    try {
      const contenido = await leerArchivoTexto(path);
      const importado = { ...valores, ...JSON.parse(contenido) } as ValoresEntrada;
      setValores(importado);
      setError(null);
    } catch {
      setError("No se pudo leer el archivo — verifica que sea un JSON de parámetros FSR válido.");
    }
  };

  const resultado = useMemo(() => {
    if (errorModelo || salarioNominal <= 0) return null;
    try {
      return evaluarModelo(parametros, calculados, { ...valores, salario_nominal: salarioNominal });
    } catch (e) {
      return e instanceof ErrorFormula ? { error: e.message } : null;
    }
  }, [parametros, calculados, valores, salarioNominal, errorModelo]);

  if (cargando) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando parámetros de FSR…</div>;
  }
  if (!fila) {
    return <div className="p-6 text-sm text-destructive">{error ?? "No se pudo cargar esta configuración de FSR."}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold">FRS · {fila.nombre}</h2>
          <p className="text-xs text-muted-foreground">
            Captura los datos oficiales del ejercicio (UMA, IMSS, días de la LFT) — para cambiar CÓMO se calcula, usa el
            ícono "Editar modelo de cálculo" en la lista de Factores de Salario Real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {guardadoAt && !guardando && <span className="text-xs text-muted-foreground">Guardado a las {guardadoAt}</span>}
          <BarraAcciones
            acciones={[
              { icono: Save, titulo: guardando ? "Guardando…" : "Guardar cambios", onClick: guardar, disabled: guardando || !!errorModelo },
              { icono: Download, titulo: "Exportar JSON portable", onClick: exportarJson },
              { icono: Upload, titulo: "Importar JSON portable", onClick: importarJson },
            ]}
          />
        </div>
      </div>

      {error && <p className="border-b border-border px-4 py-1.5 text-xs text-destructive">{error}</p>}
      {errorModelo && (
        <div className="flex items-center gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertTriangle size={14} className="shrink-0" />
          El modelo de cálculo tiene un problema: {errorModelo}
        </div>
      )}

      {!errorModelo && faltanDatosBase && (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle size={14} className="shrink-0" />
          Antes de calcular necesitas capturar la UMA y el salario mínimo vigentes del ejercicio.
        </div>
      )}

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="60" minSize="40" style={{ overflow: "auto" }}>
          <Accordion type="multiple" defaultValue={grupos.map((g) => g.grupo)} className="py-2">
            {grupos.map(({ grupo, variables: vs }) => (
              <AccordionItem key={grupo} value={grupo} className="px-4">
                <AccordionTrigger>{grupo}</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2">
                    {vs.map((v) => (
                      <CampoVariable
                        key={v.id}
                        variable={v}
                        valor={valores[v.id] ?? (v.tipo === "booleano" ? false : v.tipo === "rango" ? [] : 0)}
                        onCambiar={(valor) => set(v.id, valor)}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="40" minSize="28" className="flex flex-col bg-muted/40" style={{ overflow: "auto" }}>
          <div className="flex flex-col gap-4 p-4">
            <h3 className="text-sm font-semibold">Calculadora rápida</h3>
            <p className="text-xs text-muted-foreground">
              Prueba el efecto de estos parámetros sobre un salario, sin salir de esta pantalla.
            </p>

            {categorias.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="text-sm">Categoría (opcional, solo de referencia)</span>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm">Salario nominal diario</span>
              <span className="text-xs text-muted-foreground">Lo que se pacta con el trabajador, antes de integrar prestaciones.</span>
              <div className="flex items-center gap-2">
                <Input type="number" step="any" value={salarioNominal} onChange={(e) => setSalarioNominal(Number(e.target.value))} />
                <span className="w-14 shrink-0 text-xs text-muted-foreground">MXN</span>
              </div>
            </label>

            {resultado && "error" in resultado && <p className="text-xs text-destructive">{resultado.error}</p>}

            {resultado && !("error" in resultado) && (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Factor de Salario Real</p>
                    <p className="text-2xl font-semibold num">{Number(resultado.scope.fsr).toFixed(6)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Salario real diario</p>
                    <p className="text-2xl font-semibold num">
                      ${Number(resultado.scope.monto_salario_real).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {resultado.scope.es_salario_minimo === true && (
                  <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                    Este salario es igual o menor al mínimo: el patrón absorbe toda la cuota IMSS del trabajador
                    (Art. 36 LSS).
                  </p>
                )}

                <div>
                  <p className="mb-1 text-xs font-medium">Campos calculados</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {calculados
                      .filter((v) => v.id !== "fsr" && v.id !== "monto_salario_real")
                      .map((v) => (
                        <Fragment key={v.id}>
                          <dt className="truncate text-muted-foreground" title={v.etiqueta}>
                            {v.etiqueta}
                          </dt>
                          <dd className="text-right num">
                            {typeof resultado.scope[v.id] === "boolean" ? (resultado.scope[v.id] ? "Sí" : "No") : String(resultado.scope[v.id])}
                          </dd>
                        </Fragment>
                      ))}
                  </dl>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
