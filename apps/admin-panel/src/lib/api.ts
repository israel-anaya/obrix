export type Plan = "free" | "profesional" | "enterprise";
export type EstadoSuscripcion = "activa" | "cancelada" | "vencida";

export interface Suscripcion {
  id: string;
  organizacion_id: string;
  plan: Plan;
  estado: EstadoSuscripcion;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  fecha_inicio: string;
  fecha_renovacion: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface GoTrueUsuario {
  id: string;
  email?: string;
  created_at?: string;
  banned_until?: string | null;
}

class ApiError extends Error {
  constructor(public status: number) {
    super(`Solicitud fallida (${status})`);
  }
}

async function solicitud<T>(input: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!respuesta.ok) throw new ApiError(respuesta.status);
  // login/logout responden 200 sin body (solo Set-Cookie) — respuesta.json()
  // sobre un body vacío lanza SyntaxError, así que se parsea a mano.
  const texto = await respuesta.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

export const api = {
  login: (username: string, password: string) =>
    solicitud<void>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => solicitud<void>("/api/logout", { method: "POST" }),
  me: () => solicitud<{ username: string }>("/api/me"),

  listarSuscripciones: () => solicitud<Suscripcion[]>("/api/suscripciones"),
  activarSuscripcion: (organizacion_id: string, plan: Plan) =>
    solicitud<Suscripcion>("/api/suscripciones", {
      method: "POST",
      body: JSON.stringify({ organizacion_id, plan }),
    }),
  cancelarSuscripcion: (organizacionId: string) =>
    solicitud<Suscripcion>(`/api/suscripciones/${organizacionId}/cancelar`, {
      method: "POST",
    }),

  listarUsuarios: () =>
    solicitud<{ users: GoTrueUsuario[] }>("/api/usuarios"),
  banearUsuario: (usuarioId: string) =>
    solicitud<GoTrueUsuario>(`/api/usuarios/${usuarioId}/banear`, {
      method: "POST",
    }),
  desbanearUsuario: (usuarioId: string) =>
    solicitud<GoTrueUsuario>(`/api/usuarios/${usuarioId}/desbanear`, {
      method: "POST",
    }),
};
