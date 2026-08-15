import type { LucideIcon } from "lucide-react";
import { HardHat, Package, Percent, Users } from "lucide-react";
import type { DataGridConfig } from "@/components/grid/DataGrid";

export interface NodoCatalogo {
  id: string;
  label: string;
  hijos?: NodoCatalogo[];
  /** Icono propio para el nodo en el árbol — si no se da, se usa Folder/FileText según tenga hijos. */
  icon?: LucideIcon;
}

export const COSTOS_DIRECTOS_TREE: NodoCatalogo[] = [
  {
    id: "mano-de-obra",
    label: "Mano de Obra",
    hijos: [
      { id: "factores-salario-real", label: "Factores de Salario Real", icon: Percent },
      { id: "tabuladores-salario", label: "Tabuladores de Salario", icon: HardHat },
      { id: "cuadrillas-trabajo", label: "Cuadrillas de trabajo", icon: Users },
      {
        id: "analisis",
        label: "Análisis",
        hijos: [
          { id: "tabuladores-escalafon", label: "Escalafón" },
          { id: "tabuladores-matriz", label: "Matriz oficio × región" },
          { id: "tabuladores-puente", label: "Puente base → real" },
        ],
      },
    ],
  },
  {
    id: "materiales",
    label: "Materiales",
    hijos: [
      { id: "fletes", label: "Fletes" },
      { id: "materiales-item", label: "Materiales", icon: Package },
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
  { id: "basicos-auxiliares", label: "Básicos y Auxiliares" },
  {
    id: "maquinaria-equipo",
    label: "Maquinaria y Equipo",
    hijos: [
      { id: "herramienta", label: "Herramienta" },
      { id: "costos-horarios", label: "Costos Horarios" },
      { id: "equipo-rentado", label: "Equipo rentado" },
    ],
  },
  { id: "conceptos", label: "Conceptos" },
];

/** Ítems fijos del grupo "Otros" — catálogos generales sin lugar propio en el árbol de costos directos. */
export const NODOS_OTROS: NodoCatalogo[] = [
  { id: "proveedores", label: "Proveedores" },
  { id: "clientes", label: "Clientes" },
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
  "costos-horarios": {
    title: "Costos Horarios",
    columns: [
      { field: "clave", header: "Clave", width: 100 },
      { field: "descripcion", header: "Descripción", width: 320 },
      { field: "tipo", header: "Tipo", width: 130 },
      { field: "costoHora", header: "Costo por hora", numeric: true, width: 140 },
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
