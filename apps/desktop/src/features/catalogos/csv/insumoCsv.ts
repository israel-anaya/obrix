import type { FamiliaInsumo, UnidadMedida } from "@/lib/types";

export function mapasUnidad(unidades: UnidadMedida[]) {
  return {
    simboloPorId: Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
    idPorSimbolo: Object.fromEntries(unidades.map((u) => [u.simbolo.toLowerCase(), u.id])),
  };
}

export function mapasFamilia(familias: FamiliaInsumo[]) {
  const raices = familias.filter((f) => f.parent_id === null);
  return {
    nombrePorId: Object.fromEntries(familias.map((f) => [f.id, f.nombre])),
    raizIdPorNombre: Object.fromEntries(raices.map((f) => [f.nombre.toLowerCase(), f.id])),
    hijaId: (padreId: string, nombre: string) =>
      familias.find((f) => f.parent_id === padreId && f.nombre.toLowerCase() === nombre.toLowerCase())?.id ?? null,
  };
}

export function resolverUnidad(
  texto: string,
  idPorSimbolo: Record<string, string>,
): { id: string } | { error: string } {
  const t = texto.trim();
  if (!t) return { error: "unidad vacía" };
  const id = idPorSimbolo[t.toLowerCase()];
  if (!id) return { error: `unidad "${t}" no encontrada` };
  return { id };
}

export function resolverFamilia(
  familiaTexto: string,
  subfamiliaTexto: string,
  mapas: ReturnType<typeof mapasFamilia>,
): { familia_id: string | null; sub_familia_id: string | null; avisos: string[] } {
  const avisos: string[] = [];
  const fam = familiaTexto.trim();
  if (!fam) return { familia_id: null, sub_familia_id: null, avisos };
  const familia_id = mapas.raizIdPorNombre[fam.toLowerCase()] ?? null;
  if (!familia_id) {
    avisos.push(`familia "${fam}" no encontrada`);
    return { familia_id: null, sub_familia_id: null, avisos };
  }
  const sub = subfamiliaTexto.trim();
  if (!sub) return { familia_id, sub_familia_id: null, avisos };
  const sub_familia_id = mapas.hijaId(familia_id, sub);
  if (!sub_familia_id) avisos.push(`subfamilia "${sub}" no encontrada dentro de "${fam}"`);
  return { familia_id, sub_familia_id, avisos };
}
