import type { Concepto, NuevoConcepto } from "@/lib/types";
import { ConceptoForm } from "./ConceptoForm";
import { aplanarArbol } from "./tree";

export function ConceptosPage({
  conceptos,
  error,
  onCreate,
}: {
  conceptos: Concepto[];
  error: string | null;
  onCreate: (concepto: NuevoConcepto) => Promise<void>;
}) {
  const filas = aplanarArbol(conceptos);

  return (
    <div className="flex flex-col">
      <ConceptoForm conceptos={conceptos} onSubmit={onCreate} />
      {error && <p className="px-3 py-2 text-sm text-red-500">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-3 py-1.5 font-medium">Clave</th>
            <th className="px-3 py-1.5 font-medium">Descripción</th>
            <th className="px-3 py-1.5 font-medium">Unidad</th>
            <th className="px-3 py-1.5 text-right font-medium">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.id} className="border-b border-border/60 hover:bg-muted/50">
              <td className="num px-3 py-1.5">{c.clave}</td>
              <td className="px-3 py-1.5" style={{ paddingLeft: `${12 + c.profundidad * 20}px` }}>
                {c.descripcion}
              </td>
              <td className="px-3 py-1.5">{c.unidad}</td>
              <td className="num px-3 py-1.5 text-right">{c.cantidad}</td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                Sin conceptos todavía. Agrega el primero arriba.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
