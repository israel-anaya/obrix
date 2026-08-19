// Default para `npm run dev` (fuera de Docker). En el contenedor, el
// entrypoint de nginx sobreescribe este archivo a partir de
// config.template.js con las variables de entorno reales — ver Dockerfile.
window.__OBRIX_CONFIG__ = {
  authUrl: "http://localhost:9999",
  licensingUrl: "http://localhost:8081",
};
