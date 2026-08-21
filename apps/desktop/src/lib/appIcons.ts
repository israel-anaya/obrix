import type { LucideIcon } from "lucide-react";
import { CircleDot, Cog, Droplets, Fuel, Gauge, Globe, HardHat, Joystick, Layers, MapPinned, Timer, Truck, Users, Wrench } from "lucide-react";
import { ICONOS_INSUMO } from "@/icons/insumos";

/**
 * Fuente única de ícono/color por grupo dentro de una ficha de análisis
 * (básico auxiliar, costo horario de equipo, cuadrilla, …). No aplica al
 * árbol de catálogos del panel izquierdo — ese es un espacio distinto
 * (`costosDirectosTree.ts`) con sus propios íconos por catálogo.
 */
export type AppIconId =
  | "grupo_basico_auxiliar"
  | "grupo_cargos_fijos"
  | "grupo_consumo"
  | "grupo_equipo_herramienta"
  | "grupo_mano_obra"
  | "grupo_material"
  | "grupo_operacion"
  | "insumo_basico_auxiliar"
  | "insumo_categoria_fasar"
  | "insumo_concepto"
  | "insumo_costo_horario"
  | "insumo_cuadrilla"
  | "insumo_equipo_rentado"
  | "insumo_herramienta"
  | "insumo_material"
  | "naturaleza_consumo_combustible"
  | "naturaleza_consumo_llantas"
  | "naturaleza_consumo_lubricante"
  | "naturaleza_consumo_otras_fuentes"
  | "naturaleza_consumo_piezas_especiales"
  | "region_nacional"
  | "region_otra";

export interface AppIconDef {
  titulo: string;
  icono: LucideIcon;
  /** Clase Tailwind `text-*` para el ícono y las cifras. */
  color: string;
  /** Clase Tailwind `bg-*` para segmentos de barra. */
  bg: string;
}

export const APP_ICONS: Record<AppIconId, AppIconDef> = {
  grupo_basico_auxiliar: {
    titulo: "Básicos y auxiliares",
    icono: ICONOS_INSUMO["insumo-basico-auxiliar"],
    color: "text-emerald-500",
    bg: "bg-emerald-500",
  },
  grupo_cargos_fijos: {
    titulo: "Cargos fijos",
    icono: Timer,
    color: "text-violet-400",
    bg: "bg-violet-400",
  },
  grupo_consumo: {
    titulo: "Consumo",
    icono: ICONOS_INSUMO["grupo-consumo"],
    color: "text-amber-500",
    bg: "bg-amber-500",
  },
  grupo_equipo_herramienta: {
    titulo: "Equipo y herramienta",
    icono: ICONOS_INSUMO["insumo-equipo-herramienta"],
    color: "text-yellow-400",
    bg: "bg-yellow-400",
  },
  grupo_mano_obra: {
    titulo: "Mano de obra",
    icono: ICONOS_INSUMO["insumo-mano-de-obra"],
    color: "text-blue-500",
    bg: "bg-blue-500",
  },
  grupo_material: {
    titulo: "Materiales",
    icono: ICONOS_INSUMO["grupo-material"],
    color: "text-amber-700",
    bg: "bg-amber-700",
  },
  grupo_operacion: {
    titulo: "Operación",
    icono: Joystick,
    color: "text-orange-800",
    bg: "bg-orange-800",
  },
  insumo_basico_auxiliar: {
    titulo: "Básicos y auxiliares",
    icono: ICONOS_INSUMO["insumo-basico-auxiliar"],
    color: "text-emerald-500",
    bg: "bg-emerald-500",
  },
  insumo_categoria_fasar: {
    titulo: "Categorías",
    icono: HardHat,
    color: "text-orange-600",
    bg: "bg-orange-600",
  },
  insumo_concepto: {
    titulo: "Conceptos",
    icono: ICONOS_INSUMO["insumo-concepto"],
    color: "text-indigo-600",
    bg: "bg-indigo-600",
  },
  insumo_costo_horario: {
    titulo: "Costos horarios",
    icono: Gauge,
    color: "text-yellow-400",
    bg: "bg-yellow-400",
  },
  insumo_cuadrilla: {
    titulo: "Cuadrillas",
    icono: Users,
    color: "text-blue-400",
    bg: "bg-blue-400",
  },
  insumo_equipo_rentado: {
    titulo: "Equipo rentado",
    icono: Truck,
    color: "text-lime-600",
    bg: "bg-lime-600",
  },
  insumo_herramienta: {
    titulo: "Herramientas",
    icono: Wrench,
    color: "text-gray-600",
    bg: "bg-gray-600",
  },
  insumo_material: {
    titulo: "Materiales",
    icono: ICONOS_INSUMO["insumo-material"],
    color: "text-amber-700",
    bg: "bg-amber-700",
  },
  naturaleza_consumo_combustible: {
    titulo: "Combustible",
    icono: Fuel,
    color: "text-red-700",
    bg: "bg-red-700",
  },
  naturaleza_consumo_llantas: {
    titulo: "Llantas",
    icono: CircleDot,
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-500 dark:bg-slate-400",
  },
  naturaleza_consumo_lubricante: {
    titulo: "Lubricante",
    icono: Droplets,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-600 dark:bg-cyan-400",
  },
  naturaleza_consumo_otras_fuentes: {
    titulo: "Otras fuentes",
    icono: Layers,
    color: "text-muted-foreground",
    bg: "bg-muted-foreground",
  },
  naturaleza_consumo_piezas_especiales: {
    titulo: "Piezas especiales",
    icono: Cog,
    color: "text-orange-500",
    bg: "bg-orange-500",
  },
  region_nacional: {
    titulo: "Nacional",
    icono: Globe,
    color: "text-primary",
    bg: "bg-primary",
  },
  region_otra: {
    titulo: "Región",
    icono: MapPinned,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-600 dark:bg-teal-400",
  },
};
