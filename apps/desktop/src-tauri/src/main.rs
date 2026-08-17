#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod commands;
mod recientes;

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

/// Wayland no deja leer ni fijar la posición de una ventana, así que el plugin
/// de window-state guarda siempre `(0, 0)` y reabre en el monitor principal.
/// Si hay un `DISPLAY` X11 (XWayland, WSLg), GDK lo usa para poder restaurar
/// monitor y posición. `GDK_BACKEND` ya definido en el entorno no se toca.
#[cfg(target_os = "linux")]
fn preferir_x11_para_restaurar_ventana() {
    if std::env::var_os("GDK_BACKEND").is_some() || std::env::var_os("DISPLAY").is_none() {
        return;
    }
    // SAFETY: se llama al inicio de `main`, antes de crear hilos o GTK.
    unsafe {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

/// Tras restaurar tamaño/posición (ventana creada con `visible: false`),
/// WebKitGTK deja a menudo la región de input desfasada: se ve la UI pero
/// no llega ningún clic. `set_focus` cubre el click-to-activate de X11;
/// el resize de ±1 px fuerza a GTK a volver a `size_allocate` la webview.
/// También se reaplica al desmaximizar, que es el otro camino que rompe
/// la superficie. Ver tauri#11856 y tauri#10746.
#[cfg(target_os = "linux")]
fn reparar_clics_tras_restaurar_ventana(app: &tauri::App) {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tauri::{Manager, PhysicalSize, WindowEvent};

    let Some(win) = app.get_webview_window("main") else {
        return;
    };

    fn nudge(win: &tauri::WebviewWindow) {
        let _ = win.set_focus();
        let _ = win.set_resizable(false);
        let _ = win.set_resizable(true);
        if win.is_maximized().unwrap_or(false) {
            return;
        }
        let Ok(original) = win.inner_size() else {
            return;
        };
        if original.width <= 1 || original.height <= 1 {
            return;
        }
        let _ = win.set_size(PhysicalSize::new(
            original.width.saturating_add(1),
            original.height,
        ));
        let win = win.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            let _ = win.set_size(original);
        });
    }

    let win_inicio = win.clone();
    tauri::async_runtime::spawn(async move {
        // La webview aún no ha hecho realize cuando el plugin hace show().
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        nudge(&win_inicio);
    });

    let maximizada = Arc::new(AtomicBool::new(win.is_maximized().unwrap_or(false)));
    let win_evento = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Resized(_) = event {
            let ahora = win_evento.is_maximized().unwrap_or(false);
            let antes = maximizada.swap(ahora, Ordering::Relaxed);
            if antes && !ahora {
                nudge(&win_evento);
            }
        }
    });
}

