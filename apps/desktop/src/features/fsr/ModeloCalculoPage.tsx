import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, ListTree, Plus, Save, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CatalogoGrid, type CatalogoGridConfig, type CatalogoGridHandle, type Fila } from "@/features/catalogos/CatalogoGrid";
import { GrafoCalculados } from "@/features/fsr/GrafoCalculados";
import { PruebaModeloCalculo } from "@/features/fsr/PruebaModeloCalculo";
import { RangoEditor } from "@/features/fsr/RangoEditor";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { evaluarModelo, validarModelo } from "@/lib/modeloCalculo";
import { getFactorSalarioReal, updateFactorSalarioReal } from "@/lib/tauri";
import {
  TIPOS_PARAMETRO,
  type CampoCalculado,
  type FactorSalarioReal,
  type ModeloCalculo,
  type Parametro,
  type TipoParametro,
  type ValorRango,
} from "@/lib/types";

function filaAParametro(fila: Fila): Parametro {
  const tipo = (TIPOS_PARAMETRO as readonly string[]).includes(String(fila.tipo))
    ? (fila.tipo as TipoParametro)
    : "numero";
  const base: Omit<Parametro, "valor_default"> = {
    id: String(fila.id).trim(),
    etiqueta: String(fila.etiqueta),
    grupo: String(fila.grupo) || "General",
    tipo,
    referencia_legal: String(fila.referencia_legal) || undefined,
    descripcion: String(fila.descripcion) || undefined,
  };
  if (tipo === "rango") {
    return { ...base, valor_default: [{ clasificacion: "", inferior: 0, superior: null, valor: 0 }] };
  }
  if (tipo === "booleano") {
    return { ...base, valor_default: Number(fila.valor_default) !== 0 };
  }
  return { ...base, valor_default: Number(fila.valor_default) || 0 };
}

function filaACalculado(fila: Fila): CampoCalculado {
  return {
    id: String(fila.id).trim(),
    etiqueta: String(fila.etiqueta),
    tipo: "formula",
    formula: String(fila.formula),
    referencia_legal: String(fila.referencia_legal) || undefined,
    descripcion: String(fila.descripcion) || undefined,
  };
}

const COLUMNAS_PARAMETROS: CatalogoGridConfig["columnas"] = [
  { campo: "grupo", encabezado: "Categoría", ancho: 94, sinFiltro: true },
  { campo: "id", encabezado: "Id", ancho: 200 },
  { campo: "etiqueta", encabezado: "Etiqueta", ancho: 260 },
  { campo: "tipo", encabezado: "Tipo", ancho: 75, opciones: TIPOS_PARAMETRO, sinFiltro: true },
  { campo: "valor_default", encabezado: "Default", ancho: 88, numero: true, sinFiltro: true },
  { campo: "referencia_legal", encabezado: "Referencia legal", ancho: 220, sinFiltro: true },
  { campo: "descripcion", encabezado: "Descripción", ancho: 420, sinFiltro: true },
];

const COLUMNAS_CALCULADOS: CatalogoGridConfig["columnas"] = [
  { campo: "id", encabezado: "Id", ancho: 220 },
  { campo: "etiqueta", encabezado: "Etiqueta", ancho: 260 },
  { campo: "formula", encabezado: "Fórmula", ancho: 400, sinFiltro: true },
  { campo: "referencia_legal", encabezado: "Referencia legal", ancho: 220, sinFiltro: true },
  { campo: "descripcion", encabezado: "Descripción", ancho: 420, sinFiltro: true },
];

// Constantes de módulo, no objetos literales en el JSX: `CatalogoGrid` memoiza
// sus columnas por la identidad de `config.columnas`, así que un literal nuevo
// en cada render rehace las `ColumnDef` y con ellas todas las celdas.
const CONFIG_PARAMETROS: CatalogoGridConfig = { titulo: "Parámetros", columnas: COLUMNAS_PARAMETROS };
const CONFIG_CALCULADOS: CatalogoGridConfig = { titulo: "Campos calculados", columnas: COLUMNAS_CALCULADOS };

