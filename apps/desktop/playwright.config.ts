import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:1420",
    trace: "off",
    // El grid lee y escribe el portapapeles del sistema (Ctrl+C/V y el menú Edición).
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420/grid-test.html",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
