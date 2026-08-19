# Landing estática: sin backend propio, solo build + nginx sirviendo /dist.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-entrypoint.d/40-obrix-config.sh /docker-entrypoint.d/40-obrix-config.sh
RUN chmod +x /docker-entrypoint.d/40-obrix-config.sh
EXPOSE 80
