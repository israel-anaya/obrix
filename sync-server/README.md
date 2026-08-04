# sync-server

Backend autohospedable para el modo compartido de Obrix: Postgres + [PowerSync](https://www.powersync.com/) (Open Edition). Ver [`docs/colaboracion.md`](../docs/colaboracion.md) para el diseño completo.

Este componente corresponde al milestone de colaboración (inmediatamente después del MVP core) y todavía no está implementado. Cuando se implemente, este directorio tendrá un `docker-compose.yml` que levanta Postgres con replicación lógica habilitada y el servicio de PowerSync apuntando a él, listo para que cualquier despacho/equipo lo corra con `docker compose up`.
