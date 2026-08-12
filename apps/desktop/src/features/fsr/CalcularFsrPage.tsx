import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Banknote, CalendarDays, Download, Landmark, Percent, Save, Settings2, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CAMPO_INPUT_CLASE } from "@/components/Campo";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { PruebaModeloCalculo } from "@/features/fsr/PruebaModeloCalculo";
import { validarModelo, type ValoresEntrada } from "@/lib/modeloCalculo";
import { escribirArchivoTexto, getFactorSalarioReal, leerArchivoTexto, updateFactorSalarioReal } from "@/lib/tauri";
import type { CampoCalculado, FactorSalarioReal, ModeloCalculo, Parametro, ValorRango } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTRO_JSON = [{ name: "JSON", extensions: ["json"] }];

/** Icono por grupo de parámetro — misma idea que las pestañas de un expediente técnico. */
const ICONOS_GRUPO: Record<string, LucideIcon> = {
  Salariales: Banknote,
  "Económicos": Landmark,
  "Días": CalendarDays,
  Tasas: Percent,
};

/** Nombre de archivo seguro a partir del nombre de la configuración FSR. */
function nombreArchivo(nombre: string): string {
  const slug = nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "fsr"}.json`;
}

/** Formato portable de exportación/importación: modelo de cálculo + parámetros capturados juntos en un solo archivo. */
interface ExportacionFsr {
  modelo: ModeloCalculo;
  valores_parametros: ValoresEntrada;
}

/** `valores` listo para exportar/guardar — nunca incluye parámetros tipo `rango` (ver nota en `valoresIniciales`). */
function capturablesSinRango(parametros: Parametro[], valores: ValoresEntrada): ValoresEntrada {
  const idsRango = new Set(parametros.filter((p) => p.tipo === "rango").map((p) => p.id));
  return Object.fromEntries(Object.entries(valores).filter(([id]) => !idsRango.has(id)));
}

/**
 * Solo para parámetros `numero`/`booleano` — los `rango` (ej. tabla de
 * cesantía-vejez) no son capturables por configuración de FSR, su valor
 * siempre sale de `valor_default` en el propio modelo (editable solo desde
 * "Editar modelo de cálculo"), nunca de `parametros_json`.
 */
function valoresIniciales(parametros: Parametro[], parametrosJson: string): ValoresEntrada {
  let capturados: ValoresEntrada = {};
  try {
    capturados = JSON.parse(parametrosJson);
  } catch {
    capturados = {};
  }
  const valores: ValoresEntrada = {};
  for (const p of parametros) {
    if (p.tipo === "rango") continue;
    valores[p.id] = capturados[p.id] ?? p.valor_default ?? (p.tipo === "booleano" ? false : 0);
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
  if (variable.tipo === "booleano") {
    return (
      <div className="grid grid-cols-[4fr_1fr] items-center gap-3">
        <span className="text-[11px] text-muted-foreground">{variable.etiqueta}</span>
        <select
          value={String(Boolean(valor))}
          onChange={(e) => onCambiar(e.target.value === "true")}
          className={cn(CAMPO_INPUT_CLASE, "mt-0")}
        >
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[4fr_1fr] items-center gap-3">
      <span className="text-[11px] text-muted-foreground">{variable.etiqueta}</span>
      <input
        type="number"
        step="any"
        value={typeof valor === "number" ? valor : 0}
        onChange={(e) => onCambiar(e.target.value === "" ? 0 : Number(e.target.value))}
        className={cn(CAMPO_INPUT_CLASE, "mt-0 campo-decimal text-right")}
      />
    </div>
  );
}

/** Grupo de parámetros como ficha de un expediente técnico: encabezado con icono + campos. */
function FichaGrupo({
  grupo,
  variables,
  valores,
  onCambiar,
}: {
  grupo: string;
  variables: Parametro[];
  valores: ValoresEntrada;
  onCambiar: (id: string, valor: number | boolean | ValorRango) => void;
}) {
  const Icono = ICONOS_GRUPO[grupo] ?? Settings2;
  return (
    <div className="self-start overflow-hidden rounded border border-border">
      <div className="flex items-center gap-1.5 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
        <Icono size={13} className="shrink-0" />
        {grupo}
      </div>
      <div className="flex flex-col gap-2 p-3">
        {variables.map((v) => (
          <CampoVariable
            key={v.id}
            variable={v}
            valor={valores[v.id] ?? (v.tipo === "booleano" ? false : v.tipo === "rango" ? [] : 0)}
            onCambiar={(valor) => onCambiar(v.id, valor)}
          />
        ))}
      </div>
    </div>
  );
}

export function CalcularFsrPage({ factorSalarioRealId }: { factorSalarioRealId: string }) {
  const [fila, setFila] = useState<FactorSalarioReal | null>(null);
  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [calculados, setCalculados] = useState<CampoCalculado[]>([]);
  const [valores, setValores] = useState<ValoresEntrada>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoAt, setGuardadoAt] = useState<string | null>(null);

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
    return () => {
      cancelado = true;
    };
  }, [factorSalarioRealId]);

  const set = (id: string, valor: number | boolean | ValorRango) => {
    setValores((prev) => ({ ...prev, [id]: valor }));
  };

  const errorModelo = useMemo(() => validarModelo(parametros, calculados), [parametros, calculados]);
  // Los tipo "rango" son tablas fijas por ley (ej. cesantía y vejez) — se editan en "Editar
  // modelo de cálculo", no tiene caso volver a pedirlas por cada configuración de FSR.
  const variablesEntrada = useMemo(
    () => parametros.filter((p) => p.id !== "salario_nominal" && p.tipo !== "rango"),
    [parametros],
  );
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

  // El bloque "Probar" abajo usa `valor_default` para todo salvo `salario_nominal` — se lo
  // pisamos con lo capturado arriba para que la prueba refleje esta configuración, en vivo.
  const parametrosConValoresCapturados = useMemo(
    () => parametros.map((p) => (p.id === "salario_nominal" ? p : { ...p, valor_default: valores[p.id] ?? p.valor_default })),
    [parametros, valores],
  );

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
        parametros_json: JSON.stringify(capturablesSinRango(parametros, valores)),
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
      const exportado: ExportacionFsr = {
        modelo: { parametros, calculados },
        valores_parametros: capturablesSinRango(parametros, valores),
      };
      await escribirArchivoTexto(path, JSON.stringify(exportado, null, 2));
    } catch (e) {
      setError(String(e));
    }
  };

  const importarJson = async () => {
    const path = await open({ filters: FILTRO_JSON, multiple: false });
    if (!path || typeof path !== "string") return;
    try {
      const contenido = await leerArchivoTexto(path);
      const datos = JSON.parse(contenido) as Partial<ExportacionFsr>;
      if (!datos.modelo?.parametros || !datos.modelo?.calculados) {
        setError("El archivo no tiene la forma esperada (falta 'modelo' con 'parametros'/'calculados').");
        return;
      }
      const errorModeloImportado = validarModelo(datos.modelo.parametros, datos.modelo.calculados);
      if (errorModeloImportado) {
        setError(`El modelo del archivo no es válido: ${errorModeloImportado}`);
        return;
      }
      setParametros(datos.modelo.parametros);
      setCalculados(datos.modelo.calculados);
      setFila((f) => (f ? { ...f, modelo_calculo_json: JSON.stringify(datos.modelo) } : f));
      setValores(valoresIniciales(datos.modelo.parametros, JSON.stringify(datos.valores_parametros ?? {})));
      setError(null);
    } catch {
      setError("No se pudo leer el archivo — verifica que sea un JSON de FSR (modelo + parámetros) válido.");
    }
  };

  if (cargando) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando parámetros de FSR…</div>;
  }
  if (!fila) {
    return <div className="p-6 text-sm text-destructive">{error ?? "No se pudo cargar esta configuración de FSR."}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          {guardadoAt && !guardando && <span className="text-xs text-muted-foreground">Guardado a las {guardadoAt}</span>}
          <BarraAcciones
            acciones={[
              { icono: Save, titulo: guardando ? "Guardando…" : "Guardar cambios", onClick: guardar, disabled: guardando || !!errorModelo },
              { icono: Download, titulo: "Exportar modelo y parámetros (JSON)", onClick: exportarJson },
              { icono: Upload, titulo: "Importar modelo y parámetros (JSON)", onClick: importarJson },
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

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="50" minSize="25" style={{ overflow: "auto" }}>
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            {grupos.map(({ grupo, variables }) => (
              <FichaGrupo key={grupo} grupo={grupo} variables={variables} valores={valores} onCambiar={set} />
            ))}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="50" minSize="25" className="bg-muted/40" style={{ overflow: "auto" }}>
          <div className="p-4">
            <PruebaModeloCalculo parametros={parametrosConValoresCapturados} calculados={calculados} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
