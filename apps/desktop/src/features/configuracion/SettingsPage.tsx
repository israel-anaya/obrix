import { useState } from "react";
import { Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CatalogoGeneralSeccion } from "@/features/configuracion/CatalogoGeneralSeccion";
import { CATALOGOS_GENERALES } from "@/features/configuracion/catalogosGenerales";
import { ConfiguracionSidebar } from "@/features/configuracion/ConfiguracionSidebar";
import { FamiliasInsumoSeccion } from "@/features/configuracion/FamiliasInsumoSeccion";
import { OrganizacionSeccion } from "@/features/configuracion/OrganizacionSeccion";
import { UsuariosSeccion } from "@/features/configuracion/UsuariosSeccion";

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
      <Server size={28} className="text-muted-foreground" />
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
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
}) {
  const [seccionActiva, setSeccionActiva] = useState("apariencia");

  const catalogo = CATALOGOS_GENERALES.find((d) => d.id === seccionActiva);

  const renderContenido = () => {
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
    if (seccionActiva === "familias-insumo") return <FamiliasInsumoSeccion />;
    if (seccionActiva === "organizaciones") return <OrganizacionSeccion />;
    if (seccionActiva === "usuarios") return <UsuariosSeccion />;
    if (catalogo) return <CatalogoGeneralSeccion key={catalogo.id} descriptor={catalogo} />;
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
