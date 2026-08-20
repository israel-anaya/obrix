import type { FamiliaInsumo, UnidadMedida } from "@/lib/types";

export function mapasUnidad(unidades: UnidadMedida[]) {
  return {
    simboloPorId: Object.fromEntries(unidades.map((u) => [u.id, u.simbolo])),
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
