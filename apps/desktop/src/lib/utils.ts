import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Nombre visible de un portafolio: el archivo sin ruta ni extensión `.obx`. */
export function nombreDesdePath(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return base.replace(/\.obx$/i, "") || base;
}
