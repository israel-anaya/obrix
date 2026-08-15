import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";

type DireccionResize =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

const BORDES: { dir: DireccionResize; className: string }[] = [
  { dir: "North", className: "top-0 right-2 left-2 h-1.5 cursor-n-resize" },
  { dir: "South", className: "bottom-0 right-2 left-2 h-1.5 cursor-s-resize" },
  { dir: "West", className: "top-2 bottom-2 left-0 w-1.5 cursor-w-resize" },
  { dir: "East", className: "top-2 bottom-2 right-0 w-1.5 cursor-e-resize" },
  { dir: "NorthWest", className: "top-0 left-0 h-2 w-2 cursor-nwse-resize" },
  { dir: "NorthEast", className: "top-0 right-0 h-2 w-2 cursor-nesw-resize" },
  { dir: "SouthWest", className: "bottom-0 left-0 h-2 w-2 cursor-nesw-resize" },
  { dir: "SouthEast", className: "bottom-0 right-0 h-2 w-2 cursor-nwse-resize" },
];

const win = getCurrentWindow();

/**
 * Marco de 1px y asas de redimensionado para la ventana sin decoraciones
 * nativas. Con la ventana maximizada el marco se oculta para no dejar un
 * hueco contra el borde de la pantalla.
 */
export function WindowFrame({ children }: { children: ReactNode }) {
  const [maximizada, setMaximizada] = useState(false);

  useEffect(() => {
    let activo = true;
    void win.isMaximized().then((v) => {
      if (activo) setMaximizada(v);
    });
    const unlisten = win.onResized(() => {
      void win.isMaximized().then((v) => {
        if (activo) setMaximizada(v);
      });
    });
    return () => {
      activo = false;
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-background",
        !maximizada && "border border-foreground/20",
      )}
    >
      {children}
      {!maximizada &&
        BORDES.map(({ dir, className }) => (
          <div
            key={dir}
            className={cn("absolute z-50", className)}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              void win.startResizeDragging(dir);
            }}
          />
        ))}
    </div>
  );
}
