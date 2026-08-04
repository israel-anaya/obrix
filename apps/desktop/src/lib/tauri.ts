import { invoke } from "@tauri-apps/api/core";
import type { Insumo, NuevoInsumo } from "./types";

export function listInsumos(): Promise<Insumo[]> {
  return invoke("list_insumos");
}

export function createInsumo(insumo: NuevoInsumo): Promise<Insumo> {
  return invoke("create_insumo", { insumo });
}
