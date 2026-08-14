import { useEffect, useMemo, useState } from "react";
import type { DataGridConfig, Row } from "@/components/grid/DataGrid";
import type { DetalleConfig } from "@/features/catalogos/VistaMaestroDetalle";
import { VistaMaestroDetalle } from "@/features/catalogos/VistaMaestroDetalle";
import { createFamiliaInsumo, deleteFamiliaInsumo, listFamiliasInsumo, listUsuarios, updateFamiliaInsumo } from "@/lib/tauri";
import type { FamiliaInsumo } from "@/lib/types";

const COLUMNAS_FAMILIA = [
  { field: "nombre", header: "Nombre", width: 240 },
  { field: "created_at", header: "Creado", width: 180, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 180, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

const GRID_FAMILIA: DataGridConfig = { title: "Familias de insumo", columns: COLUMNAS_FAMILIA };
const GRID_SUBFAMILIA: DataGridConfig = { title: "Sub familias", columns: COLUMNAS_FAMILIA };

function familiaAFila(f: FamiliaInsumo, nombresPorUsuarioId: Record<string, string>): Row {
  return {
    _id: f.id,
    nombre: f.nombre,
    created_at: f.created_at,
    created_by: nombresPorUsuarioId[f.created_by] ?? f.created_by,
    updated_at: f.updated_at ?? "",
    updated_by: (f.updated_by && nombresPorUsuarioId[f.updated_by]) ?? f.updated_by ?? "",
  };
}

export function FamiliasInsumoSeccion() {
  const [raices, setRaices] = useState<FamiliaInsumo[]>([]);
  // Arranca en `true`: entre el montaje y la primera respuesta el grid tiene
  // cero filas, y sin esto diría "Sin registros" antes de haber preguntado.
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const recargar = () => setVersion((v) => v + 1);

  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  useEffect(() => {
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  }, []);

  useEffect(() => {
    setCargando(true);
    listFamiliasInsumo()
      .then((todas) => setRaices(todas.filter((f) => f.parent_id === null)))
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, [version]);

  const detalle = useMemo<DetalleConfig<FamiliaInsumo>>(
    () => ({
      grid: GRID_SUBFAMILIA,
      cargar: (maestroId) => listFamiliasInsumo().then((todas) => todas.filter((f) => f.parent_id === maestroId)),
      aFila: (f) => familiaAFila(f, nombresPorUsuarioId),
      crear: (maestroId, fila) =>
        createFamiliaInsumo({ nombre: String(fila.nombre), parent_id: maestroId }).then(() => {}),
      editar: (_maestroId, fila) => updateFamiliaInsumo(fila._id, { nombre: String(fila.nombre) }).then(() => {}),
      eliminar: (_maestroId, ids) => Promise.all(ids.map((id) => deleteFamiliaInsumo(id))).then(() => {}),
    }),
    [nombresPorUsuarioId],
  );

  return (
    <div className="flex h-full flex-col">
      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        <VistaMaestroDetalle
          maestroGrid={GRID_FAMILIA}
          maestroFilas={raices.map((f) => familiaAFila(f, nombresPorUsuarioId))}
          maestroCargando={cargando}
          onRecargarMaestro={recargar}
          onAgregarMaestro={(fila) => createFamiliaInsumo({ nombre: String(fila.nombre) }).then(recargar)}
          onEditarMaestro={(fila) => updateFamiliaInsumo(fila._id, { nombre: String(fila.nombre) }).then(recargar)}
          onEliminarMaestro={(ids) => Promise.all(ids.map((id) => deleteFamiliaInsumo(id))).then(recargar)}
          detalle={detalle}
          placeholderDetalle="Selecciona una familia para ver sus hijos directos."
        />
      </div>
    </div>
  );
}
