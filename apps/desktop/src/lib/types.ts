export interface AccountInfo {
  correo: string;
  nombre: string;
}

export type ResultadoAbrirPortafolio =
  | { estado: "Activado"; path: string }
  | { estado: "RequiereConfirmacion"; path: string };

export interface PortafolioReciente {
  path: string;
  abierto_en: number;
}

/**
 * Campos de auditoría presentes en (casi) todas las entidades — de solo
 * lectura en la UI. `created_by` es requerido salvo en `Usuario`, la única
 * entidad que puede no tener creador (el admin sembrado, primera identidad
 * del portafolio) — ver `Usuario` más abajo.
 */
export interface CamposControl {
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

/** Borrado lógico: no se muestra en grids; `eliminar` solo marca `deleted`. */
export interface CamposBorradoLogico {
  deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
}

export const TIPOS_ORGANIZACION = ["despacho", "constructora", "gobierno"] as const;
export type TipoOrganizacion = (typeof TIPOS_ORGANIZACION)[number];

export interface Organizacion extends CamposControl, CamposBorradoLogico {
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

/** Membresía de un usuario en una organización, con los datos de esta última — detalle del maestro/detalle de usuarios. */
export interface OrganizacionMembresia {
  membresia_id: string;
  organizacion_id: string;
  razon_social: string;
  rfc: string;
  tipo: TipoOrganizacion;
  activo: boolean;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

export const TIPOS_CLIENTE = ["privado", "gobierno"] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];

export interface Cliente extends CamposControl, CamposBorradoLogico {
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

export interface UnidadMedida extends CamposControl, CamposBorradoLogico {
  id: string;
  simbolo: string;
  simbolo_impresion: string;
  variantes: string;
  clave_sat: string | null;
  descripcion: string;
  tipo_magnitud: TipoMagnitud;
}

export interface UnidadMedidaData {
  simbolo: string;
  simbolo_impresion: string;
  variantes: string;
  clave_sat: string | null;
  descripcion: string;
  tipo_magnitud: TipoMagnitud;
}

export interface Region extends CamposControl, CamposBorradoLogico {
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

export interface FamiliaInsumo extends CamposControl, CamposBorradoLogico {
  id: string;
  parent_id: string | null;
  nombre: string;
  insumos_asociados: string | null;
  icono: string | null;
}

export interface FamiliaInsumoData {
  nombre: string;
  parent_id?: string | null;
  insumos_asociados?: string | null;
  icono?: string | null;
}

/**
 * Receta reutilizable (no cuelga de `insumo`, igual que
 * `factor_salario_real`) para derivar el costo horario en espera y en
 * reserva de un `equipo_costo_horario` — ver `perfil_inactividad_equipo` en
 * el diccionario de datos. Cada porcentaje (0-100, como texto para no
 * perder precisión al viajar por IPC) se aplica al rubro activo que ya
 * cachea `equipo_costo_horario` — cargos fijos, operación, y consumo
 * partido por naturaleza (combustible, lubricante, llantas, piezas
 * especiales, otras fuentes).
 */
export interface PerfilInactividadEquipo extends CamposControl, CamposBorradoLogico {
  id: string;
  organizacion_id: string;
  nombre: string;
  espera_depreciacion_porcentaje: string;
  espera_inversion_porcentaje: string;
  espera_seguro_porcentaje: string;
  espera_mantenimiento_porcentaje: string;
  espera_combustible_porcentaje: string;
  espera_lubricante_porcentaje: string;
  espera_llantas_porcentaje: string;
  espera_piezas_especiales_porcentaje: string;
  espera_otras_fuentes_porcentaje: string;
  espera_operacion_porcentaje: string;
  reserva_depreciacion_porcentaje: string;
  reserva_inversion_porcentaje: string;
  reserva_seguro_porcentaje: string;
  reserva_mantenimiento_porcentaje: string;
  reserva_combustible_porcentaje: string;
  reserva_lubricante_porcentaje: string;
  reserva_llantas_porcentaje: string;
  reserva_piezas_especiales_porcentaje: string;
  reserva_otras_fuentes_porcentaje: string;
  reserva_operacion_porcentaje: string;
}

export interface PerfilInactividadEquipoData {
  nombre: string;
  espera_depreciacion_porcentaje: string;
  espera_inversion_porcentaje: string;
  espera_seguro_porcentaje: string;
  espera_mantenimiento_porcentaje: string;
  espera_combustible_porcentaje: string;
  espera_lubricante_porcentaje: string;
  espera_llantas_porcentaje: string;
  espera_piezas_especiales_porcentaje: string;
  espera_otras_fuentes_porcentaje: string;
  espera_operacion_porcentaje: string;
  reserva_depreciacion_porcentaje: string;
  reserva_inversion_porcentaje: string;
  reserva_seguro_porcentaje: string;
  reserva_mantenimiento_porcentaje: string;
  reserva_combustible_porcentaje: string;
  reserva_lubricante_porcentaje: string;
  reserva_llantas_porcentaje: string;
  reserva_piezas_especiales_porcentaje: string;
  reserva_otras_fuentes_porcentaje: string;
  reserva_operacion_porcentaje: string;
}

export interface Proveedor extends CamposControl, CamposBorradoLogico {
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
  /** Precio nacional vigente (`precio_material`) — serializado como texto para no perder precisión. `null` si nunca se registró un precio. */
  precio_vigente: string | null;
}

export interface ResultadoImportacion {
  importados: number;
  creados: number;
  actualizados: number;
  errores: string[];
  aviso: string | null;
}

export interface PrecioMaterial {
  id: string;
  material_id: string;
  region_id: string | null;
  /** Serializado como texto para no perder precisión. */
  precio: string;
  moneda: string;
  fecha_vigencia_desde: string;
  /** `null` = sigue vigente. */
  fecha_vigencia_hasta: string | null;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

export interface PrecioMaterialData {
  /** Como texto, para no perder precisión al viajar por IPC. */
  precio: string;
  moneda: string;
  region_id: string | null;
  fecha_vigencia_desde: string;
}

/** Un precio a registrar en la actualización de costos de materiales en lote. */
export interface PrecioLoteItem extends PrecioMaterialData {
  material_id: string;
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
}

/**
 * Extensión de `insumo` cuando `tipo = mano_obra` (trabajador atómico, no
 * cuadrilla) — ver `categoria_fasar`/`salario_categoria_fasar` en el
 * diccionario de datos. `salario_vigente` es la vigencia nacional
 * (`region_id` nulo) de `salario_categoria_fasar` — `null` si nunca se le
 * registró un salario.
 */
export interface CategoriaFasar extends CamposControl, CamposBorradoLogico {
  id: string;
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  /** Debe ser hija (`parent_id`) de `familia_id`. */
  sub_familia_id: string | null;
  salario_vigente: SalarioCategoriaFasar | null;
}

export interface CategoriaFasarData {
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  sub_familia_id: string | null;
}

/**
 * Extensión de `insumo` cuando `tipo = equipo_herramienta` y se trata de
 * herramienta mayor/con motor, precio propio simple, sin cálculo de
 * depreciación (a diferencia de `equipo_costo_horario`) — ver `herramienta`
 * en el diccionario de datos. Sin precio propio: dentro de una cuadrilla su
 * costo se resuelve como `porcentaje_mano_obra` × `sub_total_mano_obra`.
 */
export interface Herramienta extends CamposControl, CamposBorradoLogico {
  id: string;
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  /** Debe ser hija (`parent_id`) de `familia_id`. */
  sub_familia_id: string | null;
  /** 0 a 100. */
  porcentaje_mano_obra: number | null;
}

export interface HerramientaData {
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  sub_familia_id: string | null;
  /** 0 a 100. */
  porcentaje_mano_obra: number | null;
}

/**
 * Extensión de `insumo` cuando `tipo = mano_obra` y se trata de un **equipo
 * de trabajo compuesto** (varios integrantes/herramientas), a diferencia de
 * `categoria_fasar` que es un trabajador atómico — ver `cuadrilla` en el
 * diccionario de datos. Tabla delgada, sin cache propio: `costo_nacional` es
 * solo un reflejo de conveniencia de la valuación nacional (`region_id`
 * nulo) de `cuadrilla_costo` — siempre debe existir, toda cuadrilla nace con
 * ella. El resto de las valuaciones (regionales) se listan aparte con
 * `listCuadrillaCostos`.
 */
export interface Cuadrilla extends CamposControl {
  id: string;
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  /** Debe ser hija (`parent_id`) de `familia_id`. */
  sub_familia_id: string | null;
  costo_nacional: CuadrillaCosto | null;
}

export interface CuadrillaData {
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  sub_familia_id: string | null;
}

/**
 * Un renglón de la composición plana de una `cuadrilla` — un integrante
 * (`tipo: "categoria_fasar"`) o una herramienta (`tipo:
 * "equipo_herramienta"`), nunca otra cuadrilla. Compartido entre regiones:
 * `cantidad`/`costo`/`importe` no viven aquí, varían por región y cuelgan de
 * `CuadrillaCostoDetalle` (uno por cada valuación de la cuadrilla).
 */
export interface CuadrillaDetalle {
  id: string;
  cuadrilla_insumo_id: string;
  detalle_insumo_id: string;
  tipo: "categoria_fasar" | "equipo_herramienta";
  orden: number;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

export interface CuadrillaDetalleData {
  detalle_insumo_id: string;
  /**
   * Cantidad inicial capturada en la valuación nacional al dar de alta el
   * renglón — las demás valuaciones existentes de la cuadrilla nacen con
   * `cantidad = 0` para este renglón. Si `detalle_insumo_id` resuelve a
   * `categoria_fasar`: número de integrantes. Si resuelve a `herramienta`:
   * porcentaje 0-100, no una fracción.
   */
  cantidad_nacional: string;
}

/** Solo permite cambiar a qué insumo apunta el renglón de receta. */
export interface CuadrillaDetalleEditarData {
  detalle_insumo_id: string;
}

/**
 * Valuación por región de una `cuadrilla` — reemplaza los tres caches que
 * antes vivían en la extensión 1:1 (ver diccionario de datos).
 * `region_id = null` es la valuación nacional, que toda cuadrilla tiene
 * desde que se crea; una fila regional es opcional.
 */
export interface CuadrillaCosto extends CamposControl {
  id: string;
  cuadrilla_id: string;
  region_id: string | null;
  /** Serializados como texto para no perder precisión. */
  sub_total_mano_obra: string;
  sub_total_herramienta: string;
  costo_total: string;
  /** Última vez que se pulsó ⟳ en esta valuación. No es `updated_at`. */
  sincronizado_en: string | null;
}

/**
 * El renglón numérico de un `CuadrillaDetalle` **dentro de una valuación**
 * concreta — `cantidad` es el único campo capturable, `costo`/`importe` los
 * calcula el backend al recalcular la valuación.
 */
export interface CuadrillaCostoDetalle {
  id: string;
  cuadrilla_costo_id: string;
  cuadrilla_detalle_id: string;
  cantidad: string;
  costo: string;
  importe: string;
  /** Foto de `fecha_vigencia_desde` del salario al recalcular. Solo MO. */
  fecha_precio: string | null;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

export interface CuadrillaCostoDetalleData {
  cantidad: string;
}

export type DireccionMovimiento = "arriba" | "abajo";

/**
 * Extensión de `insumo` cuando `tipo = equipo_herramienta` y se trata de
 * equipo **propio** costado por depreciación/consumo (metodología SCT/CMIC),
 * a diferencia de `herramienta` (sin depreciación) — ver
 * `equipo_costo_horario` en el diccionario de datos. Los campos `cf_*`
 * salvo los 9 de captura directa son cache que recalcula el backend cada
 * vez que se edita el equipo; `cargo_variable_hora`/`costo_horario_total`
 * son cache de la composición (`equipo_costo_horario_detalle`). Serializados
 * como texto para no perder precisión.
 */
export interface EquipoCostoHorario extends CamposControl {
  id: string;
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  /** Debe ser hija (`parent_id`) de `familia_id`. */
  sub_familia_id: string | null;
  /** `null` = nacional — solo descriptivo, no participa en ningún cálculo. */
  region_id: string | null;
  cf_costo_maquina: string;
  cf_valor_llantas: string;
  cf_valor_piezas_especiales: string;
  cf_valor_maquina: string;
  cf_valor_rescate_porcentaje: string;
  cf_valor_rescate: string;
  cf_vida_economica_anios: string;
  cf_horas_uso_anual: string;
  cf_vida_util_horas: string;
  cf_tasa_interes_anual_porcentaje: string;
  cf_tasa_seguros_anual_porcentaje: string;
  cf_mantenimiento_porcentaje: string;
  cf_depreciacion_hora: string;
  cf_inversion_hora: string;
  cf_seguro_hora: string;
  cf_mantenimiento_hora: string;
  cf_cargo_fijo_hora: string;
  subtotal_consumo: string;
  subtotal_operacion: string;
  cargo_variable_hora: string;
  costo_horario_total: string;
}

export interface EquipoCostoHorarioData {
  clave: string;
  descripcion: string;
  unidad_id: string;
  familia_id: string | null;
  sub_familia_id: string | null;
  region_id: string | null;
  cf_costo_maquina: string;
  cf_valor_llantas: string;
  cf_valor_piezas_especiales: string;
  cf_valor_rescate_porcentaje: string;
  cf_vida_economica_anios: string;
  cf_horas_uso_anual: string;
  cf_tasa_interes_anual_porcentaje: string;
  cf_tasa_seguros_anual_porcentaje: string;
  cf_mantenimiento_porcentaje: string;
}

/**
 * Un renglón de la composición plana de un `equipo_costo_horario` — un
 * consumo (`tipo: "consumo"`, material) o una operación (`tipo:
 * "operacion"`, categoría FASAR o cuadrilla), nunca otro equipo de costo
 * horario. `naturaleza` clasifica el consumo para el perfil de inactividad.
 * `costo`/`importe` los calcula el backend, no son editables
 * directamente.
 */
export type NaturalezaEquipoCostoHorarioDetalle =
  | "combustible"
  | "lubricante"
  | "llantas"
  | "piezas_especiales"
  | "otras_fuentes";

export interface EquipoCostoHorarioDetalle {
  id: string;
  equipo_costo_horario_insumo_id: string;
  detalle_insumo_id: string;
  tipo: "consumo" | "operacion";
  naturaleza: NaturalezaEquipoCostoHorarioDetalle | null;
  orden: number;
  /** Cantidad consumida (o jornales/horas de operador) por hora de máquina. */
  cantidad: string;
  costo: string;
  importe: string;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

export interface EquipoCostoHorarioDetalleData {
  detalle_insumo_id: string;
  cantidad: string;
  naturaleza?: NaturalezaEquipoCostoHorarioDetalle | null;
}

/**
 * Vigencia de salario+FSR de una `categoria_fasar` — historizada por
 * región, nunca se sobrescribe. `factor_salario_real` y
 * `salario_real_diario` los calcula el cliente (`modeloCalculo.ts`, campo
 * `fsr`/`monto_salario_real` de `evaluarModelo`) a partir del
 * `factor_salario_real` elegido — el backend solo los guarda.
 */
export interface SalarioCategoriaFasar {
  id: string;
  insumo_id: string;
  region_id: string | null;
  /** Serializados como texto para no perder precisión. */
  salario_base_diario: string;
  factor_salario_real_id: string;
  factor_salario_real: string;
  salario_real_diario: string;
  fecha_vigencia_desde: string;
  /** `null` = sigue vigente. */
  fecha_vigencia_hasta: string | null;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

export interface SalarioCategoriaFasarData {
  salario_base_diario: string;
  factor_salario_real_id: string;
  factor_salario_real: string;
  salario_real_diario: string;
  region_id: string | null;
  fecha_vigencia_desde: string;
}

/** Una vigencia a registrar en la actualización de salarios en lote. */
export interface SalarioLoteItem extends SalarioCategoriaFasarData {
  insumo_id: string;
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

/** Forma serializada de `modelo_calculo_json` — el mismo modelo de `parametros`/`calculados` de `data/initial/factor_salario_real.json`. */
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
export interface FactorSalarioReal extends CamposControl, CamposBorradoLogico {
  id: string;
  organizacion_id: string;
  nombre: string;
  /** `null` = nacional (sin región específica). */
  region_id: string | null;
  /** `ModeloCalculo` serializado. */
  modelo_calculo_json: string;
  parametros_json: string;
}

export interface FactorSalarioRealData {
  nombre: string;
  region_id: string | null;
  modelo_calculo_json: string;
  parametros_json: string;
}

export interface Moneda extends CamposControl, CamposBorradoLogico {
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
