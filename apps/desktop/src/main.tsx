import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

document.addEventListener("contextmenu", (e) => e.preventDefault());

// `dragDropEnabled: false` (tauri.conf.json) le devuelve el drag & drop al
// webview — sin eso el reordenamiento HTML5 de las fichas no funciona en
// Windows. A cambio vuelve el default del navegador: soltar un archivo sobre
// la ventana la navega a ese archivo. Como la app no tiene zonas de soltar
// archivos, se ignoran.
const ignorarArchivosSoltados = (e: globalThis.DragEvent) => {
  if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
};
window.addEventListener("dragover", ignorarArchivosSoltados);
window.addEventListener("drop", ignorarArchivosSoltados);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
