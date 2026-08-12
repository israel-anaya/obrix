export interface AccountInfo {
  correo: string;
  nombre: string;
}

export type ResultadoAbrirPortafolio =
  | { estado: "Activado"; path: string }
  | { estado: "RequiereConfirmacion"; path: string };

/**
 * Campos de auditoría presentes en (casi) todas las entidades — de solo
 * lectura en la UI. `created_by` es requerido salvo en `Usuario`, la única
 * entidad que puede no tener creador (el admin sembrado, primera identidad
 * del portafolio) — ver `Usuario` más abajo.
 */
export interface CamposControl {
  created_at: string;
  updated_at: string | null;
  created_by: string;
  updated_by: string | null;
}

export const TIPOS_ORGANIZACION = ["despacho", "constructora", "dependencia_publica"] as const;
export type TipoOrganizacion = (typeof TIPOS_ORGANIZACION)[number];

export interface Organizacion extends CamposControl {
  id: string;
  razon_social: string;
  rfc: string;
  tipo: TipoOrganizacion;
  /** Moneda usada por default al capturar precios — requerida, siempre sembrada con MXN. */
  moneda_default_id: string;
}

export interface OrganizacionData {
  razon_social: string;
  rfc: string;
  tipo: TipoOrganizacion;
  moneda_default_id: string;
}

export const ROLES_USUARIO = ["admin", "propietario", "editor", "lector"] as const;
export type RolUsuario = (typeof ROLES_USUARIO)[number];

export interface Usuario extends Omit<CamposControl, "created_by"> {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  activo: boolean;
  /** El admin sembrado (primera identidad del portafolio) no tiene creador. */
  created_by: string | null;
}

export interface UsuarioData {
  nombre: string;
  correo: string;
  rol: RolUsuario;
  activo: boolean;
}

export const TIPOS_CLIENTE = ["privado", "dependencia_publica"] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];

export interface Cliente extends CamposControl {
  id: string;
  organizacion_id: string;
  razon_social: string;
  rfc: string;
  tipo: TipoCliente;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  domicilio_fiscal: string | null;
}

export interface ClienteData {
  razon_social: string;
  rfc: string;
  tipo: TipoCliente;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  domicilio_fiscal: string | null;
}

export const TIPOS_MAGNITUD = ["longitud", "area", "volumen", "masa", "pieza", "tiempo", "otro"] as const;
export type TipoMagnitud = (typeof TIPOS_MAGNITUD)[number];

export interface UnidadMedida extends CamposControl {
  id: string;
  simbolo: string;
  simbolo_impresion: string;
  clave_sat: string | null;
  descripcion: string;
  tipo_magnitud: TipoMagnitud;
}

export interface UnidadMedidaData {
  simbolo: string;
  simbolo_impresion: string;
  clave_sat: string | null;
  descripcion: string;
  tipo_magnitud: TipoMagnitud;
}

export interface Region extends CamposControl {
  id: string;
  nombre: string;
  estado: string;
  factor_ajuste: string | null;
}

export interface RegionData {
  nombre: string;
  estado: string;
  factor_ajuste: string | null;
}

export interface CategoriaFsr extends CamposControl {
  id: string;
  nombre: string;
}

export interface CategoriaFsrData {
  nombre: string;
}

export interface FamiliaInsumo extends CamposControl {
  id: string;
  parent_id: string | null;
  nombre: string;
}

export interface FamiliaInsumoData {
  nombre: string;
  parent_id?: string | null;
}

export interface Proveedor extends CamposControl {
  id: string;
  organizacion_id: string;
  razon_social: string;
  rfc: string;
  contacto: string | null;
  calificacion: string | null;
}

export interface ProveedorData {
  razon_social: string;
  rfc: string;
  contacto: string | null;
  calificacion: string | null;
}

export interface Material extends CamposControl {
  id: string;
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  /** Debe ser hija (`parent_id`) de `familia_id`. */
  sub_familia_id: string | null;
  proveedor_id: string | null;
  /** 0 a 100. */
  merma_porcentaje: number | null;
  marca: string | null;
  activo: boolean;
  /** Precio nacional vigente (`precio_material`) — serializado como texto para no perder precisión. `null` si nunca se registró un precio. */
  precio_vigente: string | null;
}

export interface ResultadoImportacion {
  importados: number;
  errores: string[];
}

export interface PrecioMaterial {
  id: string;
  insumo_id: string;
  region_id: string | null;
  /** Serializado como texto para no perder precisión. */
  precio: string;
  moneda: string;
  fecha_vigencia_desde: string;
  /** `null` = sigue vigente. */
  fecha_vigencia_hasta: string | null;
  created_at: string;
  updated_at: string | null;
  created_by: string;
  updated_by: string | null;
}

