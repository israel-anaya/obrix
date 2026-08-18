import type { DataGridColumn, DataGridConfig } from "@/components/grid/DataGrid";
import type { Row } from "@/components/grid/DataGrid";
import * as api from "@/lib/tauri";
import type {
  FamiliaInsumo,
  FamiliaInsumoData,
  Moneda,
  MonedaData,
  OrganizacionData,
  RegionData,
  RolUsuario,
  UnidadMedidaData,
  UsuarioData,
  Organizacion,
  Region,
  TipoMagnitud,
  TipoOrganizacion,
  UnidadMedida,
  Usuario,
} from "@/lib/types";
import { ROLES_USUARIO, TIPOS_MAGNITUD, TIPOS_ORGANIZACION } from "@/lib/types";
import type { CatalogoGeneralApi } from "@/features/configuracion/useCatalogoGeneral";
import type { CsvCampoCatalogo } from "@/components/csv/adaptadorCatalogoGeneral";

export interface CatalogoGeneralDescriptor<T extends { id: string }, Nuevo> {
  id: string;
  titulo: string;
  grid: DataGridConfig;
  api: CatalogoGeneralApi<T, Nuevo>;
  aFila: (modelo: T) => Row;
  /** Alternativa a `aFila` cuando el orden/anidamiento de las filas depende del listado completo (p. ej. un árbol por `parent_id`). */
  aFilas?: (modelos: T[]) => Row[];
  vacio: Nuevo;
  filaANuevo: (fila: Row) => Nuevo;
  csv?: {
    archivoDefault: string;
    claveNaturalModelo: (item: T) => string;
    claveNaturalFila: (valores: Record<string, string>) => string;
    campos: CsvCampoCatalogo[];
  };
}

/** Columnas de auditoría comunes a (casi) toda entidad — visibles, nunca editables.
 * `deleted` / `deleted_at` / `deleted_by` no se listan: el grid no las muestra
 * y `eliminar` solo marca `deleted = true`. */
const COLUMNAS_CONTROL: DataGridColumn[] = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

/**
 * Acepta también `Usuario`, la única entidad cuyo `created_by` puede ser
 * `null` (el admin sembrado) — de ahí el tipo laxo en vez de `CamposControl`.
 */
function filaControl(m: {
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}): Pick<Row, "created_at" | "created_by" | "updated_at" | "updated_by"> {
  return {
    created_at: m.created_at,
    created_by: m.created_by ?? "",
    updated_at: m.updated_at ?? "",
    updated_by: m.updated_by ?? "",
  };
}

function aBooleano(valor: string | number | boolean, fallback: boolean): boolean {
  if (typeof valor === "boolean") return valor;
  const t = String(valor).trim().toLowerCase();
  if (["sí", "si", "true", "1", "yes"].includes(t)) return true;
  if (["no", "false", "0"].includes(t)) return false;
  return fallback;
}

/**
 * `grid`/`aFila`/`filaANuevo` no se usan para renderizar — `SettingsPage`
 * intercepta este id y muestra `OrganizacionSeccion` en su lugar, porque la
 * columna de moneda default necesita el catálogo de `Moneda` (dinámico) como
 * opciones, algo que este descriptor estático no puede resolver. Se dejan
 * aquí solo para satisfacer `CatalogoGeneralDescriptor`, igual que `familiasInsumo`.
 */
