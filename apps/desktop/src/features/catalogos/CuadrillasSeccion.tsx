import { CuadrillasFicha } from "@/features/catalogos/CuadrillasFicha";
import { CuadrillasGridVista } from "@/features/catalogos/CuadrillasGridVista";

export type CuadrillasVista = "grid" | "ficha";

/**
 * Vista de "Cuadrillas de trabajo" (Mano de Obra → Cuadrillas de trabajo) —
 * dos formas de trabajar la misma composición de `cuadrilla`/`cuadrilla_detalle`:
 * "Ficha" (`CuadrillasFicha`, un fichero con la tarjeta de análisis de precio
 * unitario que ya conoce cualquier ingeniero de costos) y "Vista Clásica"
 * (`CuadrillasGridVista`, edición de celdas al estilo del resto de los
 * catálogos). Mismos comandos de Tauri por debajo — el usuario elige cuál
 * interacción prefiere para armar cuadrillas.
 *
 * El selector vive en la propia pestaña del editor (ver `App.tsx`,
 * `renderTabExtra` de `EditorTabs`) — este componente solo recibe la vista
 * activa ya resuelta, controlada desde afuera.
 */
export function CuadrillasSeccion({
  vista,
}: {
  vista: CuadrillasVista;
}) {
  return (
    <div className="h-full">
      {vista === "grid" ? <CuadrillasGridVista /> : <CuadrillasFicha />}
    </div>
  );
}
