# Bancos de precios de referencia

Datasets **importables** de precios unitarios de referencia (INDAABIN, CMIC, CFE, PEMEX, SCT, gobiernos estatales), usados como catálogo inicial al armar un proyecto — nunca como dependencia en vivo.

## Convención por fuente

Cada fuente vive en su propia carpeta `data/bancos-precios/<fuente>/` con:

- `SOURCE.md`: origen, fecha de publicación, licencia/restricciones de uso.
- Los datos en sí, **solo si la fuente es confirmadamente de dominio público o datos abiertos de gobierno**.

Para fuentes con licencia restringida (ej. catálogos comerciales de cámaras gremiales), este repo incluye únicamente el **importador/parser** (en `crates/obrix-core/src/import_export/` una vez implementado) — el usuario aporta su propio catálogo con licencia.

Sin datasets todavía: este directorio se poblará conforme se validen fuentes de dominio público.
