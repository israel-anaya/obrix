#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod commands;

use std::path::PathBuf;

use obrix_db::entities::organizacion;
use sea_orm::EntityTrait;
use tokio::sync::{RwLock, RwLockReadGuard};

use auth::AccountInfo;

/// Todo lo que depende del portafolio actualmente abierto. Vive detrás de un
/// `RwLock` en `AppState` porque, a diferencia del bootstrap anterior, ahora
/// puede no existir al arrancar y puede reemplazarse en caliente cuando el
/// usuario crea o abre otro portafolio.
pub struct PortafolioActivo {
    pub portafolio: Box<dyn obrix_db::PortafolioRepository>,
    pub organizacion_id: String,
    /// El `usuario` (de este portafolio) correspondiente a la cuenta que
    /// inició sesión — usado como `created_by`/`updated_by` en el resto de
    /// comandos. Ver `commands::portafolio` para cómo se resuelve.
    pub usuario_id_activo: String,
}

/// Un portafolio ya abierto (conexión + organización resuelta) al que le
/// falta resolver `usuario_id_activo` porque la cuenta activa no tiene un
/// `usuario` en él todavía — queda aquí mientras el frontend pregunta al
/// usuario si de verdad quiere entrar a un portafolio ajeno.
pub struct PortafolioPendiente {
    pub portafolio: Box<dyn obrix_db::PortafolioRepository>,
    pub organizacion_id: String,
    pub path: PathBuf,
}

pub struct AppState {
    activo: RwLock<Option<PortafolioActivo>>,
    pendiente: RwLock<Option<PortafolioPendiente>>,
    cuenta: RwLock<Option<AccountInfo>>,
}

impl AppState {
    fn nuevo() -> Self {
        Self {
            activo: RwLock::new(None),
            pendiente: RwLock::new(None),
            cuenta: RwLock::new(None),
        }
    }

    /// Devuelve el portafolio activo, o un error si todavía no se ha
    /// creado/abierto ninguno. Los comandos que dependen de datos deben
    /// pasar siempre por aquí.
    pub async fn requerir(&self) -> Result<RwLockReadGuard<'_, Option<PortafolioActivo>>, String> {
        let guard = self.activo.read().await;
        if guard.is_none() {
            return Err("No hay portafolio abierto".to_string());
        }
        Ok(guard)
    }

    pub async fn reemplazar(&self, activo: PortafolioActivo) {
        *self.activo.write().await = Some(activo);
    }

    /// Cambia la organización activa del portafolio ya abierto, sin tocar la
    /// conexión ni `usuario_id_activo`. El llamador es responsable de
    /// verificar antes que la cuenta activa tiene membresía en esa
    /// organización (ver `commands::portafolio::set_organizacion_activa`).
    pub async fn set_organizacion_activa(&self, organizacion_id: String) -> Result<(), String> {
        let mut guard = self.activo.write().await;
        match guard.as_mut() {
            Some(activo) => {
                activo.organizacion_id = organizacion_id;
                Ok(())
            }
            None => Err("No hay portafolio abierto".to_string()),
        }
    }

    /// Cuenta activa ya resuelta (cacheada tras `obtener_sesion`/`iniciar_sesion`),
    /// o error si todavía no hay sesión iniciada.
    pub async fn requerir_cuenta(&self) -> Result<AccountInfo, String> {
        self.cuenta
            .read()
            .await
            .clone()
            .ok_or_else(|| "No hay sesión iniciada".to_string())
    }

    pub async fn cuenta(&self) -> Option<AccountInfo> {
        self.cuenta.read().await.clone()
    }

    pub async fn set_cuenta(&self, cuenta: AccountInfo) {
        *self.cuenta.write().await = Some(cuenta);
    }

    pub async fn limpiar_cuenta(&self) {
        *self.cuenta.write().await = None;
    }

    pub async fn dejar_pendiente(&self, pendiente: PortafolioPendiente) {
        *self.pendiente.write().await = Some(pendiente);
    }

    pub async fn tomar_pendiente(&self) -> Option<PortafolioPendiente> {
        self.pendiente.write().await.take()
    }
}

