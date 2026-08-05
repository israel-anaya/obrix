import type { Concepto } from "@/lib/types";

export function ConceptoDetailTab({ concepto }: { concepto: Concepto | undefined }) {
  if (!concepto) {
    return <p className="p-4 text-sm text-muted-foreground">Este concepto ya no existe.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="num text-lg font-semibold">{concepto.clave}</h2>
        <p className="text-sm text-muted-foreground">{concepto.descripcion}</p>
      </div>
      <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Unidad</dt>
        <dd className="num">{concepto.unidad}</dd>
        <dt className="text-muted-foreground">Cantidad</dt>
        <dd className="num">{concepto.cantidad}</dd>
      </dl>
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        La matriz de insumos (análisis de precio unitario) de este concepto se edita aquí — próximamente.
      </div>
    </div>
  );
}
