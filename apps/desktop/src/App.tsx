import { useState } from "react";
import { BookOpen, FolderKanban } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorTabs, type EditorTabInfo } from "@/components/EditorTabs";
import { MenuBar, type MenuDef } from "@/components/MenuBar";
import { PlaceholderTab } from "@/components/PlaceholderTab";
import { StatusBar } from "@/components/StatusBar";
import { Toolbar, type ToolbarItem } from "@/components/Toolbar";
import { CatalogosSidebar } from "@/features/catalogos/CatalogosSidebar";
import { SettingsPage } from "@/features/configuracion/SettingsPage";
import { ProyectosSidebar } from "@/features/proyectos/ProyectosSidebar";
import type { Proyecto } from "@/features/proyectos/types";
import { useTheme } from "@/hooks/useTheme";

type SeccionId = "proyectos" | "catalogos";

const SECCIONES: ToolbarItem<SeccionId>[] = [
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "catalogos", label: "Catálogos", icon: BookOpen },
];

const HOJA_PREFIX = "proyecto:hoja:";
const PROGRAMA_PREFIX = "proyecto:programa:";
const CATALOGO_PREFIX = "catalogo:";

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();

  const [seccion, setSeccion] = useState<SeccionId>("proyectos");
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<string | null>(null);
  const [proyectosExpandidos, setProyectosExpandidos] = useState<Set<string>>(new Set());
  const [catalogosExpandidos, setCatalogosExpandidos] = useState<Set<string>>(new Set());

  const [tabs, setTabs] = useState<EditorTabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState("");

  const openTab = (tab: EditorTabInfo) => {
    setTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].id : "");
      }
      return next;
    });
  };

  const agregarProyecto = () => {
    const nombre = `Proyecto ${proyectos.length + 1}`;
    const id = crypto.randomUUID();
    setProyectos((prev) => [...prev, { id, nombre }]);
    setProyectoSeleccionado(id);
    setProyectosExpandidos((prev) => new Set(prev).add(id));
  };

  const eliminarProyectoSeleccionado = () => {
    if (!proyectoSeleccionado) return;
    setProyectos((prev) => prev.filter((p) => p.id !== proyectoSeleccionado));
    setTabs((prev) =>
      prev.filter(
        (t) =>
          !(t.id === `${HOJA_PREFIX}${proyectoSeleccionado}` || t.id === `${PROGRAMA_PREFIX}${proyectoSeleccionado}`),
      ),
    );
    setProyectoSeleccionado(null);
  };

  const toggleProyectoExpandido = (id: string) => {
    setProyectosExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCatalogoExpandido = (grupo: string) => {
    setCatalogosExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(grupo)) next.delete(grupo);
      else next.add(grupo);
      return next;
    });
  };

  const openHojaTab = (proyectoId: string) => {
    const proyecto = proyectos.find((p) => p.id === proyectoId);
    openTab({
      id: `${HOJA_PREFIX}${proyectoId}`,
      title: `${proyecto?.nombre ?? "Proyecto"} · Hoja de presupuesto`,
      closable: true,
    });
  };

  const openProgramaTab = (proyectoId: string) => {
    const proyecto = proyectos.find((p) => p.id === proyectoId);
    openTab({
      id: `${PROGRAMA_PREFIX}${proyectoId}`,
      title: `${proyecto?.nombre ?? "Proyecto"} · Programa de Obra`,
      closable: true,
    });
  };

  const openCatalogoTab = (grupo: string) => {
    openTab({ id: `${CATALOGO_PREFIX}${grupo}`, title: grupo, closable: true });
  };

  const openSettingsTab = () => {
    openTab({ id: "settings", title: "Configuración", closable: true });
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const renderTabContent = () => {
    if (!activeTab) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          Selecciona o agrega un proyecto para comenzar.
        </div>
      );
    }
    if (activeTab.id === "settings") {
      return (
        <SettingsPage
          theme={theme}
          onToggleTheme={toggleTheme}
          sidebarVisible={sidebarVisible}
          onToggleSidebar={() => setSidebarVisible((v) => !v)}
        />
      );
    }
    if (activeTab.id.startsWith(HOJA_PREFIX)) {
      return <PlaceholderTab title={activeTab.title} subtitle="Aquí vivirá la hoja de presupuesto (catálogo de conceptos, matriz APU, resumen)." />;
    }
    if (activeTab.id.startsWith(PROGRAMA_PREFIX)) {
      return <PlaceholderTab title={activeTab.title} subtitle="Aquí vivirá el programa de obra (calendario/Gantt)." />;
    }
    if (activeTab.id.startsWith(CATALOGO_PREFIX)) {
      return <PlaceholderTab title={activeTab.title} />;
    }
    return null;
  };

  const renderSidebar = () => {
    if (seccion === "proyectos") {
      return (
        <ProyectosSidebar
          proyectos={proyectos}
          seleccionado={proyectoSeleccionado}
          expandidos={proyectosExpandidos}
          onSelect={setProyectoSeleccionado}
          onToggleExpand={toggleProyectoExpandido}
          onAgregar={agregarProyecto}
          onEliminar={eliminarProyectoSeleccionado}
          onOpenHoja={openHojaTab}
          onOpenPrograma={openProgramaTab}
        />
      );
    }
    return <CatalogosSidebar expandidos={catalogosExpandidos} onToggle={(g) => { toggleCatalogoExpandido(g); openCatalogoTab(g); }} />;
  };

  const menus: MenuDef[] = [
    {
      id: "file",
      label: "File",
      actions: [
        { label: "Nuevo proyecto", onClick: agregarProyecto },
        "separator",
        { label: "Salir", onClick: () => getCurrentWindow().close() },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      actions: [
        { label: "Deshacer", shortcut: "Ctrl+Z", disabled: true },
        { label: "Rehacer", shortcut: "Ctrl+Shift+Z", disabled: true },
        "separator",
        { label: "Cortar", shortcut: "Ctrl+X", disabled: true },
        { label: "Copiar", shortcut: "Ctrl+C", disabled: true },
        { label: "Pegar", shortcut: "Ctrl+V", disabled: true },
      ],
    },
    {
      id: "selection",
      label: "Selection",
      actions: [
        { label: "Seleccionar todo", shortcut: "Ctrl+A", disabled: true },
        { label: "Expandir selección", disabled: true },
      ],
    },
    {
      id: "view",
      label: "View",
      actions: [
        {
          label: sidebarVisible ? "Ocultar barra lateral" : "Mostrar barra lateral",
          onClick: () => setSidebarVisible((v) => !v),
        },
        {
          label: theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro",
          onClick: toggleTheme,
        },
      ],
    },
    {
      id: "help",
      label: "Ayuda",
      actions: [
        {
          label: "Acerca de Obrix",
          onClick: () =>
            alert("Obrix 0.1.0\nSoftware open source de precios unitarios para México.\nLicencia Apache-2.0."),
        },
      ],
    },
  ];

  return (
    <div className="flex h-screen flex-col">
      <MenuBar menus={menus} onOpenSettings={openSettingsTab} />
      <Toolbar items={SECCIONES} active={seccion} onSelect={setSeccion} />
      <div className="flex flex-1 overflow-hidden">
        {sidebarVisible && (
          <aside className="w-56 shrink-0 overflow-auto border-r border-border bg-muted/40">
            {renderSidebar()}
          </aside>
        )}
        <div className="flex flex-1 flex-col overflow-hidden">
          <EditorTabs tabs={tabs} activeId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />
          <main className="flex-1 overflow-auto">{renderTabContent()}</main>
        </div>
      </div>
      <StatusBar proyecto="Boceto de interfaz · sin datos" conteo={`${proyectos.length} proyectos`} />
    </div>
  );
}