/// Resuelve el `organizacion_id` a usar en el resto de comandos — la
/// primera organización que exista. No crea nada: sembrar la organización
/// demo es responsabilidad de `obrix_services::seed::sembrar_catalogos_generales`,
/// llamada aparte solo al crear un portafolio nuevo (ver `commands::portafolio`).
pub(crate) async fn resolver_organizacion_id(
    portafolio: &dyn obrix_db::PortafolioRepository,
) -> Result<String, sea_orm::DbErr> {
    Ok(organizacion::Entity::find()
        .one(portafolio.conexion())
        .await?
        .map(|o| o.id)
        .unwrap_or_default())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::nuevo())
        .invoke_handler(tauri::generate_handler![
            commands::auth::obtener_sesion,
            commands::auth::iniciar_sesion,
            commands::auth::cerrar_sesion,
            commands::portafolio::crear_portafolio,
            commands::portafolio::abrir_portafolio,
            commands::portafolio::confirmar_apertura_portafolio_ajeno,
            commands::portafolio::set_organizacion_activa,
            commands::organizaciones::list_organizaciones,
            commands::organizaciones::list_organizaciones_activas,
            commands::organizaciones::organizacion_activa,
            commands::organizaciones::create_organizacion,
            commands::organizaciones::update_organizacion,
            commands::organizaciones::delete_organizacion,
            commands::usuarios::list_usuarios,
            commands::usuarios::create_usuario,
            commands::usuarios::update_usuario,
            commands::usuarios::delete_usuario,
            commands::usuarios::list_organizaciones_de_usuario,
            commands::usuarios::create_organizacion_usuario,
            commands::usuarios::update_organizacion_usuario,
            commands::usuarios::delete_organizacion_usuario,
            commands::clientes::list_clientes,
            commands::clientes::create_cliente,
            commands::clientes::update_cliente,
            commands::clientes::delete_cliente,
            commands::unidades_medida::list_unidades_medida,
            commands::unidades_medida::create_unidad_medida,
            commands::unidades_medida::update_unidad_medida,
            commands::unidades_medida::delete_unidad_medida,
            commands::regiones::list_regiones,
            commands::regiones::create_region,
            commands::regiones::update_region,
            commands::regiones::delete_region,
            commands::familias_insumo::list_familias_insumo,
            commands::familias_insumo::create_familia_insumo,
            commands::familias_insumo::update_familia_insumo,
            commands::familias_insumo::delete_familia_insumo,
            commands::monedas::list_monedas,
            commands::monedas::create_moneda,
            commands::monedas::update_moneda,
            commands::monedas::delete_moneda,
            commands::proveedores::list_proveedores,
            commands::proveedores::create_proveedor,
            commands::proveedores::update_proveedor,
            commands::proveedores::delete_proveedor,
            commands::materiales::list_materiales,
            commands::materiales::create_material,
            commands::materiales::update_material,
            commands::materiales::delete_material,
            commands::materiales::importar_materiales_csv,
            commands::precios_material::list_precios_material,
            commands::precios_material::create_precio_material,
            commands::factores_salario_real::list_factores_salario_real,
            commands::factores_salario_real::get_factor_salario_real,
            commands::factores_salario_real::create_factor_salario_real,
            commands::factores_salario_real::update_factor_salario_real,
            commands::factores_salario_real::delete_factor_salario_real,
            commands::categorias_fasar::list_categorias_fasar,
            commands::categorias_fasar::create_categoria_fasar,
            commands::categorias_fasar::update_categoria_fasar,
            commands::categorias_fasar::delete_categoria_fasar,
            commands::salarios_categoria_fasar::list_salarios_categoria_fasar,
            commands::salarios_categoria_fasar::create_salario_categoria_fasar,
            commands::archivo_json::escribir_archivo_texto,
            commands::archivo_json::leer_archivo_texto,
        ])
        .run(tauri::generate_context!())
        .expect("error corriendo la aplicación Tauri");
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use obrix_plugins::PortafolioFactory;
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};

    use obrix_services::seed::sembrar_catalogos_generales;

    #[tokio::test]
    async fn sembrar_catalogos_generales_es_idempotente_y_respeta_el_orden() {
        let portafolio = PortafolioFactory::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");

        sembrar_catalogos_generales(portafolio.as_ref())
            .await
            .expect("primer sembrado");
        sembrar_catalogos_generales(portafolio.as_ref())
            .await
            .expect("segundo sembrado (no debe duplicar)");

        let organizaciones = obrix_db::entities::organizacion::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar organizaciones");
        assert_eq!(
            organizaciones.len(),
            1,
            "organizacion no debe duplicarse al sembrar dos veces"
        );

        let unidades = obrix_db::entities::unidad_medida::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar unidades");
        assert_eq!(
            unidades.len(),
            33,
            "deben quedar las 33 unidades default, sin duplicar"
        );

        let monedas = obrix_db::entities::moneda::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar monedas");
        assert_eq!(monedas.len(), 2, "deben quedar las 2 monedas default, sin duplicar");

        let familias = obrix_db::entities::familia_insumo::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar familias");
        assert_eq!(familias.len(), 84, "18 familias padre + 66 hijas, sin duplicar");
        let hija = familias
            .iter()
            .find(|f| f.nombre == "Concreto premezclado")
            .expect("familia hija");
        let padre = familias
            .iter()
            .find(|f| f.nombre == "Concretos y morteros")
            .expect("familia padre");
        assert_eq!(
            hija.parent_id.as_deref(),
            Some(padre.id.as_str()),
            "la hija debe apuntar al padre"
        );

        let usuarios = obrix_db::entities::usuario::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar usuarios");
        assert_eq!(usuarios.len(), 1);

        let membresias = obrix_db::entities::organizacion_usuario::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar membresías");
        assert!(
            membresias.is_empty(),
            "el usuario admin no debe recibir membresía en ninguna organización — nunca inicia sesión"
        );

        let categorias = obrix_db::entities::categoria_fasar::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar categorias_fasar");
        assert_eq!(
            categorias.len(),
            32,
            "32 categorías de data/categorias.csv, sin duplicar"
        );

        let insumos_mo = obrix_db::entities::insumo::Entity::find()
            .filter(
                obrix_db::entities::insumo::Column::Tipo
                    .eq(obrix_db::entities::insumo::TipoInsumo::ManoObra),
            )
            .all(portafolio.conexion())
            .await
            .expect("listar insumos de mano de obra");
        assert_eq!(insumos_mo.len(), 32);

        let aluminero = insumos_mo
            .iter()
            .find(|i| i.descripcion == "Aluminero")
            .expect("Aluminero");
        assert_eq!(aluminero.clave, "MO-001");
        let jor = unidades
            .iter()
            .find(|u| u.simbolo == "jor")
            .expect("unidad jor");
        assert_eq!(aluminero.unidad_id, jor.id);
        let familia_aluminero = familias
            .iter()
            .find(|f| Some(&f.id) == aluminero.familia_id.as_ref())
            .expect("familia de Aluminero");
        let subfamilia_aluminero = familias
            .iter()
            .find(|f| Some(&f.id) == aluminero.sub_familia_id.as_ref())
            .expect("subfamilia de Aluminero");
        assert_eq!(familia_aluminero.nombre, "Mano de obra");
        assert_eq!(subfamilia_aluminero.nombre, "Herrería");
        assert_eq!(
            subfamilia_aluminero.parent_id.as_deref(),
            Some(familia_aluminero.id.as_str()),
            "Herrería de Aluminero debe ser hija de Mano de obra, no de Cancelería y vidrio"
        );

        let factores = obrix_db::entities::factor_salario_real::Entity::find()
            .order_by_asc(obrix_db::entities::factor_salario_real::Column::CreatedAt)
            .all(portafolio.conexion())
            .await
            .expect("listar factores de salario real");
        assert_eq!(
            factores.len(),
            4,
            "1 nacional + 3 regiones, sin duplicar"
        );
        assert!(
            factores[0].region_id.is_none(),
            "el FSR nacional (region_id nulo) debe ser el primer registro"
        );
        assert_eq!(factores[0].nombre, "FSR — Nacional");
        assert_eq!(
            factores.iter().filter(|f| f.region_id.is_none()).count(),
            1,
            "solo un FSR nacional"
        );
    }
}
