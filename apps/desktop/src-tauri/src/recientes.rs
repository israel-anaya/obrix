//! Lista de portafolios abiertos recientemente, para la pantalla de inicio.
//! Vive en `$HOME/.obrix/portafolios_recientes.json` — al lado de `auth.json`,
//! no dentro de ningún `.obx`, porque recorre varios portafolios.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const MAX_RECIENTES: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortafolioReciente {
    pub path: String,
    pub abierto_en: u64,
}

fn recientes_json_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "no se pudo resolver el directorio home".to_string())?;
    Ok(home.join(".obrix").join("portafolios_recientes.json"))
}

fn ahora_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn actualizar_lista(mut lista: Vec<PortafolioReciente>, path: String, abierto_en: u64) -> Vec<PortafolioReciente> {
    lista.retain(|item| item.path != path);
    lista.insert(0, PortafolioReciente { path, abierto_en });
    lista.truncate(MAX_RECIENTES);
    lista
}

fn leer(archivo: &Path) -> Vec<PortafolioReciente> {
    let Ok(contenido) = std::fs::read_to_string(archivo) else {
        return Vec::new();
    };
    serde_json::from_str(&contenido).unwrap_or_default()
}

fn escribir(archivo: &Path, lista: &[PortafolioReciente]) -> Result<(), String> {
    if let Some(dir) = archivo.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let contenido = serde_json::to_string_pretty(lista).map_err(|e| e.to_string())?;
    std::fs::write(archivo, contenido).map_err(|e| e.to_string())
}

pub fn registrar_en(archivo: &Path, path_portafolio: &str) -> Result<Vec<PortafolioReciente>, String> {
    let lista = actualizar_lista(leer(archivo), path_portafolio.to_string(), ahora_millis());
    escribir(archivo, &lista)?;
    Ok(lista)
}

pub fn listar_en(archivo: &Path) -> Vec<PortafolioReciente> {
    leer(archivo)
        .into_iter()
        .filter(|item| Path::new(&item.path).is_file())
        .collect()
}

/// Anota un portafolio como el más reciente. Un fallo al persistir no debe
/// abortar crear/abrir — la lista es auxiliar a la pantalla de inicio.
pub fn registrar(path_portafolio: &str) {
    let Ok(archivo) = recientes_json_path() else {
        return;
    };
    let _ = registrar_en(&archivo, path_portafolio);
}

pub fn listar() -> Result<Vec<PortafolioReciente>, String> {
    Ok(listar_en(&recientes_json_path()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mueve_al_frente_y_deduplica() {
        let lista = vec![
            PortafolioReciente {
                path: "/a.obx".into(),
                abierto_en: 1,
            },
            PortafolioReciente {
                path: "/b.obx".into(),
                abierto_en: 2,
            },
        ];
        let actualizada = actualizar_lista(lista, "/b.obx".into(), 3);
        assert_eq!(
            actualizada,
            vec![
                PortafolioReciente {
                    path: "/b.obx".into(),
                    abierto_en: 3,
                },
                PortafolioReciente {
                    path: "/a.obx".into(),
                    abierto_en: 1,
                },
            ]
        );
    }

    #[test]
    fn recorta_al_maximo() {
        let lista: Vec<PortafolioReciente> = (0..MAX_RECIENTES)
            .map(|i| PortafolioReciente {
                path: format!("/{i}.obx"),
                abierto_en: i as u64,
            })
            .collect();
        let actualizada = actualizar_lista(lista, "/nuevo.obx".into(), 99);
        assert_eq!(actualizada.len(), MAX_RECIENTES);
        assert_eq!(actualizada[0].path, "/nuevo.obx");
        assert!(actualizada.iter().all(|item| item.path != "/9.obx"));
    }

    #[test]
    fn persiste_y_omite_archivos_inexistentes() {
        let dir = std::env::temp_dir().join(format!("obrix-recientes-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let existente = dir.join("vivo.obx");
        std::fs::write(&existente, b"ok").expect("archivo de prueba");
        let archivo = dir.join("portafolios_recientes.json");

        registrar_en(&archivo, existente.to_str().expect("utf-8")).expect("registrar existente");
        registrar_en(&archivo, dir.join("muerto.obx").to_str().expect("utf-8")).expect("registrar inexistente");

        let listados = listar_en(&archivo);
        assert_eq!(listados.len(), 1);
        assert_eq!(listados[0].path, existente.to_str().expect("utf-8"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
