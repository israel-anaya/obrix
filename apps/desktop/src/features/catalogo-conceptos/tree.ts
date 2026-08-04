import type { Concepto } from "@/lib/types";

export interface ConceptoConProfundidad extends Concepto {
  profundidad: number;
}

/** Aplana el árbol de conceptos en orden de aparición (padres antes que hijos),
 * conservando la profundidad para poder indentar en la tabla. */
export function aplanarArbol(conceptos: Concepto[]): ConceptoConProfundidad[] {
  const porPadre = new Map<string | null, Concepto[]>();
  for (const c of conceptos) {
    const lista = porPadre.get(c.parent_id) ?? [];
    lista.push(c);
    porPadre.set(c.parent_id, lista);
  }

  const resultado: ConceptoConProfundidad[] = [];
  const visitar = (parentId: string | null, profundidad: number) => {
    for (const c of porPadre.get(parentId) ?? []) {
      resultado.push({ ...c, profundidad });
      visitar(c.id, profundidad + 1);
    }
  };
  visitar(null, 0);
  return resultado;
}
