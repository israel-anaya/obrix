import { EquipoCostoHorarioAnalisis } from "@/features/catalogos/proyecto/costo-horario/EquipoCostoHorarioAnalisis";
import { EquipoCostoHorarioGridVista } from "@/features/catalogos/proyecto/costo-horario/EquipoCostoHorarioGridVista";

export type EquipoCostoHorarioVista = "grid" | "analisis";

/**
 * Vista de "Equipo de costo horario" (Maquinaria y Equipo → Costos
 * Horarios) — dos formas de trabajar la misma composición de
 * `equipo_costo_horario`/`equipo_costo_horario_detalle`: "Análisis"
 * (`EquipoCostoHorarioAnalisis`, tarjeta de análisis de precio unitario) y
 * "Vista Clásica" (`EquipoCostoHorarioGridVista`, edición de celdas al
 * estilo del resto de los catálogos). Mismos comandos de Tauri por debajo —
 * el usuario elige cuál interacción prefiere.
 *
 * El selector vive en la propia pestaña del editor (ver `App.tsx`,
 * `renderTabExtra` de `EditorTabs`) — este componente solo recibe la vista
 * activa ya resuelta, controlada desde afuera.
 */
export function EquipoCostoHorarioSeccion({ vista }: { vista: EquipoCostoHorarioVista }) {
  return <div className="h-full">{vista === "grid" ? <EquipoCostoHorarioGridVista /> : <EquipoCostoHorarioAnalisis />}</div>;
}
