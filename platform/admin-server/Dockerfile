# Build del frontend (apps/admin-panel) — necesita el repo completo como
# contexto porque el frontend vive fuera de platform/. Ver
# platform/docker-compose.yml: build.context apunta a la raíz del repo
# (context: ..), no a platform/.
FROM node:22-slim AS frontend
WORKDIR /app
COPY apps/admin-panel/package.json apps/admin-panel/package-lock.json* ./
RUN npm install
COPY apps/admin-panel/ ./
RUN npm run build

FROM rust:1-slim AS backend
WORKDIR /app
COPY platform/admin-server/ ./
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=backend /app/target/release/admin-server /usr/local/bin/admin-server
COPY --from=frontend /app/dist /app/static
ENV FRONTEND_DIST=/app/static
EXPOSE 8090
ENTRYPOINT ["admin-server"]
