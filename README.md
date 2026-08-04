# Obrix

Software open source de Análisis de Precios Unitarios (APU) para construcción en México.

El software incumbente en este espacio (Opus, Neodata, TESIS) es de escritorio cerrado, con licenciamiento caro y sin colaboración real. Obrix es **local-first**: cada presupuesto funciona 100% offline por defecto (crítico en obra, donde la conectividad suele ser mala), y opcionalmente se puede activar colaboración en tiempo real sincronizando contra un backend propio autohospedado — sin depender de que todo el equipo esté conectado a internet para trabajar.

## Estado del proyecto

En desarrollo activo, MVP. Ver [el roadmap](#roadmap) abajo.

## Stack

- **Escritorio**: [Tauri 2](https://tauri.app/) (Rust) + React/TypeScript + Tailwind.
- **Motor de cálculo**: crate Rust puro (`obrix-core`), aritmética decimal exacta con `rust_decimal`.
- **Almacenamiento**: SQLite embebido (`sqlx`), con sincronización opcional vía [PowerSync](https://www.powersync.com/) contra un backend Postgres autohospedable.
- Detalle completo de decisiones de arquitectura en [`docs/modelo-datos.md`](docs/modelo-datos.md) y [`docs/colaboracion.md`](docs/colaboracion.md).

## Estructura del repo

```
crates/obrix-core/    Motor de cálculo APU (dominio puro, sin UI)
crates/obrix-db/      Acceso a datos SQLite + migraciones
crates/obrix-ai/      Contratos de IA (fase 2/3, sin implementar aún)
apps/desktop/         App de escritorio (Tauri + React)
sync-server/          Backend de colaboración autohospedable (Postgres + PowerSync)
data/bancos-precios/  Importadores de bancos de precios de referencia
```

## Desarrollo

### Prerrequisitos

- [Rust](https://rustup.rs/) (stable) y un compilador C (`build-essential` en Debian/Ubuntu).
- [Node.js](https://nodejs.org/) 20+ y [pnpm](https://pnpm.io/).
- En Linux, las [dependencias de sistema de Tauri](https://tauri.app/start/prerequisites/#linux) (WebKitGTK, GTK3, dbus). En Debian/Ubuntu:

  ```sh
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf pkg-config
  ```

### Correr el motor de cálculo y la capa de datos

```sh
cargo test --workspace --exclude obrix-desktop
```

### Correr la app de escritorio

```sh
cd apps/desktop
pnpm install
pnpm tauri dev
```

## Roadmap

1. **MVP** — catálogo de insumos, catálogo de conceptos, matriz APU, números generadores, indirectos/financiamiento/utilidad, resumen de presupuesto, exportación a Excel/PDF.
2. **Colaboración** (milestone inmediato post-core) — modo compartido vía PowerSync, el diferenciador central del proyecto.
3. **Generación automática de APU vía IA** — propuesta de matriz de insumos a partir de la descripción de un concepto.
4. **Cuantificación desde planos** — extracción de números generadores desde PDF/imágenes con visión por computadora.

## Licencia

[Apache-2.0](LICENSE).
