import { invoke } from "@tauri-apps/api/core";
import type { Concepto, Insumo, NuevoConcepto, NuevoInsumo } from "./types";

export function listInsumos(): Promise<Insumo[]> {
  return invoke("list_insumos");
}

export function createInsumo(insumo: NuevoInsumo): Promise<Insumo> {
  return invoke("create_insumo", { insumo });
}

export function listConceptos(): Promise<Concepto[]> {
  return invoke("list_conceptos");
}

export function createConcepto(concepto: NuevoConcepto): Promise<Concepto> {
  return invoke("create_concepto", { concepto });
}
