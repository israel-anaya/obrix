import { useEffect, useRef, useState } from "react";
import { BookOpen, FolderKanban, Plus, Trash2 } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BarraAcciones } from "@/components/BarraAcciones";
import { EditorTabs, type EditorTabInfo } from "@/components/EditorTabs";
import { LoginGate } from "@/components/LoginGate";
import { MenuBar, type MenuDef } from "@/components/MenuBar";
import { PlaceholderTab } from "@/components/PlaceholderTab";
import { StartScreen } from "@/components/StartScreen";
import { StatusBar } from "@/components/StatusBar";
import { Toolbar, type ToolbarItem } from "@/components/Toolbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CatalogoGrid, type CatalogoGridHandle } from "@/features/catalogos/CatalogoGrid";
import { CatalogosSidebar } from "@/features/catalogos/CatalogosSidebar";
import { CATALOGO_GRID_CONFIG } from "@/features/catalogos/costosDirectosTree";
import { MaterialesSeccion } from "@/features/catalogos/MaterialesSeccion";
import { ProveedoresSeccion } from "@/features/catalogos/ProveedoresSeccion";
import { SettingsPage } from "@/features/configuracion/SettingsPage";
import { ArbolDemo } from "@/features/demo/ArbolDemo";
import { MaestroDetalleDemo } from "@/features/demo/MaestroDetalleDemo";
import { TableDemo } from "@/features/demo/TableDemo";
import { HojaCalculoPage } from "@/features/hoja-calculo/HojaCalculoPage";
import { CalcularFsrPage } from "@/features/fsr/CalcularFsrPage";
import { FactorSalarioRealSeccion } from "@/features/fsr/FactorSalarioRealSeccion";
import { ModeloCalculoPage } from "@/features/fsr/ModeloCalculoPage";
import { OrganizacionContext } from "@/features/organizacion/OrganizacionContext";
import { OrganizacionSwitcher } from "@/features/organizacion/OrganizacionSwitcher";
import { ProyectosSidebar } from "@/features/proyectos/ProyectosSidebar";
import type { Proyecto } from "@/features/proyectos/types";
import { useTheme } from "@/hooks/useTheme";
import type { AccountInfo, Organizacion } from "@/lib/types";
import {
  abrirPortafolio,
  confirmarAperturaPortafolioAjeno,
  crearPortafolio,
  iniciarSesion,
  listOrganizacionesActivas,
  obtenerOrganizacionActiva,
  obtenerSesion,
  setOrganizacionActiva,
} from "@/lib/tauri";

const FILTROS_PORTAFOLIO = [{ name: "Portafolio Obrix", extensions: ["obx"] }];

type SeccionId = "proyectos" | "catalogos";

const SECCIONES: ToolbarItem<SeccionId>[] = [
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "catalogos", label: "Catálogos", icon: BookOpen },
];

