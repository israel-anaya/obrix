import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Plus, RefreshCcw, Sigma, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CatalogoGrid, type CatalogoGridConfig, type CatalogoGridHandle, type Fila } from "@/features/catalogos/CatalogoGrid";
import { useCatalogoGeneral } from "@/features/configuracion/useCatalogoGeneral";
import { createFactorSalarioReal, deleteFactorSalarioReal, listFactoresSalarioReal, listRegiones, updateFactorSalarioReal } from "@/lib/tauri";
import type { FactorSalarioRealData, Region } from "@/lib/types";

const NACIONAL = "Nacional (sin región)";

const FACTOR_SALARIO_REAL_API = {
  list: listFactoresSalarioReal,
  crear: createFactorSalarioReal,
  actualizar: updateFactorSalarioReal,
  eliminar: deleteFactorSalarioReal,
};

const COLUMNAS_CONTROL = [
  { campo: "vigencia_desde", encabezado: "Vigente desde", ancho: 130, fecha: true },
  { campo: "vigencia_hasta", encabezado: "Vigente hasta", ancho: 130, fecha: true },
  { campo: "created_at", encabezado: "Creado", ancho: 160, soloLectura: true, fecha: true },
  { campo: "updated_at", encabezado: "Actualizado", ancho: 160, soloLectura: true, fecha: true },
];

export function FactorSalarioRealSeccion({
  onCalcular,
  onEditarModelo,
}: {
  onCalcular: (id: string, nombre: string) => void;
  onEditarModelo: (id: string, nombre: string) => void;
}) {
  const gridRef = useRef<CatalogoGridHandle>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const { items, error, crear, actualizar, eliminar, reload } = useCatalogoGeneral(FACTOR_SALARIO_REAL_API);

  const [regiones, setRegiones] = useState<Region[]>([]);
  const recargarRegiones = () => listRegiones().then(setRegiones).catch(() => {});
  useEffect(() => {
    recargarRegiones();
  }, []);

  const recargarTodo = () => {
    void reload();
    void recargarRegiones();
  };

  const nombrePorRegionId = useMemo(() => Object.fromEntries(regiones.map((r) => [r.id, r.nombre])), [regiones]);
  const regionIdPorNombre = useMemo(() => Object.fromEntries(regiones.map((r) => [r.nombre, r.id])), [regiones]);

  const config: CatalogoGridConfig = useMemo(
    () => ({
      titulo: "FRS",
      columnas: [
        { campo: "nombre", encabezado: "Nombre", ancho: 260 },
        {
          campo: "region",
          encabezado: "Región",
          ancho: 180,
          opciones: [NACIONAL, ...regiones.map((r) => r.nombre)],
        },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [regiones],
  );

  const filas: Fila[] = useMemo(
    () =>
      items.map((f) => ({
        _id: f.id,
        nombre: f.nombre,
        region: f.region_id ? (nombrePorRegionId[f.region_id] ?? "") : NACIONAL,
        vigencia_desde: f.vigencia_desde,
        vigencia_hasta: f.vigencia_hasta ?? "",
        created_at: f.created_at,
        updated_at: f.updated_at ?? "",
      })),
    [items, nombrePorRegionId],
  );

  const filaAFactorData = (fila: Fila, previo?: { modelo_calculo_json: string; parametros_json: string }): FactorSalarioRealData => ({
    nombre: String(fila.nombre),
    region_id: String(fila.region) === NACIONAL ? null : (regionIdPorNombre[String(fila.region)] ?? null),
    vigencia_desde: String(fila.vigencia_desde) || new Date().toISOString().slice(0, 10),
    vigencia_hasta: String(fila.vigencia_hasta) || null,
    // Vacío: el backend siembra el modelo de cálculo estándar.
    modelo_calculo_json: previo?.modelo_calculo_json ?? "",
    parametros_json: previo?.parametros_json ?? "",
  });

  const filaSeleccionada = items.find((f) => f.id === seleccionadoId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div>
          <h2 className="text-sm font-semibold">FRS · Factor de Salario Real</h2>
          <p className="text-xs text-muted-foreground">
            Configuraciones reutilizables (una por región/riesgo/ejercicio) — abre la calculadora para capturar sus
            parámetros.
          </p>
        </div>
        <BarraAcciones
          acciones={[
            { icono: RefreshCcw, titulo: "Recargar", onClick: recargarTodo },
            { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.agregarFila() },
            {
              icono: Calculator,
              titulo: "Calcular FSR",
              onClick: () => filaSeleccionada && onCalcular(filaSeleccionada.id, filaSeleccionada.nombre),
              disabled: !filaSeleccionada,
            },
            {
              icono: Sigma,
              titulo: "Editar modelo de cálculo",
              onClick: () => filaSeleccionada && onEditarModelo(filaSeleccionada.id, filaSeleccionada.nombre),
              disabled: !filaSeleccionada,
            },
            {
              icono: Trash2,
              titulo: "Eliminar seleccionado",
              onClick: () => gridRef.current?.eliminarFilaSeleccionada(),
              disabled: !filaSeleccionada,
            },
          ]}
        />
      </div>
      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        <CatalogoGrid
          ref={gridRef}
          config={config}
          filasIniciales={filas}
          modoSeleccion="unica"
          onFilaSeleccionada={(fila) => setSeleccionadoId(fila?._id ?? null)}
          onAgregarFila={(fila) => crear(filaAFactorData(fila))}
          onEliminarFilas={(ids) => eliminar(ids)}
          onCeldaEditada={(fila) => {
            const previo = items.find((f) => f.id === fila._id);
            actualizar(fila._id, filaAFactorData(fila, previo));
          }}
        />
      </div>
    </div>
  );
}
