# Modelo de datos

## Glosario del dominio (para contribuidores nuevos al APU mexicano)

- **Análisis de Precios Unitarios (APU)**: método normado en México (Ley de Obras Públicas y Servicios Relacionados con las Mismas) para calcular el costo de cada partida de una obra.
- **Concepto**: una partida de obra (ej. "Excavación a máquina"), con clave, descripción, unidad y cantidad.
- **Insumo**: un material, un tipo de mano de obra, o equipo/herramienta usado en un concepto.
- **Matriz/análisis**: el desglose de insumos que componen un concepto, cada uno con su rendimiento (cantidad de insumo por unidad de concepto) y precio.
- **Costo directo**: suma de materiales + mano de obra + equipo de la matriz de un concepto.
- **Indirectos**: porcentaje de administración de campo y de oficina central, aplicado sobre el costo directo.
- **Financiamiento**: costo de financiar la obra, aplicado sobre costo directo + indirectos.
- **Utilidad**: margen de la empresa, aplicado sobre costo directo + indirectos + financiamiento.
- **Cargos adicionales**: cargos normativos (ej. 5 al millar), aplicados sobre costo directo + indirectos.
- **Precio unitario**: costo directo + indirectos + financiamiento + utilidad + cargos adicionales.
- **Números generadores**: hoja de cálculo detallada (cantidad × largo × ancho × alto) que sustenta la cantidad de un concepto.

Ver la implementación de esta cascada de cálculo en [`crates/obrix-core/src/calc/presupuesto.rs`](../crates/obrix-core/src/calc/presupuesto.rs).

## Entidades

- **Proyecto**: raíz de un presupuesto. `modo` indica si es `local` (archivo `.db` aislado) o `compartido` (sincronizado, ver [`colaboracion.md`](colaboracion.md)).
- **Insumo**: catálogo de materiales/mano de obra/equipo del proyecto.
- **Concepto**: partida de obra, con jerarquía de capítulos vía `parent_id`.
- **ApuMatrizItem**: relación concepto↔insumo con rendimiento y precio. El precio se puede **congelar** (`congelado = true`) al cerrar un presupuesto, para preservar el costo contractual aunque el catálogo de insumos cambie después.
- **ParametrosIndirectos**: porcentajes de indirectos/financiamiento/utilidad/cargos por proyecto.
- **NumeroGeneradorRenglon**: filas de cuantificación por concepto.
- **BancoPrecios / BancoPreciosItem**: catálogos de referencia importables (INDAABIN, CMIC, CFE, PEMEX, SCT, estatales). Nunca se referencian en vivo — un insumo copia el precio al importarlo, guardando `origen_banco_id` solo para trazabilidad.

El esquema SQL vive en [`crates/obrix-db/migrations/`](../crates/obrix-db/migrations/).
