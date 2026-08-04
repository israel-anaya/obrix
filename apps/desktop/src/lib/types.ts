export type TipoInsumo = "material" | "mano_obra" | "equipo_herramienta";

export interface Insumo {
  id: string;
  clave: string;
  tipo: TipoInsumo;
  descripcion: string;
  unidad: string;
  precio_base: string;
}

export interface NuevoInsumo {
  clave: string;
  tipo: TipoInsumo;
  descripcion: string;
  unidad: string;
  precio_base: string;
}
