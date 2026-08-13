import type { CatalogoColumnaDef, CatalogoGridConfig } from "@/features/catalogos/CatalogoGrid";
import type { Fila } from "@/features/catalogos/CatalogoGrid";
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

export interface CatalogoGeneralDescriptor<T extends { id: string }, Nuevo> {
  id: string;
  titulo: string;
  grid: CatalogoGridConfig;
  api: CatalogoGeneralApi<T, Nuevo>;
  aFila: (modelo: T) => Fila;
  /** Alternativa a `aFila` cuando el orden/anidamiento de las filas depende del listado completo (p. ej. un árbol por `parent_id`). */
  aFilas?: (modelos: T[]) => Fila[];
  vacio: Nuevo;
  filaANuevo: (fila: Fila) => Nuevo;
}

/** Columnas de auditoría comunes a (casi) toda entidad — visibles, nunca editables. */
const COLUMNAS_CONTROL: CatalogoColumnaDef[] = [
  { campo: "created_at", encabezado: "Creado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "created_by", encabezado: "Creado por", ancho: 220, soloLectura: true },
  { campo: "updated_at", encabezado: "Actualizado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "updated_by", encabezado: "Actualizado por", ancho: 220, soloLectura: true },
];

/**
 * Acepta también `Usuario`, la única entidad cuyo `created_by` puede ser
 * `null` (el admin sembrado) — de ahí el tipo laxo en vez de `CamposControl`.
 */
function filaControl(m: {
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
}): Pick<Fila, "created_at" | "created_by" | "updated_at" | "updated_by"> {
  return {
    created_at: m.created_at,
    created_by: m.created_by ?? "",
    updated_at: m.updated_at ?? "",
    updated_by: m.updated_by ?? "",
  };
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
    titulo: "Organización",
    columnas: [
      { campo: "razon_social", encabezado: "Razón social" },
      { campo: "rfc", encabezado: "RFC", ancho: 140 },
      { campo: "tipo", encabezado: "Tipo", ancho: 160, opciones: TIPOS_ORGANIZACION },
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
  vacio: { razon_social: "Nueva organización", rfc: "", tipo: "despacho", moneda_default_id: "" },
  filaANuevo: (f) => ({
    razon_social: String(f.razon_social),
    rfc: String(f.rfc),
    // La celda usa un selector (opciones: TIPOS_ORGANIZACION), así que el
    // valor siempre es uno de los válidos — el cast solo recupera el tipo literal.
    tipo: String(f.tipo) as TipoOrganizacion,
    moneda_default_id: "",
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
    titulo: "Usuarios",
    columnas: [
      { campo: "nombre", encabezado: "Nombre" },
      { campo: "correo", encabezado: "Correo", ancho: 200 },
      { campo: "rol", encabezado: "Rol", ancho: 130, opciones: ROLES_USUARIO },
      { campo: "activo", encabezado: "Activo", ancho: 90, booleano: true },
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
    titulo: "Unidades de medida",
    columnas: [
      { campo: "simbolo", encabezado: "Símbolo", ancho: 100 },
      { campo: "simbolo_impresion", encabezado: "Símbolo de impresión", ancho: 160 },
      { campo: "clave_sat", encabezado: "Clave SAT", ancho: 120 },
      { campo: "descripcion", encabezado: "Descripción" },
      { campo: "tipo_magnitud", encabezado: "Tipo de magnitud", ancho: 160, opciones: TIPOS_MAGNITUD },
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
    clave_sat: m.clave_sat ?? "",
    descripcion: m.descripcion,
    tipo_magnitud: m.tipo_magnitud,
    ...filaControl(m),
  }),
  vacio: {
    simbolo: "NVA",
    simbolo_impresion: "NVA",
    clave_sat: null,
    descripcion: "Nueva unidad",
    tipo_magnitud: "otro",
  },
  filaANuevo: (f) => ({
    simbolo: String(f.simbolo),
    simbolo_impresion: String(f.simbolo_impresion),
    clave_sat: String(f.clave_sat) || null,
    descripcion: String(f.descripcion),
    // La celda usa un selector (opciones: TIPOS_MAGNITUD), así que el valor
    // siempre es uno de los válidos — el cast solo recupera el tipo literal.
    tipo_magnitud: String(f.tipo_magnitud) as TipoMagnitud,
  }),
};

const regiones: CatalogoGeneralDescriptor<Region, RegionData> = {
  id: "regiones",
  titulo: "Regiones",
  grid: {
    titulo: "Regiones",
    columnas: [
      { campo: "nombre", encabezado: "Nombre" },
      { campo: "estado", encabezado: "Estado", ancho: 160 },
      { campo: "factor_ajuste", encabezado: "Factor de ajuste", numero: true, ancho: 150 },
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
    ...filaControl(m),
  }),
  vacio: { nombre: "Nueva región", estado: "", factor_ajuste: null },
  filaANuevo: (f) => ({
    nombre: String(f.nombre),
    estado: String(f.estado),
    factor_ajuste: String(f.factor_ajuste) || null,
  }),
};

const familiasInsumo: CatalogoGeneralDescriptor<FamiliaInsumo, FamiliaInsumoData> = {
  id: "familias-insumo",
  titulo: "Familias de insumo",
  grid: {
    titulo: "Familias de insumo",
    columnas: [{ campo: "nombre", encabezado: "Nombre" }, ...COLUMNAS_CONTROL],
  },
  api: {
    list: api.listFamiliasInsumo,
    crear: api.createFamiliaInsumo,
    actualizar: api.updateFamiliaInsumo,
    eliminar: api.deleteFamiliaInsumo,
  },
  aFila: (m) => ({ _id: m.id, nombre: m.nombre, ...filaControl(m) }),
  vacio: { nombre: "Nueva familia" },
  filaANuevo: (f) => ({ nombre: String(f.nombre) }),
};

const monedas: CatalogoGeneralDescriptor<Moneda, MonedaData> = {
  id: "monedas",
  titulo: "Monedas",
  grid: {
    titulo: "Monedas",
    columnas: [
      { campo: "codigo", encabezado: "Código", ancho: 100 },
      { campo: "nombre", encabezado: "Nombre" },
      { campo: "simbolo", encabezado: "Símbolo", ancho: 100 },
      { campo: "decimales", encabezado: "Decimales", numero: true, ancho: 110 },
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
};

export const CATALOGOS_GENERALES = [
  organizaciones,
  usuarios,
  unidadesMedida,
  regiones,
  familiasInsumo,
  monedas,
] as const;
