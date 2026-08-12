import { invoke } from "@tauri-apps/api/core";
import type {
  AccountInfo,
  CategoriaFsr,
  CategoriaFsrData,
  Cliente,
  FactorSalarioReal,
  FactorSalarioRealData,
  FamiliaInsumo,
  FamiliaInsumoData,
  Material,
  MaterialData,
  OrganizacionData,
  PrecioMaterial,
  PrecioMaterialData,
  Proveedor,
  ProveedorData,
  RegionData,
  ResultadoAbrirPortafolio,
  ResultadoImportacion,
  UnidadMedidaData,
  ClienteData,
  MonedaData,
  UsuarioData,
  Moneda,
  Organizacion,
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

export function crearPortafolio(path: string): Promise<string> {
  return invoke("crear_portafolio", { path });
}

export function abrirPortafolio(path: string): Promise<ResultadoAbrirPortafolio> {
  return invoke("abrir_portafolio", { path });
}

export function confirmarAperturaPortafolioAjeno(confirmar: boolean): Promise<string | null> {
  return invoke("confirmar_apertura_portafolio_ajeno", { confirmar });
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

export function listCategoriasFsr(): Promise<CategoriaFsr[]> {
  return invoke("list_categorias_fsr");
}
export function createCategoriaFsr(categoria: CategoriaFsrData): Promise<CategoriaFsr> {
  return invoke("create_categoria_fsr", { categoria });
}
export function updateCategoriaFsr(id: string, categoria: CategoriaFsrData): Promise<CategoriaFsr> {
  return invoke("update_categoria_fsr", { id, categoria });
}
export function deleteCategoriaFsr(id: string): Promise<void> {
  return invoke("delete_categoria_fsr", { id });
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
