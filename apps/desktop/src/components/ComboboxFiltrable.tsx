import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Combo con filtro por texto — alternativa a `<select>` para catálogos
 * largos (categorías FASAR, herramientas, …) donde escribir la clave o
 * parte de la descripción es más rápido que desplazarse por la lista.
 */
export function ComboboxFiltrable({
  opciones,
  placeholder = "Buscar…",
  onElegir,
  onCancelar,
  className,
}: {
  opciones: { id: string; etiqueta: string }[];
  placeholder?: string;
  onElegir: (id: string) => void;
  onCancelar: () => void;
  className?: string;
}) {
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  // Evita el doble cierre: Escape/clic en una opción ya resuelven el combo,
  // así que el blur que sigue no debe volver a disparar `onCancelar`.
  const resueltoRef = useRef(false);

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter((o) => o.etiqueta.toLowerCase().includes(q));
  }, [opciones, texto]);

  const elegir = (id: string) => {
    resueltoRef.current = true;
    onElegir(id);
  };

  const cancelar = () => {
    resueltoRef.current = true;
    onCancelar();
  };

  return (
    <div className="relative">
      <input
        autoFocus
        value={texto}
        placeholder={placeholder}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
        }}
        onBlur={() => {
          // Da tiempo a que el `onClick` de una opción se registre antes de cerrar.
          setTimeout(() => {
            if (!resueltoRef.current) cancelar();
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancelar();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((i) => Math.min(filtradas.length - 1, i + 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((i) => Math.max(0, i - 1));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const opcion = filtradas[activo];
            if (opcion) elegir(opcion.id);
          }
        }}
        className={cn("w-full rounded border border-border bg-background px-1.5 py-1 text-xs", className)}
      />
      <ul className="absolute z-20 mt-0.5 max-h-48 w-full overflow-auto rounded border border-neutral-300 bg-white text-xs text-neutral-900 shadow-md">
        {filtradas.length === 0 ? (
          <li className="px-2 py-1 text-neutral-500">Sin resultados</li>
        ) : (
          filtradas.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(o.id)}
                onMouseEnter={() => setActivo(i)}
                className={cn("flex w-full px-2 py-1 text-left hover:bg-neutral-100", i === activo && "bg-neutral-200")}
              >
                {o.etiqueta}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
