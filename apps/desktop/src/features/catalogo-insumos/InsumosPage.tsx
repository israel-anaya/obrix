import { useEffect, useState } from "react";
import { createInsumo, listInsumos } from "@/lib/tauri";
import type { Insumo, NuevoInsumo, TipoInsumo } from "@/lib/types";
import { InsumoForm } from "./InsumoForm";

const TIPO_LABEL: Record<TipoInsumo, string> = {
  material: "Material",
  mano_obra: "Mano de obra",
  equipo_herramienta: "Equipo/herramienta",
};

export function InsumosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setInsumos(await listInsumos());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const handleCreate = async (nuevo: NuevoInsumo) => {
    try {
      await createInsumo(nuevo);
      await cargar();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex flex-col">
      <InsumoForm onSubmit={handleCreate} />
      {error && <p className="px-3 py-2 text-sm text-red-500">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-3 py-1.5 font-medium">Clave</th>
            <th className="px-3 py-1.5 font-medium">Tipo</th>
            <th className="px-3 py-1.5 font-medium">Descripción</th>
            <th className="px-3 py-1.5 font-medium">Unidad</th>
            <th className="px-3 py-1.5 text-right font-medium">Precio</th>
          </tr>
        </thead>
        <tbody>
          {insumos.map((i) => (
            <tr key={i.id} className="border-b border-border/60 hover:bg-muted/50">
              <td className="num px-3 py-1.5">{i.clave}</td>
              <td className="px-3 py-1.5">{TIPO_LABEL[i.tipo]}</td>
              <td className="px-3 py-1.5">{i.descripcion}</td>
              <td className="px-3 py-1.5">{i.unidad}</td>
              <td className="num px-3 py-1.5 text-right">{i.precio_base}</td>
            </tr>
          ))}
          {insumos.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                Sin insumos todavía. Agrega el primero arriba.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
