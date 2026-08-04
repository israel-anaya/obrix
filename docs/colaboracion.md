# Colaboración (modo compartido)

Obrix es local-first por defecto: cada proyecto es un archivo SQLite aislado que funciona 100% offline. La colaboración es **opt-in por proyecto**, no un requisito.

## Por qué

Investigación de mercado (ver contexto en el plan original del proyecto) mostró que ya existe software de precios unitarios "100% en la nube" en México (Prisma Master), pero eso implica depender de estar siempre conectado. Ningún competidor combina **offline real en campo** con **colaboración en tiempo real cuando hay señal** — ese es el hueco que Obrix busca cubrir.

## Cómo funciona

- Cada proyecto tiene `modo = 'local' | 'compartido'` (ver [`modelo-datos.md`](modelo-datos.md)).
- En modo compartido, la réplica SQLite del cliente se sincroniza vía [PowerSync](https://www.powersync.com/) contra un backend Postgres, usando el [SDK de Tauri de PowerSync](https://docs.powersync.com/client-sdks/reference/tauri) (`tauri-plugin-powersync`).
- El backend (`sync-server/`) es autohospedable vía Docker — ningún equipo depende de un servicio de terceros para colaborar.
- Resolución de conflictos: PowerSync es server-authoritative con checkpoints (último write consistente gana a nivel de fila). Es suficiente para este dominio porque los usuarios normalmente editan conceptos/insumos distintos en paralelo, no la misma celda simultáneamente.
- Todas las tablas sincronizables usan `id` UUID (no autoincremental) y `updated_at`/`updated_by`, para evitar colisiones entre réplicas.

## Estado actual

El SDK de Tauri de PowerSync está en **alpha** (protocolo sujeto a cambios). La integración de sincronización es el milestone inmediato después de que el CRUD local del MVP esté probado — no bloquea el desarrollo del core, pero es la prioridad #1 antes que cualquier feature de IA. Ver el roadmap en el [README](../README.md#roadmap).
