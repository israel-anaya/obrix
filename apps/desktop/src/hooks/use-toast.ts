import { useEffect, useState } from "react";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastData {
  id: string;
  description: string;
  variant: ToastVariant;
  /** ms antes de autocerrarse; `null` = no se autocierra (errores: quedan hasta que el usuario los cierre o llegue el siguiente intento). */
  duration: number | null;
}

// Solo un mensaje visible a la vez — mismo criterio que la barra de estado
// que reemplaza: un intento nuevo desplaza al anterior, no se amontonan.
const LIMITE = 1;

let toasts: ToastData[] = [];
const listeners = new Set<(toasts: ToastData[]) => void>();

function emitir() {
  listeners.forEach((l) => l(toasts));
}

export function toast({
  description,
  variant = "default",
  duration = variant === "destructive" ? null : 3000,
}: {
  description: string;
  variant?: ToastVariant;
  duration?: number | null;
}) {
  const id = crypto.randomUUID();
  toasts = [{ id, description, variant, duration }, ...toasts].slice(0, LIMITE);
  emitir();
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emitir();
}

export function useToasts() {
  const [state, setState] = useState(toasts);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
