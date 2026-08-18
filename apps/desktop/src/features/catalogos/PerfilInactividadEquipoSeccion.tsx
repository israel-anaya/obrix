import { MatrizPerfilInactividadSeccion } from "@/features/catalogos/MatrizPerfilInactividadSeccion";
import { PerfilInactividadEquipoGridVista } from "@/features/catalogos/PerfilInactividadEquipoGridVista";

export type PerfilInactividadVista = "grid" | "matriz";

/**
 * Vista de "Inactividad de equipo" (Maquinaria y Equipo → Inactividad de
 * equipo) — dos formas de trabajar el mismo catálogo de
 * `perfil_inactividad_equipo`: "Vista Clásica" (`PerfilInactividadEquipoGridVista`,
 * un perfil por renglón) y "Modo Matriz" (`MatrizPerfilInactividadSeccion`,
 * rubros en filas y perfiles en columnas). Mismos comandos de Tauri por
 * debajo.
 *
 * El selector vive en la propia pestaña del editor (ver `App.tsx`,
 * `renderTabExtra` de `EditorTabs`) — este componente solo recibe la vista
 * activa ya resuelta, controlada desde afuera.
 */
export function PerfilInactividadEquipoSeccion({ vista }: { vista: PerfilInactividadVista }) {
  return (
    <div className="h-full">{vista === "grid" ? <PerfilInactividadEquipoGridVista /> : <MatrizPerfilInactividadSeccion />}</div>
  );
}
