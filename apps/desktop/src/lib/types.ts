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

export interface Concepto {
  id: string;
  clave: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  parent_id: string | null;
}

export interface NuevoConcepto {
  clave: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  parent_id: string | null;
}
