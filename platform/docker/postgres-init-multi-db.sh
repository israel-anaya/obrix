#!/bin/bash
# Crea bases de datos adicionales al arrancar el contenedor de postgres.
# Postgres solo crea la de POSTGRES_DB por default; GoTrue necesita la suya
# aparte (obrix_auth), separada de la de licensing-server (obrix_licensing).
set -e

# Las migraciones de GoTrue asumen la convención de Supabase de un rol
# `postgres` cluster-wide (les hace GRANT ... TO postgres) — nuestro
# usuario admin real es $POSTGRES_USER (obrix), así que el rol solo tiene
# que existir, no necesita login ni privilegios propios.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
      CREATE ROLE postgres;
    END IF;
  END
  \$\$;
EOSQL

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
  for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
    echo "Creando base de datos adicional: $db"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
      CREATE DATABASE "$db";
EOSQL
  done
fi

# GoTrue no crea su propio schema — sus migraciones asumen que `auth` ya
# existe dentro de obrix_auth (mismo requisito que el setup oficial de
# Supabase, que trae este mismo CREATE SCHEMA en su init sql).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "obrix_auth" <<-EOSQL
  CREATE SCHEMA IF NOT EXISTS auth;
EOSQL
