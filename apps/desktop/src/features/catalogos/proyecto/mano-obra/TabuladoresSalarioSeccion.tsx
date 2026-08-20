import { CategoriaFasarSeccion } from "@/features/catalogos/proyecto/mano-obra/CategoriaFasarSeccion";
import { MatrizOficioRegionSeccion } from "@/features/catalogos/proyecto/mano-obra/MatrizOficioRegionSeccion";

export type TabuladoresSalarioVista = "grid" | "matriz";

/**
 * Vista de "Tabuladores de Salario" (Mano de Obra → Tabuladores de Salario)
 * — dos formas de trabajar el mismo catálogo de `categoria_fasar` /
 * `salario_categoria_fasar`: "Vista Clásica" (`CategoriaFasarSeccion`,
 * grid de oficios) y "Modo Matriz × región" (`MatrizOficioRegionSeccion`,
 * oficios en filas y regiones en columnas). Mismos comandos de Tauri por
 * debajo.
 *
 * El selector vive en la propia pestaña del editor (ver `App.tsx`,
 * `renderTabExtra` de `EditorTabs`) — este componente solo recibe la vista
 * activa ya resuelta, controlada desde afuera.
 */
export function TabuladoresSalarioSeccion({ vista }: { vista: TabuladoresSalarioVista }) {
  return <div className="h-full">{vista === "grid" ? <CategoriaFasarSeccion /> : <MatrizOficioRegionSeccion />}</div>;
}
