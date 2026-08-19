// Sesión de usuario contra GoTrue, llamado directamente desde el navegador
// (GoTrue responde con CORS abierto). Espejo del flujo de
// apps/desktop/src-tauri/src/auth.rs, pero persistiendo tokens en
// localStorage en vez de un archivo en disco.

import { authUrl, licensingUrl } from "./config";
import type { AccountInfo } from "./types";

const STORAGE_KEY = "obrix_auth";

interface TokensGuardados {
  access_token: string;
  refresh_token: string;
}

interface GoTrueUser {
  email?: string;
  user_metadata?: { nombre?: string };
}

interface GoTrueSesion {
  access_token: string;
  refresh_token: string;
  user: GoTrueUser;
}

function guardarTokens(sesion: GoTrueSesion) {
  const tokens: TokensGuardados = {
    access_token: sesion.access_token,
    refresh_token: sesion.refresh_token,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

function leerTokens(): TokensGuardados | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokensGuardados;
  } catch {
    return null;
  }
}

function limpiarTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

function cuentaDesdeUsuario(user: GoTrueUser): AccountInfo {
  const correo = user.email ?? "";
  const nombre = user.user_metadata?.nombre || correo.split("@")[0] || correo;
  return { correo, nombre };
}

async function extraerError(respuesta: Response): Promise<string> {
  try {
    const data = await respuesta.json();
    return data.error_description || data.msg || respuesta.statusText;
  } catch {
    return respuesta.statusText || `Error ${respuesta.status}`;
  }
}

// Best-effort: si falla (SMTP caído, red, etc.) no debe bloquear el registro.
async function enviarBienvenidaBestEffort(correo: string, nombre: string) {
  try {
    await fetch(`${licensingUrl()}/notificaciones/bienvenida`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo, nombre }),
    });
  } catch {
    // best-effort
  }
}

export async function iniciarSesion(correo: string, password: string): Promise<AccountInfo> {
  const respuesta = await fetch(`${authUrl()}/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: correo, password }),
  });
  if (!respuesta.ok) throw new Error(await extraerError(respuesta));

  const sesion: GoTrueSesion = await respuesta.json();
  guardarTokens(sesion);
  return cuentaDesdeUsuario(sesion.user);
}

// Con GOTRUE_MAILER_AUTOCONFIRM activo (como en dev) la sesión queda
// iniciada de inmediato; en un entorno con verificación de correo real,
// GoTrue no devuelve tokens todavía y hay que confirmar el correo primero.
export async function registrarCuenta(
  correo: string,
  nombre: string,
  password: string,
): Promise<AccountInfo> {
  const respuesta = await fetch(`${authUrl()}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: correo, password, data: { nombre } }),
  });
  if (!respuesta.ok) throw new Error(await extraerError(respuesta));

  void enviarBienvenidaBestEffort(correo, nombre);

  const sesion: GoTrueSesion = await respuesta.json();
  if (!sesion.access_token) {
    throw new Error("Cuenta creada — confirma tu correo antes de iniciar sesión");
  }
  guardarTokens(sesion);
  return cuentaDesdeUsuario(sesion.user);
}

// Llamado al arrancar la app: si hay tokens guardados, los refresca contra
// GoTrue para validar que la sesión siga viva y traer la identidad al día.
export async function sesionActual(): Promise<AccountInfo | null> {
  const tokens = leerTokens();
  if (!tokens) return null;

  const respuesta = await fetch(`${authUrl()}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  });
  if (!respuesta.ok) {
    limpiarTokens();
    return null;
  }

  const sesion: GoTrueSesion = await respuesta.json();
  guardarTokens(sesion);
  return cuentaDesdeUsuario(sesion.user);
}

export async function cerrarSesion(): Promise<void> {
  const tokens = leerTokens();
  if (tokens) {
    try {
      await fetch(`${authUrl()}/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
    } catch {
      // best-effort
    }
  }
  limpiarTokens();
}
