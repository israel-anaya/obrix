# licensing-server

Control plane de suscripciones (free / profesional / enterprise). Sabe qué
plan tiene cada **cuenta** (identificada por su correo de GoTrue) y qué
capacidades le desbloquea ese plan — nada más. La suscripción es por cuenta
individual, no por la `organizacion` de negocio del desktop: esa es un
concepto distinto (solo sirve para segmentar datos dentro de un portafolio,
ej. separar insumos de un concurso CFE de otro SICT aunque sea la misma
empresa) y este servicio no la conoce ni la referencia.

La colaboración multi-cuenta bajo un mismo plan Enterprise es un concepto
aparte ("organización" en el sentido de equipo/workspace compartido) —
todavía sin diseñar ni construir.

Vive en una base Postgres propia (`obrix_licensing`), separada de la base
de negocio que eventualmente use `sync-server`. Razón: `licensing-server`
tiene que existir para **todos** los clientes, incluidos los que operan
100% local-first en SQLite y nunca tocan Postgres de negocio; y para
clientes enterprise on-prem, ni siquiera hay acceso a su Postgres de
`sync-server` (vive en su red).

## Tablas

- `suscripcion` — una fila por `correo` con su plan y estado. Una cuenta sin
  fila aquí se trata como `free` implícito (ver `obtener_entitlements`) —
  por eso una cuenta recién registrada en GoTrue ya queda en plan Free sin
  necesidad de sembrar nada al momento del alta.
- `plan_capacidad` — catálogo de qué desbloquea cada plan (`organizaciones`,
  `proyectos`, `multi_usuario`), con `limite` (`NULL` = ilimitado) y
  `habilitado` para feature flags puros. Ajustar límites es editar la
  semilla de la migración, no tocar código de negocio. Pendiente de revisar:
  esta semilla se escribió antes de aclarar que "organización" es un
  concepto de negocio local, no de licenciamiento — sus límites actuales
  (`organizaciones: 1` en free, `3` en profesional) no tienen todavía un
  significado bien definido y hay que repensarlos junto con el diseño de
  colaboración Enterprise.

## Endpoints

- `GET /cuentas/:correo/entitlements` — plan activo + capacidades
  habilitadas. El desktop lo llama tras login y cachea la respuesta para
  poder operar offline un tiempo de gracia.
- `GET /admin/suscripciones` — lista todas las suscripciones (consumido por
  `admin-server`, no pensado para el desktop).
- `POST /admin/suscripciones` — mockup del webhook `checkout.session.completed`
  de Stripe. Body: `{ "correo": "...", "plan": "profesional" }`.
- `POST /admin/suscripciones/:correo/cancelar` — mockup del webhook
  `customer.subscription.deleted`.

## Stripe — todavía no implementado

`suscripcion` ya trae `stripe_customer_id`/`stripe_subscription_id`
nullable para cuando se conecte Stripe de verdad, pero por ahora el ciclo
de vida de una suscripción se simula a mano con los endpoints `/admin/*`
de arriba. Nada en este servicio llama a la API de Stripe todavía.

## Correr en local

Ver `platform/docker-compose.yml` — levanta Postgres, este servicio,
GoTrue (identidad), Mailhog (correos de dev) y `admin-server` (panel de
administración en `http://localhost:8090`) juntos.

```
cd platform
docker compose up
curl http://localhost:8081/health
```

## Pendiente

- Validar el JWT de GoTrue en `/cuentas/:correo/entitlements` (hoy no valida
  nada, ni siquiera confirma que `correo` sea el mismo correo del token —
  es parte del mismo mockup que Stripe, falta cablear el login real en el
  desktop primero).
- Licencia offline firmada para `sync-server` on-prem (clientes air-gapped,
  ej. gobierno) — pendiente de diseño.