export interface PrecioMaterialData {
  /** Como texto, para no perder precisión al viajar por IPC. */
  precio: string;
  moneda: string;
  region_id: string | null;
  fecha_vigencia_desde: string;
}

export interface MaterialData {
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  /** Debe ser hija (`parent_id`) de `familia_id`. */
  sub_familia_id: string | null;
  proveedor_id: string | null;
  /** 0 a 100. */
  merma_porcentaje: number | null;
  marca: string | null;
  activo: boolean;
}

/**
 * Un renglón de una variable de tipo `"rango"` — un valor que depende de en
 * qué rango de pesos cae un dato (ej. la tabla de cesantía-vejez del IMSS,
 * o cualquier otra tarifa por tramos). `inferior`/`superior` son límites
 * absolutos en pesos (ya resueltos — no "veces UMA"); `superior === null`
 * marca el renglón sin límite superior. `clasificacion` es una etiqueta
 * libre solo informativa (ej. "1.51 a 2.00 UMA") — no participa en el
 * cálculo, que solo usa `inferior`/`superior`. Ver `rango(id, valor)` en
 * `lib/formulaEngine.ts`.
 */
export interface RangoRenglon {
  clasificacion: string;
  inferior: number;
  superior: number | null;
  valor: number;
}

/** Valor de una variable de tipo `"rango"` — ver `RangoRenglon`. */
export type ValorRango = RangoRenglon[];

export const TIPOS_PARAMETRO = ["numero", "booleano", "rango"] as const;
export type TipoParametro = (typeof TIPOS_PARAMETRO)[number];

/**
 * Parámetro de entrada de un modelo de cálculo (`numero`/`booleano`/`rango`)
 * que el usuario captura por configuración. Ver `lib/modeloCalculo.ts` para
 * cómo se evalúa junto con los campos calculados.
 */
export interface Parametro {
  id: string;
  etiqueta: string;
  /** Categoría del parámetro (salariales/económicos/días/tasas/límites y tarifas). */
  grupo: string;
  tipo: TipoParametro;
  /** Fundamento legal (ej. "Art. 106 LSS fracc. II") — solo documental. */
  referencia_legal?: string;
  /** Explicación en prosa de qué es y cómo se usa — solo documental. */
  descripcion?: string;
  /** Valor inicial al crear una configuración nueva. */
  valor_default: number | boolean | ValorRango;
}

/**
 * Campo calculado de un modelo de cálculo: su valor sale de `formula`
 * evaluada a partir de otros parámetros/campos calculados. Los redondeos NO
 * se declaran aparte: viven dentro de la propia fórmula vía `round(x, n)`.
 * Las salidas del motor ("fsr", "monto_salario_real") se identifican por
 * convención de id, no por un campo extra — ver `validarModelo`. Ver
 * `lib/formulaEngine.ts` para la sintaxis de `formula`.
 */
export interface CampoCalculado {
  id: string;
  etiqueta: string;
  tipo: "formula";
  /** Fundamento legal (ej. "Art. 106 LSS fracc. II") — solo documental. */
  referencia_legal?: string;
  /** Explicación en prosa de qué es y cómo se usa — solo documental. */
  descripcion?: string;
  formula: string;
}

/** Cualquier variable de un modelo de cálculo — parámetro o campo calculado, para consumidores que necesitan ambos juntos (ej. el grafo de dependencias). */
export type VariableCalculo = Parametro | CampoCalculado;

/** Forma serializada de `modelo_calculo_json` — el mismo modelo de `parametros`/`calculados` de `data/modelo-calculo-fasar.json`. */
export interface ModeloCalculo {
  parametros: Parametro[];
  calculados: CampoCalculado[];
}

/**
 * Catálogo de configuraciones de Factor de Salario Real — reutilizable
 * entre insumos de mano de obra (ej. "FSR construcción — riesgo clase V,
 * 2026"). `modelo_calculo_json` (`ModeloCalculo` serializado) define CÓMO se
 * calcula — editable con el ícono "Editar modelo de cálculo"; `parametros_json`
 * trae los valores de las variables de entrada que ese modelo declara (QUÉ se
 * captura), como `Record<string, number | boolean | ValorRango>` serializado.
 */
export interface FactorSalarioReal extends CamposControl {
  id: string;
  organizacion_id: string;
  nombre: string;
  /** `null` = nacional (sin región específica). */
  region_id: string | null;
  /** `ModeloCalculo` serializado. */
  modelo_calculo_json: string;
  parametros_json: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface FactorSalarioRealData {
  nombre: string;
  region_id: string | null;
  modelo_calculo_json: string;
  parametros_json: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface Moneda extends CamposControl {
  id: string;
  codigo: string;
  nombre: string;
  simbolo: string;
  decimales: number;
}

export interface MonedaData {
  codigo: string;
  nombre: string;
  simbolo: string;
  decimales: number;
}
