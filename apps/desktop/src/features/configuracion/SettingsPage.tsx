import { useState, type ReactNode } from "react";
import { LogOut, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ConfiguracionSidebar } from "@/features/configuracion/ConfiguracionSidebar";
import type { AccountInfo } from "@/lib/types";

function FilaAjuste({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="truncate text-xs text-muted-foreground">{descripcion}</p>
      </div>
      {accion}
    </div>
  );
}

function GeneralSeccion({
  cuenta,
  onCerrarSesion,
}: {
  cuenta: AccountInfo | null;
  onCerrarSesion: () => void;
}) {
  return (
    <div className="flex max-w-lg flex-col gap-6 p-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">General</h2>
        <div className="flex flex-col gap-2">
          <FilaAjuste
            titulo="Cuenta"
            descripcion={
              cuenta ? `${cuenta.nombre} · ${cuenta.correo}` : "No hay una sesión activa."
            }
          />
          <FilaAjuste
            titulo="Cerrar sesión"
            descripcion="Sale de tu cuenta en este dispositivo."
            accion={
              <Button variant="outline" size="sm" onClick={onCerrarSesion} disabled={!cuenta}>
                Cerrar sesión
                <LogOut data-icon="inline-end" />
              </Button>
            }
          />
        </div>
      </section>
    </div>
  );
}

function AparienciaSeccion({
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
            <p className="text-xs text-muted-foreground">{sidebarVisible ? "Visible" : "Oculta"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onToggleSidebar}>
            {sidebarVisible ? "Ocultar" : "Mostrar"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function AcercaDeSeccion() {
  return (
    <div className="flex max-w-lg flex-col gap-6 p-4">
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

function ServidorSeccion() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Server size={16} className="text-muted-foreground" />
      <div className="max-w-sm">
        <h2 className="text-sm font-semibold">Conectarse a servidor</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          La colaboración vía servidor (Postgres u otro backend) todavía no está implementada — es un punto de
          extensión pensado para resolverse mediante plugins. Por ahora, cada portafolio es un archivo SQLite
          local.
        </p>
      </div>
    </div>
  );
}

export function SettingsPage({
  theme,
  onToggleTheme,
  sidebarVisible,
  onToggleSidebar,
  cuenta,
  onCerrarSesion,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  cuenta: AccountInfo | null;
  onCerrarSesion: () => void;
}) {
  const [seccionActiva, setSeccionActiva] = useState("general");

  const renderContenido = () => {
    if (seccionActiva === "general") {
      return <GeneralSeccion cuenta={cuenta} onCerrarSesion={onCerrarSesion} />;
    }
    if (seccionActiva === "apariencia") {
      return (
        <AparienciaSeccion
          theme={theme}
          onToggleTheme={onToggleTheme}
          sidebarVisible={sidebarVisible}
          onToggleSidebar={onToggleSidebar}
        />
      );
    }
    if (seccionActiva === "acerca-de") return <AcercaDeSeccion />;
    if (seccionActiva === "servidor") return <ServidorSeccion />;
    return null;
  };

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="20" minSize="14" maxSize="35" className="flex flex-col bg-muted/40">
        <ConfiguracionSidebar activa={seccionActiva} onSelect={setSeccionActiva} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel className="flex flex-col overflow-hidden">{renderContenido()}</ResizablePanel>
    </ResizablePanelGroup>
  );
}
