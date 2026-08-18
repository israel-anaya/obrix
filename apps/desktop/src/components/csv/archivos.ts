import { open, save } from "@tauri-apps/plugin-dialog";
import { FILTRO_CSV } from "@/lib/csv";
import { escribirArchivoTexto, leerArchivoTexto } from "@/lib/tauri";

export async function elegirArchivoCsv(): Promise<string | null> {
  const path = await open({ filters: FILTRO_CSV, multiple: false });
  if (!path || Array.isArray(path)) return null;
  return path;
}

export async function elegirDestinoCsv(defaultPath: string): Promise<string | null> {
  const path = await save({ filters: FILTRO_CSV, defaultPath });
  return path ?? null;
}

export async function leerCsvElegido(): Promise<{ path: string; contenido: string } | null> {
  const path = await elegirArchivoCsv();
  if (!path) return null;
  const contenido = await leerArchivoTexto(path);
  return { path, contenido };
}

export async function escribirCsvElegido(defaultPath: string, contenido: string): Promise<string | null> {
  const path = await elegirDestinoCsv(defaultPath);
  if (!path) return null;
  await escribirArchivoTexto(path, contenido);
  return path;
}
