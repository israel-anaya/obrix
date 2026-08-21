import { useEffect, useMemo, useRef, useState } from "react";
import { ordenarPor } from "@/lib/ordenar";

interface ConClaveDescripcion {
  id: string;
  clave: string;
  descripcion: string;
}

/**
 * Selección, búsqueda y navegación con teclado de la franja superior de una
 * vista "Ficha" (maestro-detalle) — compartido por básico auxiliar,
 * cuadrilla y equipo de costo horario. Cada dominio sigue cargando su propia
 * lista (comando Tauri propio); este hook solo administra qué elemento está
 * seleccionado, el filtro de búsqueda y la navegación `←`/`→`.
 */
export function useAnalisisMaestroDetalle<T extends ConClaveDescripcion>({
  items,
  /** Ignora la navegación con flechas mientras algo modal (p. ej. el Sheet de alta/edición) está abierto. */
  bloqueada,
}: {
  items: T[];
  bloqueada: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = ordenarPor(items, (i) => i.clave);
    if (!q) return lista;
    return lista.filter((i) => i.clave.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q));
  }, [items, busqueda]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (bloqueada) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (itemsFiltrados.length === 0) return;
      e.preventDefault();
      const idxActual = itemsFiltrados.findIndex((i) => i.id === seleccionadaId);
      const delta = e.key === "ArrowLeft" ? -1 : 1;
      const idxNuevo = idxActual === -1 ? 0 : Math.min(Math.max(idxActual + delta, 0), itemsFiltrados.length - 1);
      setSeleccionadaId(itemsFiltrados[idxNuevo].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [itemsFiltrados, seleccionadaId, bloqueada]);

  useEffect(() => {
    if (!seleccionadaId) return;
    itemRefs.current.get(seleccionadaId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [seleccionadaId, itemsFiltrados]);

  const seleccionada = items.find((i) => i.id === seleccionadaId) ?? null;

  /** Si nada está seleccionado (primera carga), arranca en `idPorDefecto` — llamar tras recargar la lista. */
  const seleccionarSiVacia = (idPorDefecto: string | null) => {
    setSeleccionadaId((actual) => actual ?? idPorDefecto);
  };

  return {
    busqueda,
    setBusqueda,
    itemsFiltrados,
    seleccionadaId,
    setSeleccionadaId,
    seleccionada,
    itemRefs,
    seleccionarSiVacia,
  };
}