fn main() {
    #[cfg(target_os = "linux")]
    preferir_x11_para_restaurar_ventana();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            reparar_clics_tras_restaurar_ventana(app);
            Ok(())
        })
        .manage(AppState::nuevo())
        .invoke_handler(tauri::generate_handler![
            commands::auth::obtener_sesion,
            commands::auth::iniciar_sesion,
            commands::auth::cerrar_sesion,
            commands::portafolio::crear_portafolio,
            commands::portafolio::abrir_portafolio,
            commands::portafolio::confirmar_apertura_portafolio_ajeno,
            commands::portafolio::listar_portafolios_recientes,
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
            commands::perfiles_inactividad_equipo::list_perfiles_inactividad_equipo,
            commands::perfiles_inactividad_equipo::create_perfil_inactividad_equipo,
            commands::perfiles_inactividad_equipo::update_perfil_inactividad_equipo,
            commands::perfiles_inactividad_equipo::delete_perfil_inactividad_equipo,
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
            commands::precios_material::create_precios_material_lote,
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
            commands::salarios_categoria_fasar::create_salarios_categoria_fasar_lote,
            commands::herramientas::list_herramientas,
            commands::herramientas::create_herramienta,
            commands::herramientas::update_herramienta,
            commands::herramientas::delete_herramienta,
            commands::cuadrillas::list_cuadrillas,
            commands::cuadrillas::create_cuadrilla,
            commands::cuadrillas::update_cuadrilla,
            commands::cuadrillas::delete_cuadrilla,
            commands::cuadrillas::importar_cuadrillas_csv,
            commands::cuadrillas::list_cuadrilla_detalles,
            commands::cuadrillas::create_cuadrilla_detalle,
            commands::cuadrillas::update_cuadrilla_detalle,
            commands::cuadrillas::delete_cuadrilla_detalle,
            commands::cuadrillas::move_cuadrilla_detalle,
            commands::cuadrillas::list_cuadrilla_costos,
            commands::cuadrillas::create_cuadrilla_costo_regional,
            commands::cuadrillas::delete_cuadrilla_costo,
            commands::cuadrillas::recalculate_cuadrilla_costo,
            commands::cuadrillas::list_cuadrilla_costo_detalles,
            commands::cuadrillas::update_cuadrilla_costo_detalle,
            commands::equipos_costo_horario::list_equipos_costo_horario,
            commands::equipos_costo_horario::create_equipo_costo_horario,
            commands::equipos_costo_horario::update_equipo_costo_horario,
            commands::equipos_costo_horario::delete_equipo_costo_horario,
            commands::equipos_costo_horario::list_equipo_costo_horario_detalles,
            commands::equipos_costo_horario::create_equipo_costo_horario_detalle,
            commands::equipos_costo_horario::update_equipo_costo_horario_detalle,
            commands::equipos_costo_horario::delete_equipo_costo_horario_detalle,
            commands::equipos_costo_horario::move_equipo_costo_horario_detalle,
            commands::equipos_costo_horario::recalculate_equipo_costo_horario,
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
            47,
            "deben quedar las 47 unidades de data/initial/unidad_medida.csv, sin duplicar"
        );
        let pieza = unidades
            .iter()
            .find(|u| u.simbolo == "pieza")
            .expect("unidad pieza");
        assert!(
            pieza.variantes.split(',').any(|v| v.trim() == "pza"),
            "pieza debe reconocer la variante pza: {}",
            pieza.variantes
        );

        let monedas = obrix_db::entities::moneda::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar monedas");
        assert_eq!(monedas.len(), 2, "deben quedar las 2 monedas de data/initial/moneda.csv, sin duplicar");

        let regiones = obrix_db::entities::region::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar regiones");
        assert_eq!(
            regiones.len(),
            3,
            "deben quedar las 3 regiones de data/initial/region.csv, sin duplicar"
        );

        let proveedores = obrix_db::entities::proveedor::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar proveedores");
        assert_eq!(
            proveedores.len(),
            20,
            "deben quedar los 20 proveedores de data/initial/proveedor.csv, sin duplicar"
        );

        let familias = obrix_db::entities::familia_insumo::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar familias");
        assert_eq!(familias.len(), 237, "21 familias padre + 216 hijas de data/initial/familia_insumo.csv, sin duplicar");
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
        assert!(
            hija.insumos_asociados.as_deref().is_some_and(|s| !s.is_empty()),
            "la hija debe traer insumos_asociados de data/initial/familia_insumo.csv"
        );
        assert!(
            padre.insumos_asociados.is_none(),
            "la familia padre no tiene insumos_asociados propios"
        );
        for nombre in ["Instalaciones de gas", "Jardinería", "Muebles, cocinas y accesorios"] {
            let raiz = familias
                .iter()
                .find(|f| f.nombre == nombre && f.parent_id.is_none())
                .unwrap_or_else(|| panic!("falta familia padre {nombre}"));
            assert!(
                familias.iter().any(|f| f.parent_id.as_deref() == Some(raiz.id.as_str())),
                "{nombre} debe tener hijas"
            );
        }

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
            33,
            "33 categorías de data/initial/categoria_fasar.csv, sin duplicar"
        );

        let insumos_mo = obrix_db::entities::insumo::Entity::find()
            .filter(
                obrix_db::entities::insumo::Column::Tipo
                    .eq(obrix_db::entities::insumo::TipoInsumo::ManoObra),
            )
            .all(portafolio.conexion())
            .await
            .expect("listar insumos de mano de obra");
        assert_eq!(insumos_mo.len(), 33);

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

        let insumos_herramienta = obrix_db::entities::insumo::Entity::find()
            .filter(
                obrix_db::entities::insumo::Column::Tipo
                    .eq(obrix_db::entities::insumo::TipoInsumo::EquipoHerramienta),
            )
            .all(portafolio.conexion())
            .await
            .expect("listar insumos de equipo/herramienta");
        assert_eq!(
            insumos_herramienta.len(),
            2,
            "2 herramientas de data/initial/herramienta.csv, sin duplicar"
        );
        let herramienta_mano = insumos_herramienta
            .iter()
            .find(|i| i.descripcion == "Herramienta de mano")
            .expect("Herramienta de mano");
        assert_eq!(herramienta_mano.clave, "HER-001");
        let herramientas = obrix_db::entities::herramienta::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar herramienta");
        let porcentaje_herramienta_mano = herramientas
            .iter()
            .find(|h| h.insumo_id == herramienta_mano.id)
            .expect("herramienta de Herramienta de mano");
        assert_eq!(porcentaje_herramienta_mano.porcentaje_mano_obra, Some(3));

        let perfiles_inactividad = obrix_db::entities::perfil_inactividad_equipo::Entity::find()
            .all(portafolio.conexion())
            .await
            .expect("listar perfiles de inactividad de equipo");
        assert_eq!(
            perfiles_inactividad.len(),
            3,
            "CFE, GCDMX y CMIC de data/initial/perfil_inactividad_equipo.csv, sin duplicar"
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
