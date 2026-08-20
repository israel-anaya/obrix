import { useEffect, useState } from "react";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastData {
  id: string;
  description: string;
  variant: ToastVariant;
  /** ms before auto-closing; `null` = doesn't auto-close (errors: stay until the user closes them or the next attempt arrives). */
  duration: number | null;
}

// Only one visible message at a time — same rule as the status bar it
// replaces: a new attempt displaces the previous one, they don't stack up.
const LIMIT = 1;

let toasts: ToastData[] = [];
const listeners = new Set<(toasts: ToastData[]) => void>();

function emit() {
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
  toasts = [{ id, description, variant, duration }, ...toasts].slice(0, LIMIT);
  emit();
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
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
