import { invoke } from "@tauri-apps/api/core";
import type {
  AccountInfo,
  CategoriaFasar,
  CategoriaFasarData,
  Cliente,
  Cuadrilla,
  CuadrillaData,
  CuadrillaDetalle,
  CuadrillaDetalleData,
  DireccionMovimiento,
  EquipoCostoHorario,
  EquipoCostoHorarioData,
  EquipoCostoHorarioDetalle,
  EquipoCostoHorarioDetalleData,
  FactorSalarioReal,
  FactorSalarioRealData,
  FamiliaInsumo,
  FamiliaInsumoData,
  Herramienta,
  HerramientaData,
  Material,
  MaterialData,
  OrganizacionData,
  PrecioMaterial,
  PrecioMaterialData,
  PortafolioReciente,
  Proveedor,
  ProveedorData,
  RegionData,
  ResultadoAbrirPortafolio,
  ResultadoImportacion,
  SalarioCategoriaFasar,
  SalarioCategoriaFasarData,
  SalarioLoteItem,
  UnidadMedidaData,
  ClienteData,
  MonedaData,
  UsuarioData,
  Moneda,
  Organizacion,
  OrganizacionMembresia,
  Region,
  UnidadMedida,
  Usuario,
} from "./types";

export function obtenerSesion(): Promise<AccountInfo | null> {
  return invoke("obtener_sesion");
}

export function iniciarSesion(): Promise<AccountInfo> {
  return invoke("iniciar_sesion");
}

export function cerrarSesion(): Promise<void> {
  return invoke("cerrar_sesion");
}

export function crearPortafolio(path: string): Promise<string> {
  return invoke("crear_portafolio", { path });
}

export function abrirPortafolio(path: string): Promise<ResultadoAbrirPortafolio> {
  return invoke("abrir_portafolio", { path });
}

export function confirmarAperturaPortafolioAjeno(confirmar: boolean): Promise<string | null> {
  return invoke("confirmar_apertura_portafolio_ajeno", { confirmar });
}

export function listarPortafoliosRecientes(): Promise<PortafolioReciente[]> {
  return invoke("listar_portafolios_recientes");
}

export function listOrganizaciones(): Promise<Organizacion[]> {
  return invoke("list_organizaciones");
}
export function listOrganizacionesActivas(): Promise<Organizacion[]> {
  return invoke("list_organizaciones_activas");
}
export function obtenerOrganizacionActiva(): Promise<Organizacion> {
  return invoke("organizacion_activa");
}
export function setOrganizacionActiva(organizacionId: string): Promise<void> {
  return invoke("set_organizacion_activa", { organizacionId });
}
export function createOrganizacion(organizacion: OrganizacionData): Promise<Organizacion> {
  return invoke("create_organizacion", { organizacion });
}
export function updateOrganizacion(id: string, organizacion: OrganizacionData): Promise<Organizacion> {
  return invoke("update_organizacion", { id, organizacion });
}
export function deleteOrganizacion(id: string): Promise<void> {
  return invoke("delete_organizacion", { id });
}

export function listUsuarios(): Promise<Usuario[]> {
  return invoke("list_usuarios");
}
export function createUsuario(usuario: UsuarioData): Promise<Usuario> {
  return invoke("create_usuario", { usuario });
}
export function updateUsuario(id: string, usuario: UsuarioData): Promise<Usuario> {
  return invoke("update_usuario", { id, usuario });
}
export function deleteUsuario(id: string): Promise<void> {
  return invoke("delete_usuario", { id });
}

export function listOrganizacionesDeUsuario(usuarioId: string): Promise<OrganizacionMembresia[]> {
  return invoke("list_organizaciones_de_usuario", { usuarioId });
}
export function createOrganizacionUsuario(usuarioId: string, organizacionId: string): Promise<OrganizacionMembresia> {
  return invoke("create_organizacion_usuario", { usuarioId, organizacionId });
}
export function updateOrganizacionUsuario(
  id: string,
  usuarioId: string,
  organizacionId: string,
  activo: boolean,
): Promise<OrganizacionMembresia> {
  return invoke("update_organizacion_usuario", { id, usuarioId, organizacionId, activo });
}
export function deleteOrganizacionUsuario(id: string): Promise<void> {
  return invoke("delete_organizacion_usuario", { id });
}

export function listClientes(): Promise<Cliente[]> {
  return invoke("list_clientes");
}
export function createCliente(cliente: ClienteData): Promise<Cliente> {
  return invoke("create_cliente", { cliente });
}
export function updateCliente(id: string, cliente: ClienteData): Promise<Cliente> {
  return invoke("update_cliente", { id, cliente });
}
export function deleteCliente(id: string): Promise<void> {
  return invoke("delete_cliente", { id });
}

