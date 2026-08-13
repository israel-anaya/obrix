import { useEffect, useState } from "react";
import type { DetalleConfig } from "@/features/catalogos/VistaMaestroDetalle";
import { VistaMaestroDetalle } from "@/features/catalogos/VistaMaestroDetalle";
import { createFamiliaInsumo, deleteFamiliaInsumo, listFamiliasInsumo } from "@/lib/tauri";
import type { FamiliaInsumo } from "@/lib/types";

const GRID_FAMILIA = {
  title: "Familias de insumo",
  columns: [
    { field: "nombre", header: "Nombre", width: 240 },
    { field: "created_at", header: "Creado", width: 180, readOnly: true },
  ],
};

function familiaAFila(f: FamiliaInsumo) {
  return { _id: f.id, nombre: f.nombre, created_at: f.created_at };
}

// Detalle de la misma tabla (autorreferencia por parent_id) — el otro caso,
// detalle en tabla distinta, se resuelve igual con otro `cargar`/`crear`/`aFila`.
const detalle: DetalleConfig<FamiliaInsumo> = {
  grid: GRID_FAMILIA,
  cargar: (maestroId) => listFamiliasInsumo().then((todas) => todas.filter((f) => f.parent_id === maestroId)),
  aFila: familiaAFila,
  crear: (maestroId, fila) =>
    createFamiliaInsumo({ nombre: String(fila.nombre), parent_id: maestroId }).then(() => {}),
  eliminar: (_maestroId, ids) => Promise.all(ids.map((id) => deleteFamiliaInsumo(id))).then(() => {}),
};

export function MaestroDetalleDemo() {
  const [raices, setRaices] = useState<FamiliaInsumo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    listFamiliasInsumo()
      .then((todas) => setRaices(todas.filter((f) => f.parent_id === null)))
      .catch((e) => setError(String(e)));
  }, [version]);

  return (
    <div className="flex h-full flex-col p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        Demo — vista maestro/detalle genérica (dos grids, selección única, agregar/eliminar). Maestro: familias
        raíz. Detalle: hijos directos de la familia seleccionada.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        <VistaMaestroDetalle
          maestroGrid={GRID_FAMILIA}
          maestroFilas={raices.map(familiaAFila)}
          onRecargarMaestro={() => setVersion((v) => v + 1)}
          onAgregarMaestro={(fila) =>
            createFamiliaInsumo({ nombre: String(fila.nombre) }).then(() => setVersion((v) => v + 1))
          }
          onEliminarMaestro={(ids) =>
            Promise.all(ids.map((id) => deleteFamiliaInsumo(id))).then(() => setVersion((v) => v + 1))
          }
          detalle={detalle}
          placeholderDetalle="Selecciona una familia para ver sus hijos directos."
        />
      </div>
    </div>
  );
}
