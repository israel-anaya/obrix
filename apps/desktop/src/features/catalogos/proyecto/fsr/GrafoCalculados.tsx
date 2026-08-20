import { useMemo, useState } from "react";
import dagre from "dagre";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { identificadoresUsados, parsearFormula, type Escalar } from "@/lib/formulaEngine";
import { cn } from "@/lib/utils";
import type { CampoCalculado, Parametro, VariableCalculo } from "@/lib/types";

const ANCHO_NODO = 208;
const ALTO_NODO = 56;

type Resaltado = "activo" | "cadena" | "atenuado" | "normal";

interface DatosNodo {
  variable: VariableCalculo;
  valor: string;
  resaltado: Resaltado;
}

function fmtValor(valor: Escalar | undefined, variable: VariableCalculo): string {
  if (variable.tipo === "rango") return `${(variable.valor_default as unknown[] | undefined)?.length ?? 0} renglones`;
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "number") {
    return valor.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return "—";
}

function NodoVariable({ data }: NodeProps<DatosNodo>) {
  const { variable, valor, resaltado } = data;
  const esFormula = variable.tipo === "formula";
  return (
    <div
      className={cn(
        "rounded border px-2 py-1.5 text-xs shadow-sm transition-opacity",
        esFormula ? "bg-card" : "bg-muted/60",
        resaltado === "activo" && "border-primary ring-2 ring-primary",
        resaltado === "cadena" && "border-primary/70",
        resaltado === "atenuado" && "opacity-25",
      )}
      style={{ width: ANCHO_NODO }}
      title={(esFormula ? variable.formula : undefined) ?? variable.descripcion ?? undefined}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="truncate font-medium" title={variable.etiqueta}>
        {variable.etiqueta}
      </div>
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="truncate">{variable.id}</span>
        <span className="num shrink-0">{valor}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </div>
  );
}

const TIPOS_NODO = { variable: NodoVariable };

function calcularLayout(nodos: Node[], aristas: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 16, ranksep: 64 });
  g.setDefaultEdgeLabel(() => ({}));
  nodos.forEach((n) => g.setNode(n.id, { width: ANCHO_NODO, height: ALTO_NODO }));
  aristas.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodos.map((n) => {
    const { x, y } = g.node(n.id);
    return { ...n, position: { x: x - ANCHO_NODO / 2, y: y - ALTO_NODO / 2 } };
  });
}

/**
 * Grafo de dependencias entre parámetros y campos calculados — nodos por variable
 * (posicionados por nivel con dagre), aristas por cada identificador que usa una
 * fórmula. Al seleccionar un nodo se resalta toda su cadena (ancestros + descendientes)
 * y se atenúa el resto; cada nodo muestra su valor actual (de `resultadoBase`).
 */
export function GrafoCalculados({
  parametros,
  calculados,
  resultadoBase,
}: {
  parametros: Parametro[];
  calculados: CampoCalculado[];
  resultadoBase: Record<string, Escalar> | null;
}) {
  const [activo, setActivo] = useState<string | null>(null);

  const variables: VariableCalculo[] = useMemo(() => [...parametros, ...calculados], [parametros, calculados]);

  const { nodosLayout, aristasBase, dependencias, dependientes } = useMemo(() => {
    const ids = new Set(variables.map((v) => v.id));
    const dependencias = new Map<string, Set<string>>();
    const dependientes = new Map<string, Set<string>>();
    for (const v of variables) {
      dependencias.set(v.id, new Set());
      dependientes.set(v.id, new Set());
    }
    const aristasBase: Edge[] = [];
    for (const v of variables) {
      if (v.tipo !== "formula" || !v.formula) continue;
      let usados: Set<string>;
      try {
        usados = identificadoresUsados(parsearFormula(v.formula));
      } catch {
        continue;
      }
      for (const dep of usados) {
        if (!ids.has(dep) || dep === v.id) continue;
        dependencias.get(v.id)!.add(dep);
        dependientes.get(dep)!.add(v.id);
        aristasBase.push({ id: `${dep}->${v.id}`, source: dep, target: v.id });
      }
    }
    const nodosBase: Node[] = variables.map((v) => ({
      id: v.id,
      type: "variable",
      data: { variable: v, valor: "", resaltado: "normal" as Resaltado },
      position: { x: 0, y: 0 },
    }));
    return { nodosLayout: calcularLayout(nodosBase, aristasBase), aristasBase, dependencias, dependientes };
  }, [variables]);

  const cadena = useMemo(() => {
    if (!activo) return null;
    const arriba = new Set<string>();
    const abajo = new Set<string>();
    const subir = (id: string) => {
      for (const dep of dependencias.get(id) ?? []) {
        if (!arriba.has(dep)) {
          arriba.add(dep);
          subir(dep);
        }
      }
    };
    const bajar = (id: string) => {
      for (const dep of dependientes.get(id) ?? []) {
        if (!abajo.has(dep)) {
          abajo.add(dep);
          bajar(dep);
        }
      }
    };
    subir(activo);
    bajar(activo);
    return { arriba, abajo };
  }, [activo, dependencias, dependientes]);

  const resaltadoDe = (id: string): Resaltado => {
    if (!activo) return "normal";
    if (id === activo) return "activo";
    if (cadena?.arriba.has(id) || cadena?.abajo.has(id)) return "cadena";
    return "atenuado";
  };

  const nodes: Node<DatosNodo>[] = useMemo(
    () =>
      nodosLayout.map((n) => {
        const variable = (n.data as DatosNodo).variable;
        return {
          ...n,
          data: {
            variable,
            valor: fmtValor(resultadoBase?.[n.id], variable),
            resaltado: resaltadoDe(n.id),
          },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodosLayout, resultadoBase, activo, cadena],
  );

  const edges: Edge[] = useMemo(
    () =>
      aristasBase.map((e) => {
        const relevante = !activo || [e.source, e.target].every((id) => id === activo || cadena?.arriba.has(id) || cadena?.abajo.has(id));
        return {
          ...e,
          style: { opacity: relevante ? 1 : 0.12, strokeWidth: relevante && activo ? 2 : 1 },
        };
      }),
    [aristasBase, activo, cadena],
  );

  if (variables.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">No hay variables para graficar.</div>;
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={TIPOS_NODO}
        onNodeClick={(_, nodo) => setActivo((prev) => (prev === nodo.id ? null : nodo.id))}
        onPaneClick={() => setActivo(null)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-muted" />
      </ReactFlow>
    </div>
  );
}