export function listUnidadesMedida(): Promise<UnidadMedida[]> {
  return invoke("list_unidades_medida");
}
export function createUnidadMedida(unidad: UnidadMedidaData): Promise<UnidadMedida> {
  return invoke("create_unidad_medida", { unidad });
}
export function updateUnidadMedida(id: string, unidad: UnidadMedidaData): Promise<UnidadMedida> {
  return invoke("update_unidad_medida", { id, unidad });
}
export function deleteUnidadMedida(id: string): Promise<void> {
  return invoke("delete_unidad_medida", { id });
}

export function listRegiones(): Promise<Region[]> {
  return invoke("list_regiones");
}
export function createRegion(region: RegionData): Promise<Region> {
  return invoke("create_region", { region });
}
export function updateRegion(id: string, region: RegionData): Promise<Region> {
  return invoke("update_region", { id, region });
}
export function deleteRegion(id: string): Promise<void> {
  return invoke("delete_region", { id });
}

export function listFamiliasInsumo(): Promise<FamiliaInsumo[]> {
  return invoke("list_familias_insumo");
}
export function createFamiliaInsumo(familia: FamiliaInsumoData): Promise<FamiliaInsumo> {
  return invoke("create_familia_insumo", { familia });
}
export function updateFamiliaInsumo(id: string, familia: FamiliaInsumoData): Promise<FamiliaInsumo> {
  return invoke("update_familia_insumo", { id, familia });
}
export function deleteFamiliaInsumo(id: string): Promise<void> {
  return invoke("delete_familia_insumo", { id });
}

export function listProveedores(): Promise<Proveedor[]> {
  return invoke("list_proveedores");
}
export function createProveedor(proveedor: ProveedorData): Promise<Proveedor> {
  return invoke("create_proveedor", { proveedor });
}
export function updateProveedor(id: string, proveedor: ProveedorData): Promise<Proveedor> {
  return invoke("update_proveedor", { id, proveedor });
}
export function deleteProveedor(id: string): Promise<void> {
  return invoke("delete_proveedor", { id });
}

export function listMateriales(): Promise<Material[]> {
  return invoke("list_materiales");
}
export function createMaterial(material: MaterialData): Promise<Material> {
  return invoke("create_material", { material });
}
export function updateMaterial(id: string, material: MaterialData): Promise<Material> {
  return invoke("update_material", { id, material });
}
export function deleteMaterial(id: string): Promise<void> {
  return invoke("delete_material", { id });
}
export function importarMaterialesCsv(path: string): Promise<ResultadoImportacion> {
  return invoke("importar_materiales_csv", { path });
}
export function listPreciosMaterial(insumoId: string): Promise<PrecioMaterial[]> {
  return invoke("list_precios_material", { insumoId });
}
export function createPrecioMaterial(insumoId: string, precio: PrecioMaterialData): Promise<PrecioMaterial> {
  return invoke("create_precio_material", { insumoId, precio });
}

export function listFactoresSalarioReal(): Promise<FactorSalarioReal[]> {
  return invoke("list_factores_salario_real");
}
export function getFactorSalarioReal(id: string): Promise<FactorSalarioReal> {
  return invoke("get_factor_salario_real", { id });
}
export function createFactorSalarioReal(factor: FactorSalarioRealData): Promise<FactorSalarioReal> {
  return invoke("create_factor_salario_real", { factor });
}
export function updateFactorSalarioReal(id: string, factor: FactorSalarioRealData): Promise<FactorSalarioReal> {
  return invoke("update_factor_salario_real", { id, factor });
}
export function deleteFactorSalarioReal(id: string): Promise<void> {
  return invoke("delete_factor_salario_real", { id });
}

export function listCategoriasFasar(): Promise<CategoriaFasar[]> {
  return invoke("list_categorias_fasar");
}
export function createCategoriaFasar(categoria: CategoriaFasarData): Promise<CategoriaFasar> {
  return invoke("create_categoria_fasar", { categoria });
}
export function updateCategoriaFasar(id: string, categoria: CategoriaFasarData): Promise<CategoriaFasar> {
  return invoke("update_categoria_fasar", { id, categoria });
}
export function deleteCategoriaFasar(id: string): Promise<void> {
  return invoke("delete_categoria_fasar", { id });
}
export function listSalariosCategoriaFasar(insumoId: string): Promise<SalarioCategoriaFasar[]> {
  return invoke("list_salarios_categoria_fasar", { insumoId });
}
export function createSalarioCategoriaFasar(
  insumoId: string,
  salario: SalarioCategoriaFasarData,
): Promise<SalarioCategoriaFasar> {
  return invoke("create_salario_categoria_fasar", { insumoId, salario });
}
export function createSalariosCategoriaFasarLote(salarios: SalarioLoteItem[]): Promise<SalarioCategoriaFasar[]> {
  return invoke("create_salarios_categoria_fasar_lote", { salarios });
}

