declare global {
  interface Window {
    __OBRIX_CONFIG__?: { authUrl?: string; licensingUrl?: string };
  }
}

export function authUrl(): string {
  return window.__OBRIX_CONFIG__?.authUrl || "http://localhost:9999";
}

export function licensingUrl(): string {
  return window.__OBRIX_CONFIG__?.licensingUrl || "http://localhost:8081";
}