const organizaciones: CatalogoGeneralDescriptor<Organizacion, OrganizacionData> = {
  id: "organizaciones",
  titulo: "Organización",
  grid: {
    title: "Organización",
    columns: [
      { field: "razon_social", header: "Razón social", width: 260 },
      { field: "rfc", header: "RFC", width: 140 },
      { field: "tipo", header: "Tipo", width: 160, options: TIPOS_ORGANIZACION },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listOrganizaciones,
    crear: api.createOrganizacion,
    actualizar: api.updateOrganizacion,
    eliminar: api.deleteOrganizacion,
  },
  aFila: (m) => ({ _id: m.id, razon_social: m.razon_social, rfc: m.rfc, tipo: m.tipo, ...filaControl(m) }),
  vacio: { razon_social: "Nueva organización", rfc: "", tipo: "despacho", moneda_default_id: "", horas_jornada: "8" },
  filaANuevo: (f) => ({
    razon_social: String(f.razon_social),
    rfc: String(f.rfc),
    // La celda usa un selector (opciones: TIPOS_ORGANIZACION), así que el
    // valor siempre es uno de los válidos — el cast solo recupera el tipo literal.
    tipo: String(f.tipo) as TipoOrganizacion,
    moneda_default_id: "",
    horas_jornada: String(f.horas_jornada ?? "8"),
  }),
};

/**
 * `grid`/`api`/`aFila`/`filaANuevo` no se usan para renderizar — `SettingsPage`
 * intercepta este id y muestra `UsuariosSeccion` en su lugar, con un detalle
 * (las organizaciones del usuario seleccionado) que este descriptor genérico
 * no puede expresar. Se dejan aquí solo para satisfacer
 * `CatalogoGeneralDescriptor` y darle su entrada en el sidebar, igual que
 * `organizaciones`/`familiasInsumo`.
 */
const usuarios: CatalogoGeneralDescriptor<Usuario, UsuarioData> = {
  id: "usuarios",
  titulo: "Usuarios",
  grid: {
    title: "Usuarios",
    columns: [
      { field: "nombre", header: "Nombre", width: 240 },
      { field: "correo", header: "Correo", width: 200 },
      { field: "rol", header: "Rol", width: 130, options: ROLES_USUARIO },
      { field: "activo", header: "Activo", width: 90, boolean: true },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listUsuarios,
    crear: api.createUsuario,
    actualizar: api.updateUsuario,
    eliminar: api.deleteUsuario,
  },
  aFila: (m) => ({
    _id: m.id,
    nombre: m.nombre,
    correo: m.correo,
    rol: m.rol,
    activo: m.activo,
    ...filaControl(m),
  }),
  vacio: { nombre: "Nuevo usuario", correo: "", rol: "editor", activo: true },
  filaANuevo: (f) => ({
    nombre: String(f.nombre),
    correo: String(f.correo),
    // La celda usa un selector (opciones: ROLES_USUARIO), así que el valor
    // siempre es uno de los válidos — el cast solo recupera el tipo literal.
    rol: String(f.rol) as RolUsuario,
    activo: Boolean(f.activo),
  }),
};

const unidadesMedida: CatalogoGeneralDescriptor<UnidadMedida, UnidadMedidaData> = {
  id: "unidades-medida",
  titulo: "Unidades de medida",
  grid: {
    title: "Unidades de medida",
    columns: [
      { field: "simbolo", header: "Símbolo", width: 100 },
      { field: "simbolo_impresion", header: "Símbolo de impresión", width: 160 },
      { field: "variantes", header: "Variantes", width: 220 },
      { field: "clave_sat", header: "Clave SAT", width: 120 },
      { field: "descripcion", header: "Descripción", width: 320 },
      { field: "tipo_magnitud", header: "Tipo de magnitud", width: 160, options: TIPOS_MAGNITUD },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listUnidadesMedida,
    crear: api.createUnidadMedida,
    actualizar: api.updateUnidadMedida,
    eliminar: api.deleteUnidadMedida,
  },
  aFila: (m) => ({
    _id: m.id,
    simbolo: m.simbolo,
    simbolo_impresion: m.simbolo_impresion,
    variantes: m.variantes,
    clave_sat: m.clave_sat ?? "",
    descripcion: m.descripcion,
    tipo_magnitud: m.tipo_magnitud,
    ...filaControl(m),
  }),
  vacio: {
    simbolo: "NVA",
    simbolo_impresion: "NVA",
    variantes: "",
    clave_sat: null,
    descripcion: "Nueva unidad",
    tipo_magnitud: "otro",
  },
  filaANuevo: (f) => ({
    simbolo: String(f.simbolo),
    simbolo_impresion: String(f.simbolo_impresion),
    variantes: String(f.variantes),
    clave_sat: String(f.clave_sat) || null,
    descripcion: String(f.descripcion),
    // La celda usa un selector (opciones: TIPOS_MAGNITUD), así que el valor
    // siempre es uno de los válidos — el cast solo recupera el tipo literal.
    tipo_magnitud: String(f.tipo_magnitud) as TipoMagnitud,
  }),
  csv: {
    archivoDefault: "unidades-medida.csv",
    claveNaturalModelo: (m) => m.simbolo,
    claveNaturalFila: (v) => v.simbolo ?? "",
    campos: [
      { field: "simbolo", encabezado: "Símbolo", obligatorio: true },
      { field: "simbolo_impresion", encabezado: "Símbolo de impresión" },
      { field: "variantes", encabezado: "Variantes" },
      { field: "clave_sat", encabezado: "Clave SAT" },
      { field: "descripcion", encabezado: "Descripción", obligatorio: true },
      { field: "tipo_magnitud", encabezado: "Tipo de magnitud" },
    ],
  },
};

const regiones: CatalogoGeneralDescriptor<Region, RegionData> = {
  id: "regiones",
  titulo: "Regiones",
  grid: {
    title: "Regiones",
    columns: [
      { field: "nombre", header: "Nombre", width: 240 },
      { field: "estado", header: "Estado", width: 160 },
      { field: "factor_ajuste", header: "Factor de ajuste", numeric: true, width: 150 },
      { field: "visible", header: "Visible", width: 90, boolean: true, default: true },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listRegiones,
    crear: api.createRegion,
    actualizar: api.updateRegion,
    eliminar: api.deleteRegion,
  },
  aFila: (m) => ({
    _id: m.id,
    nombre: m.nombre,
    estado: m.estado,
    factor_ajuste: m.factor_ajuste ?? "",
    visible: m.visible,
    ...filaControl(m),
  }),
  vacio: { nombre: "Nueva región", estado: "", factor_ajuste: null, visible: true },
  filaANuevo: (f) => ({
    nombre: String(f.nombre),
    estado: String(f.estado),
    factor_ajuste: String(f.factor_ajuste) || null,
    visible: aBooleano(f.visible, true),
  }),
  csv: {
    archivoDefault: "regiones.csv",
    claveNaturalModelo: (m) => m.nombre,
    claveNaturalFila: (v) => v.nombre ?? "",
    campos: [
      { field: "nombre", encabezado: "Nombre", obligatorio: true },
      { field: "estado", encabezado: "Estado" },
      { field: "factor_ajuste", encabezado: "Factor de ajuste" },
      { field: "visible", encabezado: "Visible" },
    ],
  },
};

const familiasInsumo: CatalogoGeneralDescriptor<FamiliaInsumo, FamiliaInsumoData> = {
  id: "familias-insumo",
  titulo: "Familias de insumo",
  grid: {
    title: "Familias de insumo",
    columns: [
      { field: "nombre", header: "Nombre", width: 240 },
      { field: "icono", header: "Icono", width: 240 },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listFamiliasInsumo,
    crear: api.createFamiliaInsumo,
    actualizar: api.updateFamiliaInsumo,
    eliminar: api.deleteFamiliaInsumo,
  },
  aFila: (m) => ({ _id: m.id, nombre: m.nombre, icono: m.icono ?? "", ...filaControl(m) }),
  vacio: { nombre: "Nueva familia" },
  filaANuevo: (f) => ({ nombre: String(f.nombre), icono: String(f.icono) || null }),
};

const monedas: CatalogoGeneralDescriptor<Moneda, MonedaData> = {
  id: "monedas",
  titulo: "Monedas",
  grid: {
    title: "Monedas",
    columns: [
      { field: "codigo", header: "Código", width: 100 },
      { field: "nombre", header: "Nombre", width: 240 },
      { field: "simbolo", header: "Símbolo", width: 100 },
      { field: "decimales", header: "Decimales", numeric: true, width: 110 },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listMonedas,
    crear: api.createMoneda,
    actualizar: api.updateMoneda,
    eliminar: api.deleteMoneda,
  },
  aFila: (m) => ({
    _id: m.id,
    codigo: m.codigo,
    nombre: m.nombre,
    simbolo: m.simbolo,
    decimales: m.decimales,
    ...filaControl(m),
  }),
  vacio: { codigo: "MXN", nombre: "Nueva moneda", simbolo: "$", decimales: 2 },
  filaANuevo: (f) => ({
    codigo: String(f.codigo),
    nombre: String(f.nombre),
    simbolo: String(f.simbolo),
    decimales: Number(f.decimales) || 0,
  }),
  csv: {
    archivoDefault: "monedas.csv",
    claveNaturalModelo: (m) => m.codigo,
    claveNaturalFila: (v) => v.codigo ?? "",
    campos: [
      { field: "codigo", encabezado: "Código", obligatorio: true },
      { field: "nombre", encabezado: "Nombre", obligatorio: true },
      { field: "simbolo", encabezado: "Símbolo" },
      { field: "decimales", encabezado: "Decimales" },
    ],
  },
};

export const CATALOGOS_GENERALES = [
  organizaciones,
  usuarios,
  unidadesMedida,
  regiones,
  familiasInsumo,
  monedas,
] as const;