export function listHerramientas(): Promise<Herramienta[]> {
  return invoke("list_herramientas");
}
export function createHerramienta(herramienta: HerramientaData): Promise<Herramienta> {
  return invoke("create_herramienta", { herramienta });
}
export function updateHerramienta(id: string, herramienta: HerramientaData): Promise<Herramienta> {
  return invoke("update_herramienta", { id, herramienta });
}
export function deleteHerramienta(id: string): Promise<void> {
  return invoke("delete_herramienta", { id });
}

export function listCuadrillas(): Promise<Cuadrilla[]> {
  return invoke("list_cuadrillas");
}
export function createCuadrilla(cuadrilla: CuadrillaData): Promise<Cuadrilla> {
  return invoke("create_cuadrilla", { cuadrilla });
}
export function updateCuadrilla(id: string, cuadrilla: CuadrillaData): Promise<Cuadrilla> {
  return invoke("update_cuadrilla", { id, cuadrilla });
}
export function deleteCuadrilla(id: string): Promise<void> {
  return invoke("delete_cuadrilla", { id });
}
export function listCuadrillaDetalles(cuadrillaInsumoId: string): Promise<CuadrillaDetalle[]> {
  return invoke("list_cuadrilla_detalles", { cuadrillaInsumoId });
}
export function createCuadrillaDetalle(cuadrillaInsumoId: string, detalle: CuadrillaDetalleData): Promise<Cuadrilla> {
  return invoke("create_cuadrilla_detalle", { cuadrillaInsumoId, detalle });
}
export function updateCuadrillaDetalle(id: string, detalle: CuadrillaDetalleData): Promise<Cuadrilla> {
  return invoke("update_cuadrilla_detalle", { id, detalle });
}
export function deleteCuadrillaDetalle(id: string): Promise<Cuadrilla> {
  return invoke("delete_cuadrilla_detalle", { id });
}
export function moveCuadrillaDetalle(id: string, direccion: DireccionMovimiento): Promise<Cuadrilla> {
  return invoke("move_cuadrilla_detalle", { id, direccion });
}

export function listEquiposCostoHorario(): Promise<EquipoCostoHorario[]> {
  return invoke("list_equipos_costo_horario");
}
export function createEquipoCostoHorario(equipo: EquipoCostoHorarioData): Promise<EquipoCostoHorario> {
  return invoke("create_equipo_costo_horario", { equipo });
}
export function updateEquipoCostoHorario(id: string, equipo: EquipoCostoHorarioData): Promise<EquipoCostoHorario> {
  return invoke("update_equipo_costo_horario", { id, equipo });
}
export function deleteEquipoCostoHorario(id: string): Promise<void> {
  return invoke("delete_equipo_costo_horario", { id });
}
export function listEquipoCostoHorarioDetalles(equipoCostoHorarioInsumoId: string): Promise<EquipoCostoHorarioDetalle[]> {
  return invoke("list_equipo_costo_horario_detalles", { equipoCostoHorarioInsumoId });
}
export function createEquipoCostoHorarioDetalle(
  equipoCostoHorarioInsumoId: string,
  detalle: EquipoCostoHorarioDetalleData,
): Promise<EquipoCostoHorario> {
  return invoke("create_equipo_costo_horario_detalle", { equipoCostoHorarioInsumoId, detalle });
}
export function updateEquipoCostoHorarioDetalle(
  id: string,
  detalle: EquipoCostoHorarioDetalleData,
): Promise<EquipoCostoHorario> {
  return invoke("update_equipo_costo_horario_detalle", { id, detalle });
}
export function deleteEquipoCostoHorarioDetalle(id: string): Promise<EquipoCostoHorario> {
  return invoke("delete_equipo_costo_horario_detalle", { id });
}
export function moveEquipoCostoHorarioDetalle(id: string, direccion: DireccionMovimiento): Promise<EquipoCostoHorario> {
  return invoke("move_equipo_costo_horario_detalle", { id, direccion });
}

export function escribirArchivoTexto(path: string, contenido: string): Promise<void> {
  return invoke("escribir_archivo_texto", { path, contenido });
}
export function leerArchivoTexto(path: string): Promise<string> {
  return invoke("leer_archivo_texto", { path });
}

export function listMonedas(): Promise<Moneda[]> {
  return invoke("list_monedas");
}
export function createMoneda(moneda: MonedaData): Promise<Moneda> {
  return invoke("create_moneda", { moneda });
}
export function updateMoneda(id: string, moneda: MonedaData): Promise<Moneda> {
  return invoke("update_moneda", { id, moneda });
}
export function deleteMoneda(id: string): Promise<void> {
  return invoke("delete_moneda", { id });
}
