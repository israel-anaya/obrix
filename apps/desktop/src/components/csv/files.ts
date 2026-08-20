import { open, save } from "@tauri-apps/plugin-dialog";
import { FILTRO_CSV } from "@/lib/csv";
import { escribirArchivoTexto, leerArchivoTexto } from "@/lib/tauri";

export async function pickCsvFile(): Promise<string | null> {
  const path = await open({ filters: FILTRO_CSV, multiple: false });
  if (!path || Array.isArray(path)) return null;
  return path;
}

export async function pickCsvDestination(defaultPath: string): Promise<string | null> {
  const path = await save({ filters: FILTRO_CSV, defaultPath });
  return path ?? null;
}

export async function readChosenCsv(): Promise<{ path: string; content: string } | null> {
  const path = await pickCsvFile();
  if (!path) return null;
  const content = await leerArchivoTexto(path);
  return { path, content };
}

export async function writeChosenCsv(defaultPath: string, content: string): Promise<string | null> {
  const path = await pickCsvDestination(defaultPath);
  if (!path) return null;
  await escribirArchivoTexto(path, content);
  return path;
}
