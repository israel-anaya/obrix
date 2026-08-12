/// Lectura/escritura de archivos de texto planos en disco — usado para
/// exportar/importar configuraciones como JSON portable (ver FRS), sin
/// depender del plugin `fs` (evita pedir permisos extra al frontend: la
/// ruta ya la elige el usuario vía el diálogo nativo antes de invocar
/// estos comandos).
#[tauri::command]
pub fn escribir_archivo_texto(path: String, contenido: String) -> Result<(), String> {
    std::fs::write(path, contenido).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn leer_archivo_texto(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}
