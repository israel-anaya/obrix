#!/bin/sh
# Genera config.js a partir de config.template.js con las URLs reales del
# entorno (OBRIX_AUTH_URL/OBRIX_LICENSING_URL) — así la misma imagen sirve
# para dev y para producción sin rebuild. Corre automáticamente: la imagen
# base de nginx ejecuta todo *.sh en /docker-entrypoint.d/ antes de arrancar.
set -eu
envsubst '${OBRIX_AUTH_URL} ${OBRIX_LICENSING_URL}' \
  < /usr/share/nginx/html/config.template.js \
  > /usr/share/nginx/html/config.js
