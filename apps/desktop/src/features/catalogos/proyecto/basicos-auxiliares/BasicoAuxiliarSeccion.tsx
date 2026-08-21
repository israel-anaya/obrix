import { BasicoAuxiliarAnalisis } from "@/features/catalogos/proyecto/basicos-auxiliares/BasicoAuxiliarAnalisis";
import { BasicoAuxiliarGridVista } from "@/features/catalogos/proyecto/basicos-auxiliares/BasicoAuxiliarGridVista";

export type BasicoAuxiliarVista = "grid" | "analisis";

/**
 * Vista de "Básicos y Auxiliares" (Catálogos de proyecto → Básicos y
 * Auxiliares) — dos formas de trabajar la misma composición de
 * `basico_auxiliar`/`basico_auxiliar_componente`: "Análisis"
 * (`BasicoAuxiliarAnalisis`, tarjeta de análisis de precio unitario) y "Vista
 * Clásica" (`BasicoAuxiliarGridVista`, edición de celdas al estilo del resto
 * de los catálogos). Mismos comandos de Tauri por debajo — el usuario elige
 * cuál interacción prefiere.
 *
 * El selector vive en la propia pestaña del editor (ver `App.tsx`,
 * `renderTabExtra` de `EditorTabs`) — este componente solo recibe la vista
 * activa ya resuelta, controlada desde afuera.
 */
export function BasicoAuxiliarSeccion({ vista }: { vista: BasicoAuxiliarVista }) {
  return <div className="h-full">{vista === "grid" ? <BasicoAuxiliarGridVista /> : <BasicoAuxiliarAnalisis />}</div>;
}