const HOJA_PREFIX = "proyecto:hoja:";
const PROGRAMA_PREFIX = "proyecto:programa:";
const CATALOGO_PREFIX = "catalogo:";
const FSR_PREFIX = "fsr:";
const MODELO_CALCULO_PREFIX = "modelo-calculo:";

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();

  const [seccion, setSeccion] = useState<SeccionId>("proyectos");
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const [cuenta, setCuenta] = useState<AccountInfo | null>(null);
  const [sesionError, setSesionError] = useState<string | null>(null);
  const [sesionCargando, setSesionCargando] = useState(true);

  const [portafolio, setPortafolio] = useState<{ path: string } | null>(null);
  const [portafolioError, setPortafolioError] = useState<string | null>(null);
  const [confirmacionPendiente, setConfirmacionPendiente] = useState<{ path: string } | null>(null);
  const [progresoPortafolio, setProgresoPortafolio] = useState<string | null>(null);
  const portafolioAbierto = portafolio !== null;

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [organizacionActivaId, setOrganizacionActivaId] = useState<string | null>(null);

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<string | null>(null);
  const [proyectosExpandidos, setProyectosExpandidos] = useState<Set<string>>(new Set());

  const [tabs, setTabs] = useState<EditorTabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState("");

  const catalogoGridRef = useRef<CatalogoGridHandle>(null);
  const [catalogoPuedeEliminar, setCatalogoPuedeEliminar] = useState(false);

  useEffect(() => {
    setCatalogoPuedeEliminar(false);
  }, [activeTabId]);

  useEffect(() => {
    obtenerSesion()
      .then(setCuenta)
      .catch((e) => setSesionError(String(e)))
      .finally(() => setSesionCargando(false));
  }, []);

  const handleIniciarSesion = async () => {
    try {
      const cuentaIniciada = await iniciarSesion();
      setCuenta(cuentaIniciada);
      setSesionError(null);
    } catch (e) {
      setSesionError(String(e));
    }
  };

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

  const handleCrearPortafolio = async () => {
    const path = await save({ filters: FILTROS_PORTAFOLIO, defaultPath: "portafolio.obx" });
    if (!path) return;
    setProgresoPortafolio("Creando portafolio…");
    try {
      await crearPortafolio(path);
      setPortafolio({ path });
      setPortafolioError(null);
    } catch (e) {
      setPortafolioError(String(e));
    } finally {
      setProgresoPortafolio(null);
    }
  };

  const handleAbrirPortafolio = async () => {
    const path = await open({ filters: FILTROS_PORTAFOLIO, multiple: false });
    if (!path || Array.isArray(path)) return;
    try {
      const resultado = await abrirPortafolio(path);
      if (resultado.estado === "RequiereConfirmacion") {
        setConfirmacionPendiente({ path: resultado.path });
        return;
      }
      setPortafolio({ path: resultado.path });
      setPortafolioError(null);
    } catch (e) {
      setPortafolioError(String(e));
    }
  };

  useEffect(() => {
    if (!portafolioAbierto) {
      setOrganizaciones([]);
      setOrganizacionActivaId(null);
      return;
    }
    Promise.all([listOrganizacionesActivas(), obtenerOrganizacionActiva()]).then(
      ([lista, activa]) => {
        setOrganizaciones(lista);
        setOrganizacionActivaId(activa.id);
      },
    );
  }, [portafolioAbierto]);

  // Expuesto vía `OrganizacionContext.reload` — quien edite una organización
  // (p. ej. `OrganizacionSeccion`) lo llama para que el resto de la app deje
  // de ver datos viejos (razón social, moneda default, etc.) sin tener que
  // reabrir el portafolio.
  const recargarOrganizaciones = async () => {
    if (!portafolioAbierto) return;
    const lista = await listOrganizacionesActivas();
    setOrganizaciones(lista);
  };

  const handleCambiarOrganizacion = async (organizacionId: string) => {
    try {
      await setOrganizacionActiva(organizacionId);
      setOrganizacionActivaId(organizacionId);
    } catch (e) {
      setPortafolioError(String(e));
    }
  };

  // El panel lateral todavía es un cascarón (proyectos en memoria, sin
  // datos reales por organización) — de momento reacciona al evento
  // limpiando la selección, que ya no tiene sentido bajo la organización
  // nueva. Cuando tenga datos reales, este es el lugar para recargarlos.
  useEffect(() => {
    setProyectoSeleccionado(null);
  }, [organizacionActivaId]);

  const handleConfirmarAperturaAjena = async (confirmar: boolean) => {
    if (!confirmacionPendiente) return;
    try {
      const path = await confirmarAperturaPortafolioAjeno(confirmar);
      if (path) {
        setPortafolio({ path });
        setPortafolioError(null);
      }
    } catch (e) {
      setPortafolioError(String(e));
    } finally {
      setConfirmacionPendiente(null);
    }
  };

  const toggleProyectoExpandido = (id: string) => {
    setProyectosExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const openCatalogoGridTab = (id: string, label: string) => {
    openTab({ id: `${CATALOGO_PREFIX}${id}`, title: label, closable: true });
  };

  const openSettingsTab = () => {
    openTab({ id: "settings", title: "Configuración", closable: true });
  };

  const openTableDemoTab = () => {
    openTab({ id: "table-demo", title: "Table (demo)", closable: true });
  };

  const openArbolDemoTab = () => {
    openTab({ id: "arbol-demo", title: "Árbol (demo)", closable: true });
  };

  const openMaestroDetalleDemoTab = () => {
    openTab({ id: "maestro-detalle-demo", title: "Maestro/detalle (demo)", closable: true });
  };

  const openHojaCalculoTab = () => {
    openTab({ id: "hoja-calculo", title: "Hoja de cálculo", closable: true });
  };

  const openFsrCalculoTab = (id: string, nombre: string) => {
    openTab({ id: `${FSR_PREFIX}${id}`, title: `FRS · ${nombre}`, closable: true });
  };

  const openModeloCalculoTab = (id: string, nombre: string) => {
    openTab({ id: `${MODELO_CALCULO_PREFIX}${id}`, title: `Cálculo · ${nombre}`, closable: true });
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const renderTabContent = () => {
    if (!activeTab) {
      if (sesionCargando) return null;
      if (!cuenta) {
        return <LoginGate onIniciarSesion={handleIniciarSesion} error={sesionError} />;
      }
      return (
        <StartScreen
          proyectos={proyectos}
          onCrearPortafolio={handleCrearPortafolio}
          onAbrirPortafolio={handleAbrirPortafolio}
          error={portafolioError}
          onAbrirProyecto={(id) => {
            setProyectoSeleccionado(id);
            openHojaTab(id);
          }}
        />
      );
    }
    if (activeTab.id === "table-demo") {
      return <TableDemo />;
    }
    if (activeTab.id === "arbol-demo") {
      return <ArbolDemo />;
    }
    if (activeTab.id === "maestro-detalle-demo") {
      return <MaestroDetalleDemo />;
    }
    if (activeTab.id === "hoja-calculo") {
      return <HojaCalculoPage theme={theme} />;
    }
    if (activeTab.id.startsWith(FSR_PREFIX)) {
      return <CalcularFsrPage factorSalarioRealId={activeTab.id.slice(FSR_PREFIX.length)} />;
    }
    if (activeTab.id.startsWith(MODELO_CALCULO_PREFIX)) {
      return <ModeloCalculoPage factorSalarioRealId={activeTab.id.slice(MODELO_CALCULO_PREFIX.length)} />;
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
      const catalogoId = activeTab.id.slice(CATALOGO_PREFIX.length);
      if (catalogoId === "proveedores") return <ProveedoresSeccion />;
      if (catalogoId === "materiales-item") return <MaterialesSeccion />;
      if (catalogoId === "factores-salario-real") {
        return <FactorSalarioRealSeccion onCalcular={openFsrCalculoTab} onEditarModelo={openModeloCalculoTab} />;
      }
      const config = CATALOGO_GRID_CONFIG[catalogoId];
      if (config) {
        return (
          <CatalogoGrid
            key={catalogoId}
            ref={catalogoGridRef}
            config={config}
            modoSeleccion="unica"
            onSelectionChange={setCatalogoPuedeEliminar}
          />
        );
      }
      return <PlaceholderTab title={activeTab.title} />;
    }
    return null;
  };

  // "proveedores", "materiales-item" y "factores-salario-real" ya traen su
  // propia barra de acciones (ver ProveedoresSeccion/MaterialesSeccion/
  // FactorSalarioRealSeccion) — no deben mostrar también la del tab
  // genérico, cableada a `catalogoGridRef`.
  const catalogoIdActivo = activeTab?.id.startsWith(CATALOGO_PREFIX)
    ? activeTab.id.slice(CATALOGO_PREFIX.length)
    : undefined;
  const CATALOGOS_BESPOKE = ["proveedores", "materiales-item", "factores-salario-real"];
  const catalogoActivoConfig =
    catalogoIdActivo && !CATALOGOS_BESPOKE.includes(catalogoIdActivo)
      ? CATALOGO_GRID_CONFIG[catalogoIdActivo]
      : undefined;

  const tabActions = catalogoActivoConfig && (
    <BarraAcciones
      acciones={[
        { icono: Plus, titulo: "Agregar fila", onClick: () => catalogoGridRef.current?.agregarFila() },
        {
          icono: Trash2,
          titulo: "Eliminar fila seleccionada",
          onClick: () => catalogoGridRef.current?.eliminarFilaSeleccionada(),
          disabled: !catalogoPuedeEliminar,
        },
      ]}
    />
  );

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
    return <CatalogosSidebar onOpenGrupo={openCatalogoTab} onOpenCatalogo={openCatalogoGridTab} />;
  };

  const menus: MenuDef[] = [
    {
      id: "file",
      label: "File",
      actions: [
        { label: "Crear portafolio…", onClick: handleCrearPortafolio, disabled: !cuenta },
        { label: "Abrir portafolio…", onClick: handleAbrirPortafolio, disabled: !cuenta },
        "separator",
        { label: "Nuevo proyecto", onClick: agregarProyecto, disabled: !portafolioAbierto },
        "separator",
        { label: "Table", onClick: openTableDemoTab, disabled: !portafolioAbierto },
        { label: "Árbol", onClick: openArbolDemoTab, disabled: !portafolioAbierto },
        { label: "Maestro/detalle", onClick: openMaestroDetalleDemoTab, disabled: !portafolioAbierto },
        { label: "Hoja de cálculo", onClick: openHojaCalculoTab, disabled: !portafolioAbierto },
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
          disabled: !portafolioAbierto,
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
    <OrganizacionContext.Provider
      value={{
        organizaciones,
        organizacionActivaId,
        cambiarOrganizacion: handleCambiarOrganizacion,
        reload: recargarOrganizaciones,
      }}
    >
      <div className="flex h-screen flex-col">
        <MenuBar
          menus={menus}
          onOpenSettings={openSettingsTab}
          sidebarVisible={sidebarVisible}
          onToggleSidebar={() => setSidebarVisible((v) => !v)}
        />
        <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
          {portafolioAbierto && sidebarVisible && (
            <>
              <ResizablePanel defaultSize="18" minSize="12" maxSize="40" className="flex flex-col bg-muted/40">
                <OrganizacionSwitcher />
                <Toolbar items={SECCIONES} active={seccion} onSelect={setSeccion} />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderSidebar()}</div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel className="flex flex-col overflow-hidden">
            <EditorTabs
              tabs={tabs}
              activeId={activeTabId}
              onSelect={setActiveTabId}
              onClose={closeTab}
              actions={tabActions}
            />
            <main className="flex-1 overflow-hidden">{renderTabContent()}</main>
          </ResizablePanel>
        </ResizablePanelGroup>
        <StatusBar
          proyecto="Boceto de interfaz · sin datos"
          conteo={`${proyectos.length} proyectos`}
          progreso={progresoPortafolio}
        />

        <AlertDialog
          open={confirmacionPendiente !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmacionPendiente(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Este portafolio no te pertenece</AlertDialogTitle>
              <AlertDialogDescription>
                No hay ningún usuario asociado a tu cuenta en este portafolio. Si continúas, se
                creará un usuario nuevo para ti con rol de editor. ¿Deseas continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => handleConfirmarAperturaAjena(false)} />
              <AlertDialogAction onClick={() => handleConfirmarAperturaAjena(true)}>
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </OrganizacionContext.Provider>
  );
}
