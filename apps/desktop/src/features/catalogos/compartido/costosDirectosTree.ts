import type { LucideIcon } from "lucide-react";
import { PauseCircle, Percent } from "lucide-react";
import type { DataGridConfig } from "@/components/grid/DataGrid";
import { APP_ICONS } from "@/lib/appIcons";

export interface NodoCatalogo {
  id: string;
  label: string;
  hijos?: NodoCatalogo[];
  /** Icono propio para el nodo en el árbol — si no se da, se usa Folder/FileText según tenga hijos. */
  icon?: LucideIcon;
  /** Clase Tailwind `text-*` del ícono (tomada de `APP_ICONS`) — se aplica al pasar el mouse. */
  color?: string;
}

export const COSTOS_DIRECTOS_TREE: NodoCatalogo[] = [
  {
    id: "mano-de-obra",
    label: APP_ICONS.grupo_mano_obra.titulo,
    icon: APP_ICONS.grupo_mano_obra.icono,
    color: APP_ICONS.grupo_mano_obra.color,
    hijos: [
      { id: "factores-salario-real", label: "Factores de Salario Real", icon: Percent },
      {
        id: "tabuladores-salario",
        label: APP_ICONS.insumo_categoria_fasar.titulo,
        icon: APP_ICONS.insumo_categoria_fasar.icono,
        color: APP_ICONS.insumo_categoria_fasar.color,
      },
      {
        id: "cuadrillas-trabajo",
        label: APP_ICONS.insumo_cuadrilla.titulo,
        icon: APP_ICONS.insumo_cuadrilla.icono,
        color: APP_ICONS.insumo_cuadrilla.color,
      },
      {
        id: "analisis",
        label: "Análisis",
        hijos: [
          { id: "tabuladores-escalafon", label: "Escalafón" },
          { id: "tabuladores-puente", label: "Puente base → real" },
          { id: "tabuladores-costo-mano-obra", label: "Costo de Mano de obra" },
        ],
      },
    ],
  },
  {
    id: "materiales",
    label: "Materiales",
    icon: APP_ICONS.grupo_material.icono,
    color: APP_ICONS.grupo_material.color,
    hijos: [
      { id: "fletes", label: "Fletes" },
      {
        id: "materiales-item",
        label: APP_ICONS.insumo_material.titulo,
        icon: APP_ICONS.insumo_material.icono,
        color: APP_ICONS.insumo_material.color,
      },
      {
        id: "materiales-analisis",
        label: "Análisis",
        hijos: [
          { id: "materiales-mesa", label: "Mesa de equivalentes" },
          { id: "materiales-radar", label: "Radar de costos" },
        ],
      },
    ],
  },
  {
    id: "maquinaria-equipo",
    label: APP_ICONS.grupo_equipo_herramienta.titulo,
    icon: APP_ICONS.grupo_equipo_herramienta.icono,
    color: APP_ICONS.grupo_equipo_herramienta.color,
    hijos: [
      { id: "perfiles-inactividad", label: "Inactividad de equipo", icon: PauseCircle },
      {
        id: "herramienta",
        label: APP_ICONS.insumo_herramienta.titulo,
        icon: APP_ICONS.insumo_herramienta.icono,
        color: APP_ICONS.insumo_herramienta.color,
      },
      {
        id: "costos-horarios",
        label: APP_ICONS.insumo_costo_horario.titulo,
        icon: APP_ICONS.insumo_costo_horario.icono,
        color: APP_ICONS.insumo_costo_horario.color,
      },
      {
        id: "equipo-rentado",
        label: APP_ICONS.insumo_equipo_rentado.titulo,
        icon: APP_ICONS.insumo_equipo_rentado.icono,
        color: APP_ICONS.insumo_equipo_rentado.color,
      },
    ],
  },
  {
    id: "basicos-auxiliares",
    label: APP_ICONS.insumo_basico_auxiliar.titulo,
    icon: APP_ICONS.insumo_basico_auxiliar.icono,
    color: APP_ICONS.insumo_basico_auxiliar.color,
  },
  {
    id: "conceptos",
    label: APP_ICONS.insumo_concepto.titulo,
    icon: APP_ICONS.insumo_concepto.icono,
    color: APP_ICONS.insumo_concepto.color,
  },
];

export const CATALOGO_GRID_CONFIG: Record<string, DataGridConfig> = {
  "factores-salario-real": {
    title: "Factores de Salario Real",
    columns: [
      { field: "clave", header: "Clave", width: 100 },
      { field: "concepto", header: "Concepto", width: 280 },
      { field: "diasNoLaborados", header: "Días no laborados", numeric: true, width: 160 },
      { field: "factor", header: "Factor", numeric: true, width: 110 },
    ],
  },
  fletes: {
    title: "Fletes",
    columns: [
      { field: "clave", header: "Clave", width: 100 },
      { field: "origen", header: "Origen", width: 180 },
      { field: "destino", header: "Destino", width: 180 },
      { field: "costo", header: "Costo", numeric: true, width: 120 },
    ],
  },
  "materiales-item": {
    title: "Materiales",
    columns: [
      { field: "clave", header: "Clave", width: 100 },
      { field: "descripcion", header: "Descripción", width: 320 },
      { field: "unidad", header: "Unidad", width: 100 },
      { field: "precio", header: "Precio unitario", numeric: true, width: 140 },
    ],
  },
  "basicos-auxiliares": {
    title: "Básicos y Auxiliares",
    columns: [
      { field: "clave", header: "Clave", width: 100 },
      { field: "descripcion", header: "Descripción", width: 320 },
      { field: "unidad", header: "Unidad", width: 100 },
      { field: "precio", header: "Precio unitario", numeric: true, width: 140 },
    ],
  },
  "equipo-rentado": {
    title: "Equipo rentado",
    columns: [
      { field: "clave", header: "Clave", width: 100 },
      { field: "descripcion", header: "Descripción", width: 320 },
      { field: "proveedor", header: "Proveedor", width: 220 },
      { field: "costoHora", header: "Costo por hora", numeric: true, width: 140 },
    ],
  },
  conceptos: {
    title: "Conceptos",
    columns: [
      { field: "clave", header: "Clave", width: 100 },
      { field: "descripcion", header: "Descripción", width: 320 },
      { field: "unidad", header: "Unidad", width: 100 },
      { field: "cantidad", header: "Cantidad", numeric: true, width: 110 },
      { field: "precioUnitario", header: "Precio unitario", numeric: true, width: 140 },
      { field: "importe", header: "Importe", numeric: true, width: 130 },
    ],
  },
};