export function ModeloCalculoPage({ factorSalarioRealId }: { factorSalarioRealId: string }) {
  const [fila, setFila] = useState<FactorSalarioReal | null>(null);
  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [calculados, setCalculados] = useState<CampoCalculado[]>([]);
  const [pestaña, setPestaña] = useState<"parametros" | "calculados" | "grafo">("parametros");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoAt, setGuardadoAt] = useState<string | null>(null);
  const [indiceRangoAbierto, setIndiceRangoAbierto] = useState<number | null>(null);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  const gridParametrosRef = useRef<CatalogoGridHandle>(null);
  const gridCalculadosRef = useRef<CatalogoGridHandle>(null);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState<number | null>(null);

  useEffect(() => {
    getFactorSalarioReal(factorSalarioRealId)
      .then((f) => {
        setFila(f);
        try {
          const modelo: ModeloCalculo = JSON.parse(f.modelo_calculo_json);
          setParametros(modelo.parametros ?? []);
          setCalculados(modelo.calculados ?? []);
        } catch {
          setParametros([]);
          setCalculados([]);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, [factorSalarioRealId]);

  const errorValidacion = useMemo(() => validarModelo(parametros, calculados), [parametros, calculados]);

  // Valores del modelo evaluado con los `valor_default` de cada parámetro — solo para mostrar
  // en el grafo de campos calculados, no está atado a ninguna fila de prueba de la pestaña Probar.
  const resultadoBaseGrafo = useMemo(() => {
    if (errorValidacion) return null;
    try {
      return evaluarModelo(parametros, calculados, {}).scope;
    } catch {
      return null;
    }
  }, [parametros, calculados, errorValidacion]);

  const filasParametros: Fila[] = useMemo(
    () =>
      parametros.map((v, i) => ({
        _id: String(i),
        id: v.id,
        etiqueta: v.etiqueta,
        grupo: v.grupo,
        tipo: v.tipo,
        valor_default: v.tipo === "numero" ? (typeof v.valor_default === "number" ? v.valor_default : 0) : v.tipo === "booleano" ? (v.valor_default ? 1 : 0) : 0,
        referencia_legal: v.referencia_legal ?? "",
        descripcion: v.descripcion ?? "",
      })),
    [parametros],
  );

  const filasCalculados: Fila[] = useMemo(
    () =>
      calculados.map((v, i) => ({
        _id: String(i),
        id: v.id,
        etiqueta: v.etiqueta,
        formula: v.formula ?? "",
        referencia_legal: v.referencia_legal ?? "",
        descripcion: v.descripcion ?? "",
      })),
    [calculados],
  );

  const patchParametro = (indice: number, patch: Partial<Parametro>) => {
    setParametros((vs) => vs.map((v, i) => (i === indice ? { ...v, ...patch } : v)));
  };
  const patchCalculado = (indice: number, patch: Partial<CampoCalculado>) => {
    setCalculados((vs) => vs.map((v, i) => (i === indice ? { ...v, ...patch } : v)));
  };
  const eliminarParametros = (indices: number[]) => {
    const set = new Set(indices);
    setParametros((vs) => vs.filter((_, i) => !set.has(i)));
    setIndiceSeleccionado(null);
  };
  const eliminarCalculados = (indices: number[]) => {
    const set = new Set(indices);
    setCalculados((vs) => vs.filter((_, i) => !set.has(i)));
    setIndiceSeleccionado(null);
  };

  const aplicarEdicionParametro = (fila: Fila) => {
    const indice = Number(fila._id);
    const previo = parametros[indice];
    const tipo = fila.tipo as TipoParametro;
    const patch: Partial<Parametro> = {
      id: String(fila.id).trim(),
      etiqueta: String(fila.etiqueta),
      grupo: String(fila.grupo) || "General",
      tipo,
      referencia_legal: String(fila.referencia_legal) || undefined,
      descripcion: String(fila.descripcion) || undefined,
    };
    if (tipo === "rango") {
      patch.valor_default = previo?.tipo === "rango" ? previo.valor_default : [{ clasificacion: "", inferior: 0, superior: null, valor: 0 }];
    } else if (tipo === "booleano") {
      patch.valor_default = Number(fila.valor_default) !== 0;
    } else {
      patch.valor_default = Number(fila.valor_default) || 0;
    }
    patchParametro(indice, patch);
  };

  const aplicarEdicionCalculado = (fila: Fila) => {
    const indice = Number(fila._id);
    patchCalculado(indice, {
      id: String(fila.id).trim(),
      etiqueta: String(fila.etiqueta),
      formula: String(fila.formula),
      referencia_legal: String(fila.referencia_legal) || undefined,
      descripcion: String(fila.descripcion) || undefined,
    });
  };

  const guardar = async () => {
    if (!fila || errorValidacion) return;
    setGuardando(true);
    setError(null);
    try {
      const modelo: ModeloCalculo = { parametros, calculados };
      const actualizado = await updateFactorSalarioReal(factorSalarioRealId, {
        nombre: fila.nombre,
        region_id: fila.region_id,
        parametros_json: fila.parametros_json,
        modelo_calculo_json: JSON.stringify(modelo),
      });
      setFila(actualizado);
      setGuardadoAt(new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const puedeEditarRango = pestaña === "parametros" && indiceSeleccionado !== null && parametros[indiceSeleccionado]?.tipo === "rango";

  if (cargando) return <div className="p-6 text-sm text-muted-foreground">Cargando modelo de cálculo…</div>;
  if (!fila) return <div className="p-6 text-sm text-destructive">{error ?? "No se pudo cargar esta configuración de FSR."}</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          {guardadoAt && !guardando && <span className="text-xs text-muted-foreground">Guardado a las {guardadoAt}</span>}
          <BarraAcciones
            acciones={[
              {
                icono: Plus,
                titulo: pestaña === "calculados" ? "Agregar campo calculado" : "Agregar parámetro",
                onClick: () => (pestaña === "parametros" ? gridParametrosRef : gridCalculadosRef).current?.agregarFila(),
                disabled: pestaña === "grafo",
              },
              {
                icono: ListTree,
                titulo: "Editar rango",
                onClick: () => setIndiceRangoAbierto(indiceSeleccionado),
                disabled: !puedeEditarRango,
              },
              {
                icono: Trash2,
                titulo: "Eliminar seleccionado",
                onClick: () => (pestaña === "parametros" ? gridParametrosRef : gridCalculadosRef).current?.eliminarFilaSeleccionada(),
                disabled: pestaña === "grafo" || indiceSeleccionado === null,
              },
              { icono: Save, titulo: guardando ? "Guardando…" : "Guardar cambios", onClick: guardar, disabled: guardando || !!errorValidacion },
              { icono: HelpCircle, titulo: "Ayuda sobre fórmulas", onClick: () => setAyudaAbierta(true), disabled: pestaña === "grafo" },
            ]}
          />
        </div>
      </div>

      {error && <p className="border-b border-border px-4 py-1.5 text-xs text-destructive">{error}</p>}
      {errorValidacion && (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle size={14} className="shrink-0" />
          {errorValidacion}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-sm",
              pestaña === "parametros" ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground",
            )}
            onClick={() => {
              setPestaña("parametros");
              setIndiceSeleccionado(null);
            }}
          >
            Parámetros ({parametros.length})
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-sm",
              pestaña === "calculados" ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground",
            )}
            onClick={() => {
              setPestaña("calculados");
              setIndiceSeleccionado(null);
            }}
          >
            Campos calculados ({calculados.length})
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-sm",
              pestaña === "grafo" ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground",
            )}
            onClick={() => {
              setPestaña("grafo");
              setIndiceSeleccionado(null);
            }}
          >
            Grafo
          </button>
        </div>

        {pestaña === "parametros" && (
          <div className="min-h-0 flex-1">
            <CatalogoGrid
              key="parametros"
              ref={gridParametrosRef}
              config={CONFIG_PARAMETROS}
              filasIniciales={filasParametros}
              modoSeleccion="unica"
              onFilaSeleccionada={(fila) => setIndiceSeleccionado(fila ? Number(fila._id) : null)}
              onAgregarFila={(fila) => setParametros((vs) => [...vs, filaAParametro(fila)])}
              onEliminarFilas={(ids) => eliminarParametros(ids.map(Number))}
              onCeldaEditada={aplicarEdicionParametro}
            />
          </div>
        )}

        {pestaña === "calculados" && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="h-1/4 min-h-0">
              <CatalogoGrid
                key="calculados"
                ref={gridCalculadosRef}
                config={CONFIG_CALCULADOS}
                filasIniciales={filasCalculados}
                modoSeleccion="unica"
                onFilaSeleccionada={(fila) => setIndiceSeleccionado(fila ? Number(fila._id) : null)}
                onAgregarFila={(fila) => setCalculados((vs) => [...vs, filaACalculado(fila)])}
                onEliminarFilas={(ids) => eliminarCalculados(ids.map(Number))}
                onCeldaEditada={aplicarEdicionCalculado}
              />
            </div>
            <div className="flex h-3/4 min-h-0 flex-col">
              <PruebaModeloCalculo parametros={parametros} calculados={calculados} />
            </div>
          </div>
        )}

        {pestaña === "grafo" && (
          <div className="min-h-0 flex-1">
            <GrafoCalculados parametros={parametros} calculados={calculados} resultadoBase={resultadoBaseGrafo} />
          </div>
        )}
      </div>

      <Sheet open={indiceRangoAbierto !== null} onOpenChange={(open) => !open && setIndiceRangoAbierto(null)}>
        <SheetContent className="w-full max-w-[128rem] overflow-y-auto p-4 data-[side=right]:sm:max-w-[128rem]">
          <SheetHeader>
            <SheetTitle>Renglones de "{indiceRangoAbierto !== null ? parametros[indiceRangoAbierto]?.etiqueta : ""}"</SheetTitle>
            <SheetDescription>
              Cada renglón cubre un rango de valores (inferior a superior). El renglón sin "superior" queda abierto
              por arriba.
            </SheetDescription>
          </SheetHeader>
          {indiceRangoAbierto !== null && parametros[indiceRangoAbierto]?.tipo === "rango" && (
            <div className="mt-4">
              <RangoEditor
                renglones={(parametros[indiceRangoAbierto].valor_default as ValorRango) ?? []}
                onCambiar={(renglones) => patchParametro(indiceRangoAbierto, { valor_default: renglones })}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={ayudaAbierta} onOpenChange={setAyudaAbierta}>
        <SheetContent className="w-full max-w-md overflow-y-auto p-4">
          <SheetHeader>
            <SheetTitle>Ayuda sobre fórmulas</SheetTitle>
            <SheetDescription>Cómo escribir la fórmula de un campo calculado.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 text-xs">
            <p className="text-muted-foreground">
              Usa el id de cualquier otra variable (parámetro o campo calculado) directamente en la fórmula.
            </p>
            <div>
              <p className="mb-1.5 font-medium">Funciones disponibles</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">round(x, n)</code> — redondea{" "}
                  <code className="text-foreground">x</code> a <code className="text-foreground">n</code> decimales.
                </li>
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">min(a, b)</code> /{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">max(a, b)</code> — el menor o mayor de dos valores.
                </li>
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">abs(x)</code> — valor absoluto.
                </li>
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">if(cond, a, b)</code> — <code className="text-foreground">a</code> si{" "}
                  <code className="text-foreground">cond</code> es verdadero, si no <code className="text-foreground">b</code>.
                </li>
                <li>
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">rango('id_variable', valor)</code> — busca el renglón de un
                  parámetro tipo "rango" que cubre <code className="text-foreground">valor</code> y devuelve su valor.
                </li>
              </ul>
            </div>
            <p className="text-muted-foreground">
              Para capturar los renglones de un parámetro tipo "rango", selecciónalo en la pestaña Parámetros y usa el
              ícono "Editar rango".
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
