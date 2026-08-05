import { Button } from "@/components/Button";

export function SettingsPage({
  theme,
  onToggleTheme,
  sidebarVisible,
  onToggleSidebar,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <div className="flex max-w-lg flex-col gap-6 p-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Apariencia</h2>
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div>
            <p className="text-sm">Tema</p>
            <p className="text-xs text-muted-foreground">Actual: {theme === "dark" ? "Oscuro" : "Claro"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onToggleTheme}>
            Cambiar a {theme === "dark" ? "claro" : "oscuro"}
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div>
            <p className="text-sm">Barra lateral</p>
            <p className="text-xs text-muted-foreground">
              {sidebarVisible ? "Visible" : "Oculta"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onToggleSidebar}>
            {sidebarVisible ? "Ocultar" : "Mostrar"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Acerca de</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Versión</dt>
          <dd className="num">0.1.0</dd>
          <dt className="text-muted-foreground">Licencia</dt>
          <dd>Apache-2.0</dd>
          <dt className="text-muted-foreground">Proyecto activo</dt>
          <dd>Proyecto demo · local</dd>
        </dl>
      </section>
    </div>
  );
}
