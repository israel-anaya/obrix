import { EstanteriaMaterialesSeccion } from "@/features/catalogos/EstanteriaMaterialesSeccion";
import { MaterialesSeccion } from "@/features/catalogos/MaterialesSeccion";

export type MaterialesVista = "grid" | "estanteria";

/**
 * Vista de "Materiales" (Materiales → Materiales) — dos formas de trabajar
 * el mismo catálogo de `material`: "Modo Estantería" (`EstanteriaMaterialesSeccion`,
 * pasillos por familia/subfamilia con tarjetas) y "Vista Clásica"
 * (`MaterialesSeccion`, edición de celdas al estilo del resto de los
 * catálogos). Mismos comandos de Tauri por debajo.
 *
 * El selector vive en la propia pestaña del editor (ver `App.tsx`,
 * `renderTabExtra` de `EditorTabs`) — este componente solo recibe la vista
 * activa ya resuelta, controlada desde afuera.
 */
export function MaterialesCatalogoSeccion({
  vista,
}: {
  vista: MaterialesVista;
}) {
  return (
    <div className="h-full">
      {vista === "estanteria" ? <EstanteriaMaterialesSeccion /> : <MaterialesSeccion />}
    </div>
  );
}
