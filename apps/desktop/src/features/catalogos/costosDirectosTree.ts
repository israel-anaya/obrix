import type { CatalogoGridConfig } from "@/features/catalogos/CatalogoGrid";

export interface NodoCatalogo {
  id: string;
  label: string;
  hijos?: NodoCatalogo[];
}

export const COSTOS_DIRECTOS_TREE: NodoCatalogo[] = [
  {
    id: "mano-de-obra",
    label: "Mano de Obra",
    hijos: [
      { id: "factores-salario-real", label: "Factores de Salario Real" },
      { id: "tabuladores-salario-integrado", label: "Tabuladores de Salario Integrado" },
      { id: "cuadrillas-trabajo", label: "Cuadrillas de trabajo" },
    ],
  },
  {
    id: "materiales",
    label: "Materiales",
    hijos: [
      { id: "proveedores", label: "Proveedores" },
      { id: "fletes", label: "Fletes" },
      { id: "materiales-item", label: "Materiales" },
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

export const CATALOGO_GRID_CONFIG: Record<string, CatalogoGridConfig> = {
  "factores-salario-real": {
    titulo: "Factores de Salario Real",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "concepto", encabezado: "Concepto" },
      { campo: "diasNoLaborados", encabezado: "Días no laborados", numero: true, ancho: 160 },
      { campo: "factor", encabezado: "Factor", numero: true, ancho: 110 },
    ],
  },
  "tabuladores-salario-integrado": {
    titulo: "Tabuladores de Salario Integrado",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "categoria", encabezado: "Categoría" },
      { campo: "salarioBase", encabezado: "Salario base", numero: true, ancho: 130 },
      { campo: "prestaciones", encabezado: "Prestaciones", numero: true, ancho: 130 },
      { campo: "salarioIntegrado", encabezado: "Salario integrado", numero: true, ancho: 150 },
    ],
  },
  "cuadrillas-trabajo": {
    titulo: "Cuadrillas de trabajo",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "descripcion", encabezado: "Descripción" },
      { campo: "integrantes", encabezado: "Integrantes", numero: true, ancho: 120 },
      { campo: "costoHora", encabezado: "Costo por hora", numero: true, ancho: 140 },
    ],
  },
  proveedores: {
    titulo: "Proveedores",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "nombre", encabezado: "Nombre" },
      { campo: "contacto", encabezado: "Contacto" },
      { campo: "telefono", encabezado: "Teléfono", ancho: 130 },
      { campo: "ubicacion", encabezado: "Ubicación" },
    ],
  },
  fletes: {
    titulo: "Fletes",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "origen", encabezado: "Origen" },
      { campo: "destino", encabezado: "Destino" },
      { campo: "costo", encabezado: "Costo", numero: true, ancho: 120 },
    ],
  },
  "materiales-item": {
    titulo: "Materiales",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "descripcion", encabezado: "Descripción" },
      { campo: "unidad", encabezado: "Unidad", ancho: 100 },
      { campo: "precio", encabezado: "Precio unitario", numero: true, ancho: 140 },
    ],
  },
  "basicos-auxiliares": {
    titulo: "Básicos y Auxiliares",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "descripcion", encabezado: "Descripción" },
      { campo: "unidad", encabezado: "Unidad", ancho: 100 },
      { campo: "precio", encabezado: "Precio unitario", numero: true, ancho: 140 },
    ],
  },
  herramienta: {
    titulo: "Herramienta",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "descripcion", encabezado: "Descripción" },
      { campo: "unidad", encabezado: "Unidad", ancho: 100 },
      { campo: "costoHora", encabezado: "Costo por hora", numero: true, ancho: 140 },
    ],
  },
  "costos-horarios": {
    titulo: "Costos Horarios",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "descripcion", encabezado: "Descripción" },
      { campo: "tipo", encabezado: "Tipo", ancho: 130 },
      { campo: "costoHora", encabezado: "Costo por hora", numero: true, ancho: 140 },
    ],
  },
  "equipo-rentado": {
    titulo: "Equipo rentado",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "descripcion", encabezado: "Descripción" },
      { campo: "proveedor", encabezado: "Proveedor" },
      { campo: "costoHora", encabezado: "Costo por hora", numero: true, ancho: 140 },
    ],
  },
  conceptos: {
    titulo: "Conceptos",
    columnas: [
      { campo: "clave", encabezado: "Clave", ancho: 100 },
      { campo: "descripcion", encabezado: "Descripción" },
      { campo: "unidad", encabezado: "Unidad", ancho: 100 },
      { campo: "cantidad", encabezado: "Cantidad", numero: true, ancho: 110 },
      { campo: "precioUnitario", encabezado: "Precio unitario", numero: true, ancho: 140 },
      { campo: "importe", encabezado: "Importe", numero: true, ancho: 130 },
    ],
  },
};
