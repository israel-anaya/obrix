# Contribuir a Obrix

## Setup

1. Instala Rust vía [rustup](https://rustup.rs/) y un compilador C (`build-essential` en Debian/Ubuntu, o cualquier `cc` en el `PATH`).
2. Instala Node.js 20+ y [pnpm](https://pnpm.io/installation).
3. En Linux, instala las dependencias de sistema de Tauri (ver [README](README.md#prerrequisitos)).
4. Clona el repo y corre:

   ```sh
   cargo build --workspace
   cd apps/desktop && pnpm install
   ```

## Correr las pruebas

```sh
cargo test --workspace --exclude obrix-desktop   # motor de cálculo + capa de datos
cd apps/desktop && pnpm build                    # typecheck + build del frontend
```

## Estructura del código

- `crates/obrix-core`: dominio puro (modelos + motor de cálculo). No debe depender de UI, base de datos ni IO. Todo cambio a las fórmulas de cálculo (costo directo, indirectos, financiamiento, utilidad) va aquí, con una prueba que verifique el resultado a mano.
- `crates/obrix-db`: acceso a datos. Los cambios de esquema van como una nueva migración en `crates/obrix-db/migrations/`, nunca editando una migración ya publicada.
- `apps/desktop`: la UI. Los comandos de Tauri (`apps/desktop/src-tauri/src/commands/`) son la única frontera entre el frontend y `obrix-core`/`obrix-db`.

## Terminología del dominio

Si no conoces el análisis de precios unitarios (APU) mexicano, hay un glosario en [`docs/modelo-datos.md`](docs/modelo-datos.md) con los términos clave (costo directo, indirectos, financiamiento, utilidad, números generadores) antes de tocar el motor de cálculo.

## Pull requests

- Un PR por cambio lógico. Incluye la razón del cambio, no solo el qué.
- Si tocas `obrix-core`, agrega o actualiza una prueba con un ejemplo numérico verificable a mano.
- Si tocas el esquema de `obrix-db`, ten en cuenta que las tablas sincronizables (modo compartido) requieren `id` UUID y `updated_at`/`updated_by` — ver [`docs/colaboracion.md`](docs/colaboracion.md).
