import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, FolderKanban, Grid3x3, LayoutGrid, type LucideIcon, Package, Plus, Settings2, Table2, Trash2, Users } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BarraAcciones } from "@/components/BarraAcciones";
import { CuentaFooter } from "@/components/CuentaFooter";
import { EditorTabs, type EditorTabInfo } from "@/components/EditorTabs";
import { LoginGate } from "@/components/LoginGate";
import { MenuBar, type MenuDef } from "@/components/MenuBar";
import { OperacionProgresoDialog } from "@/components/OperacionProgresoDialog";
import { SidebarHeader } from "@/components/SidebarHeader";
import { WindowFrame } from "@/components/WindowFrame";
import { PlaceholderTab } from "@/components/PlaceholderTab";
import { EditorEmptyState } from "@/components/EditorEmptyState";
import { StartScreen } from "@/components/StartScreen";
import { Toolbar, type ToolbarItem } from "@/components/Toolbar";
import { Toaster } from "@/components/ui/toaster";
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
import { DataGrid, type DataGridHandle } from "@/components/grid/DataGrid";
import { activeGridClipboard } from "@/components/grid/gridClipboard";
import { CatalogosSidebar } from "@/features/catalogos/CatalogosSidebar";
import { ClientesSeccion } from "@/features/catalogos/ClientesSeccion";
import { CATALOGO_GRID_CONFIG } from "@/features/catalogos/costosDirectosTree";
import { CuadrillasSeccion, type CuadrillasVista } from "@/features/catalogos/CuadrillasSeccion";
import { EquipoCostoHorarioSeccion, type EquipoCostoHorarioVista } from "@/features/catalogos/EquipoCostoHorarioSeccion";
import { EscalafonSalarioSeccion } from "@/features/catalogos/EscalafonSalarioSeccion";
import { HerramientaSeccion } from "@/features/catalogos/HerramientaSeccion";
import { MaterialesCatalogoSeccion, type MaterialesVista } from "@/features/catalogos/MaterialesCatalogoSeccion";
import { MatrizOficioRegionSeccion } from "@/features/catalogos/MatrizOficioRegionSeccion";
import { MesaEquivalentesSeccion } from "@/features/catalogos/MesaEquivalentesSeccion";
import { PerfilInactividadEquipoSeccion, type PerfilInactividadVista } from "@/features/catalogos/PerfilInactividadEquipoSeccion";
import { PuenteBaseRealSeccion } from "@/features/catalogos/PuenteBaseRealSeccion";
import { RadarMaterialesSeccion } from "@/features/catalogos/RadarMaterialesSeccion";
import { ProveedoresSeccion } from "@/features/catalogos/ProveedoresSeccion";
import { TabuladoresSalarioSeccion, type TabuladoresSalarioVista } from "@/features/catalogos/TabuladoresSalarioSeccion";
import { SettingsPage } from "@/features/configuracion/SettingsPage";
import { CatalogoGeneralSeccion } from "@/features/configuracion/CatalogoGeneralSeccion";
import { CATALOGOS_GENERALES } from "@/features/configuracion/catalogosGenerales";
import { FamiliasInsumoSeccion } from "@/features/configuracion/FamiliasInsumoSeccion";
import { fichaCatalogoMaestro } from "@/features/configuracion/fichaCatalogoMaestro";
import { OrganizacionSeccion } from "@/features/configuracion/OrganizacionSeccion";
import { PortafolioConfigSidebar } from "@/features/configuracion/PortafolioConfigSidebar";
import { UsuariosSeccion } from "@/features/configuracion/UsuariosSeccion";
import { ArbolDemo } from "@/features/demo/ArbolDemo";
import { HojaCalculoPage } from "@/features/hoja-calculo/HojaCalculoPage";
import { CalcularFsrPage } from "@/features/fsr/CalcularFsrPage";
import { FactorSalarioRealSeccion } from "@/features/fsr/FactorSalarioRealSeccion";
import { ModeloCalculoPage } from "@/features/fsr/ModeloCalculoPage";
import { OrganizacionContext } from "@/features/organizacion/OrganizacionContext";
import { ProyectosSidebar } from "@/features/proyectos/ProyectosSidebar";
import type { Proyecto } from "@/features/proyectos/types";
import { useTheme } from "@/hooks/useTheme";
import { nombreDesdePath } from "@/lib/utils";
import type { AccountInfo, Organizacion, PortafolioReciente } from "@/lib/types";
import {
  abrirPortafolio,
  cerrarPortafolio,
  cerrarSesion,
  confirmarAperturaPortafolioAjeno,
  crearPortafolio,
  iniciarSesion,
  listOrganizacionesActivas,
  listarPortafoliosRecientes,
  obtenerOrganizacionActiva,
  obtenerSesion,
  registrarCuenta,
  setOrganizacionActiva,
} from "@/lib/tauri";

const FILTROS_PORTAFOLIO = [{ name: "Portafolio Obrix", extensions: ["obx"] }];

type SeccionId = "proyectos" | "catalogos" | "configuracion-portafolio";

const SECCIONES: ToolbarItem<SeccionId>[] = [
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "catalogos", label: "Catálogos", icon: BookOpen },
  { id: "configuracion-portafolio", label: "Configuración de portafolio", icon: Settings2 },
];

const HOJA_PREFIX = "proyecto:hoja:";
const PROGRAMA_PREFIX = "proyecto:programa:";
const CATALOGO_PREFIX = "catalogo:";
const FSR_PREFIX = "fsr:";
const MODELO_CALCULO_PREFIX = "modelo-calculo:";

/** Selector de sub-vista embebido en una pestaña del editor (ver `renderTabExtra` de `EditorTabs`). */
function renderVistaSwitcher<T extends string>(
  vistas: { id: T; icon: LucideIcon; titulo: string }[],
  actual: T,
  onCambiar: (id: T) => void,
) {
  return (
    <div className="flex items-center gap-0.5">
      {vistas.map(({ id, icon: Icon, titulo }) => (
        <button
          key={id}
          type="button"
          title={titulo}
          onClick={(e) => {
            e.stopPropagation();
            onCambiar(id);
          }}
          className="rounded p-0.5 hover:bg-border"
        >
          <Icon size={16} className={actual === id ? "text-primary" : "text-muted-foreground/40"} />
        </button>
      ))}
    </div>
  );
}

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
  const [recientes, setRecientes] = useState<PortafolioReciente[]>([]);
  const [operacionPortafolio, setOperacionPortafolio] = useState<{
    titulo: string;
    mensaje: string;
    error: string | null;
  } | null>(null);
  const portafolioAbierto = portafolio !== null;

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [organizacionActivaId, setOrganizacionActivaId] = useState<string | null>(null);

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<string | null>(null);
  const [proyectosExpandidos, setProyectosExpandidos] = useState<Set<string>>(new Set());

  const [tabs, setTabs] = useState<EditorTabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [cuadrillasVista, setCuadrillasVista] = useState<CuadrillasVista>("grid");
  const [equipoCostoHorarioVista, setEquipoCostoHorarioVista] = useState<EquipoCostoHorarioVista>("grid");
  const [materialesVista, setMaterialesVista] = useState<MaterialesVista>("grid");
  const [tabuladoresSalarioVista, setTabuladoresSalarioVista] = useState<TabuladoresSalarioVista>("grid");
  const [perfilInactividadVista, setPerfilInactividadVista] = useState<PerfilInactividadVista>("grid");

  const dataGridRef = useRef<DataGridHandle>(null);
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

  const recargarRecientes = () => {
    listarPortafoliosRecientes()
      .then(setRecientes)
      .catch(() => setRecientes([]));
  };

  useEffect(() => {
    if (!cuenta) {
      setRecientes([]);
      return;
    }
    recargarRecientes();
  }, [cuenta]);

  const handleIniciarSesion = async (correo: string, password: string) => {
    try {
      const cuentaIniciada = await iniciarSesion(correo, password);
      setCuenta(cuentaIniciada);
      setSesionError(null);
    } catch (e) {
      setSesionError(String(e));
    }
  };

  const handleRegistrarCuenta = async (correo: string, password: string) => {
    try {
      const cuentaIniciada = await registrarCuenta(correo, password);
      setCuenta(cuentaIniciada);
      setSesionError(null);
    } catch (e) {
      setSesionError(String(e));
    }
  };

  const handleCerrarSesion = async () => {
    try {
      await cerrarSesion();
      setCuenta(null);
      setSesionError(null);
      resetearPortafolio();
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

  const activarPortafolio = (path: string) => {
    if (portafolio?.path !== path) {
      setTabs([]);
      setActiveTabId("");
      setProyectos([]);
      setProyectoSeleccionado(null);
    }
    setPortafolio({ path });
    setPortafolioError(null);
    recargarRecientes();
  };

  const abrirPortafolioEnRuta = async (path: string) => {
    setOperacionPortafolio({ titulo: "Abrir portafolio", mensaje: "Abriendo portafolio…", error: null });
    try {
      const resultado = await abrirPortafolio(path);
      if (resultado.estado === "RequiereConfirmacion") {
        setOperacionPortafolio(null);
        setConfirmacionPendiente({ path: resultado.path });
        return;
      }
      setOperacionPortafolio(null);
      activarPortafolio(resultado.path);
    } catch (e) {
      setOperacionPortafolio({ titulo: "Abrir portafolio", mensaje: "Abriendo portafolio…", error: String(e) });
    }
  };

  const handleCrearPortafolio = async () => {
    const path = await save({ filters: FILTROS_PORTAFOLIO, defaultPath: "portafolio.obx" });
    if (!path) return;
    setOperacionPortafolio({ titulo: "Crear portafolio", mensaje: "Creando portafolio…", error: null });
    try {
      const creado = await crearPortafolio(path);
      setOperacionPortafolio(null);
      activarPortafolio(creado);
    } catch (e) {
      setOperacionPortafolio({ titulo: "Crear portafolio", mensaje: "Creando portafolio…", error: String(e) });
    }
  };

  const handleAbrirPortafolio = async () => {
    const path = await open({ filters: FILTROS_PORTAFOLIO, multiple: false });
    if (!path || Array.isArray(path)) return;
    await abrirPortafolioEnRuta(path);
  };

  const resetearPortafolio = () => {
    setPortafolio(null);
    setPortafolioError(null);
    setTabs([]);
    setActiveTabId("");
    setProyectos([]);
    setProyectoSeleccionado(null);
  };

  const handleCerrarPortafolio = async () => {
    if (!portafolioAbierto) return;
    try {
      await cerrarPortafolio();
      resetearPortafolio();
    } catch (e) {
      setPortafolioError(String(e));
    }
  };

  useEffect(() => {
    if (!portafolio) {
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
  }, [portafolio]);

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
      // `portafolioError` se ve en `StartScreen` / `EditorEmptyState` — con una
      // pestaña abierta (el caso normal al usar el switcher del sidebar) ese
      // error queda invisible. Se relanza para que el propio switcher lo muestre.
      throw e;
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
    setConfirmacionPendiente(null);
    if (confirmar) {
      setOperacionPortafolio({ titulo: "Abrir portafolio", mensaje: "Abriendo portafolio…", error: null });
    }
    try {
      const path = await confirmarAperturaPortafolioAjeno(confirmar);
      if (path) {
        setOperacionPortafolio(null);
        activarPortafolio(path);
      } else {
        setOperacionPortafolio(null);
      }
    } catch (e) {
      if (confirmar) {
        setOperacionPortafolio({ titulo: "Abrir portafolio", mensaje: "Abriendo portafolio…", error: String(e) });
      } else {
        setPortafolioError(String(e));
      }
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

  const openCatalogoGridTab = (id: string, label: string, icon?: LucideIcon) => {
    openTab({ id: `${CATALOGO_PREFIX}${id}`, title: label, closable: true, icon });
  };

  const openSettingsTab = () => {
    openTab({ id: "settings", title: "Configuración", closable: true });
  };

  const openArbolDemoTab = () => {
    openTab({ id: "arbol-demo", title: "Árbol (demo)", closable: true });
  };

  const openHojaCalculoTab = () => {
    openTab({ id: "hoja-calculo", title: "Hoja de cálculo", closable: true });
  };

  const openFsrCalculoTab = (id: string, nombre: string) => {
    openTab({ id: `${FSR_PREFIX}${id}`, title: `Cálculo · ${nombre}`, closable: true });
  };

  const openModeloCalculoTab = (id: string, nombre: string) => {
    openTab({ id: `${MODELO_CALCULO_PREFIX}${id}`, title: `Modelo de cálculo · ${nombre}`, closable: true });
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const renderTabContent = () => {
    if (!activeTab) {
      if (sesionCargando) return null;
      if (!cuenta) {
        return (
          <LoginGate
            onIniciarSesion={handleIniciarSesion}
            onRegistrarCuenta={handleRegistrarCuenta}
            error={sesionError}
          />
        );
      }
      if (!portafolio) {
        return (
          <StartScreen
            recientes={recientes}
            onCrearPortafolio={handleCrearPortafolio}
            onAbrirPortafolio={handleAbrirPortafolio}
            onAbrirReciente={abrirPortafolioEnRuta}
            error={portafolioError}
          />
        );
      }
      return (
        <EditorEmptyState
          nombre={nombreDesdePath(portafolio.path)}
          path={portafolio.path}
          error={portafolioError}
          onNuevoProyecto={() => {
            setSeccion("proyectos");
            agregarProyecto();
          }}
          onAbrirMateriales={() => {
            setSeccion("catalogos");
            openCatalogoGridTab("materiales-item", "Materiales", Package);
          }}
          onAbrirCuadrillas={() => {
            setSeccion("catalogos");
            openCatalogoGridTab("cuadrillas-trabajo", "Cuadrillas de trabajo", Users);
          }}
        />
      );
    }
    if (activeTab.id === "arbol-demo") {
      return <ArbolDemo />;
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
      if (catalogoId === "perfiles-inactividad") return <PerfilInactividadEquipoSeccion vista={perfilInactividadVista} />;
      if (catalogoId === "proveedores") return <ProveedoresSeccion />;
      if (catalogoId === "clientes") return <ClientesSeccion />;
      if (catalogoId === "materiales-item") {
        return <MaterialesCatalogoSeccion vista={materialesVista} />;
      }
      if (catalogoId === "materiales-mesa") return <MesaEquivalentesSeccion />;
      if (catalogoId === "materiales-radar") return <RadarMaterialesSeccion />;
      if (catalogoId === "factores-salario-real") {
        return <FactorSalarioRealSeccion onCalcular={openFsrCalculoTab} onEditarModelo={openModeloCalculoTab} />;
      }
      if (catalogoId === "tabuladores-salario") return <TabuladoresSalarioSeccion vista={tabuladoresSalarioVista} />;
      if (catalogoId === "tabuladores-escalafon") return <EscalafonSalarioSeccion />;
      if (catalogoId === "tabuladores-matriz") return <MatrizOficioRegionSeccion />;
      if (catalogoId === "tabuladores-puente") return <PuenteBaseRealSeccion />;
      if (catalogoId === "cuadrillas-trabajo") {
        return <CuadrillasSeccion vista={cuadrillasVista} />;
      }
      if (catalogoId === "herramienta") return <HerramientaSeccion />;
      if (catalogoId === "costos-horarios") return <EquipoCostoHorarioSeccion vista={equipoCostoHorarioVista} />;
      if (catalogoId === "organizaciones") return <OrganizacionSeccion />;
      if (catalogoId === "usuarios") return <UsuariosSeccion />;
      if (catalogoId === "familias-insumo") return <FamiliasInsumoSeccion />;
      const catalogoGeneral = CATALOGOS_GENERALES.find((d) => d.id === catalogoId);
      if (catalogoGeneral) {
        return (
          <CatalogoGeneralSeccion
            key={catalogoGeneral.id}
            descriptor={catalogoGeneral}
            ficha={fichaCatalogoMaestro(catalogoGeneral.id)}
          />
        );
      }
      const config = CATALOGO_GRID_CONFIG[catalogoId];
      if (config) {
        return (
          <DataGrid
            key={catalogoId}
            ref={dataGridRef}
            config={config}
            selectionMode="single"
            onSelectionChange={setCatalogoPuedeEliminar}
          />
        );
      }
      return <PlaceholderTab title={activeTab.title} />;
    }
    return null;
  };

  // "proveedores", "clientes", "materiales-item", "materiales-mesa",
  // "materiales-radar", "factores-salario-real", "tabuladores-salario",
  // "tabuladores-escalafon", "tabuladores-matriz", "tabuladores-puente",
  // "cuadrillas-trabajo" y "herramienta" ya traen su propia barra de
  // acciones — no deben mostrar también la del tab genérico, cableada a
  // `dataGridRef`.
  const catalogoIdActivo = activeTab?.id.startsWith(CATALOGO_PREFIX)
    ? activeTab.id.slice(CATALOGO_PREFIX.length)
    : undefined;
  const CATALOGOS_BESPOKE = [
    "perfiles-inactividad",
    "proveedores",
    "clientes",
    "materiales-item",
    "materiales-mesa",
    "materiales-radar",
    "factores-salario-real",
    "tabuladores-salario",
    "tabuladores-escalafon",
    "tabuladores-matriz",
    "tabuladores-puente",
    "cuadrillas-trabajo",
    "herramienta",
    "costos-horarios",
    ...CATALOGOS_GENERALES.map((d) => d.id),
  ];
  const catalogoActivoConfig =
    catalogoIdActivo && !CATALOGOS_BESPOKE.includes(catalogoIdActivo)
      ? CATALOGO_GRID_CONFIG[catalogoIdActivo]
      : undefined;

  const tabActions = catalogoActivoConfig && (
    <BarraAcciones
      acciones={[
        { icono: Plus, titulo: "Agregar fila", onClick: () => dataGridRef.current?.addRow() },
        {
          icono: Trash2,
          titulo: "Eliminar fila seleccionada",
          onClick: () => dataGridRef.current?.deleteSelectedRows(),
          disabled: !catalogoPuedeEliminar,
        },
      ]}
    />
  );

  const CUADRILLAS_TAB_ID = `${CATALOGO_PREFIX}cuadrillas-trabajo`;
  const CUADRILLAS_VISTAS: { id: CuadrillasVista; icon: LucideIcon; titulo: string }[] = [
    { id: "grid", icon: Table2, titulo: "Vista Clásica" },
    { id: "ficha", icon: FileText, titulo: "Modo ficha" },
  ];
  const MATERIALES_TAB_ID = `${CATALOGO_PREFIX}materiales-item`;
  const MATERIALES_VISTAS: { id: MaterialesVista; icon: LucideIcon; titulo: string }[] = [
    { id: "grid", icon: Table2, titulo: "Vista Clásica" },
    { id: "estanteria", icon: LayoutGrid, titulo: "Modo Estantería" },
  ];
  const EQUIPO_COSTO_HORARIO_TAB_ID = `${CATALOGO_PREFIX}costos-horarios`;
  const EQUIPO_COSTO_HORARIO_VISTAS: { id: EquipoCostoHorarioVista; icon: LucideIcon; titulo: string }[] = [
    { id: "grid", icon: Table2, titulo: "Vista Clásica" },
    { id: "ficha", icon: FileText, titulo: "Modo ficha" },
  ];
  const TABULADORES_SALARIO_TAB_ID = `${CATALOGO_PREFIX}tabuladores-salario`;
  const TABULADORES_SALARIO_VISTAS: { id: TabuladoresSalarioVista; icon: LucideIcon; titulo: string }[] = [
    { id: "grid", icon: Table2, titulo: "Vista Clásica" },
    { id: "matriz", icon: Grid3x3, titulo: "Modo Matriz × región" },
  ];
  const PERFILES_INACTIVIDAD_TAB_ID = `${CATALOGO_PREFIX}perfiles-inactividad`;
  const PERFILES_INACTIVIDAD_VISTAS: { id: PerfilInactividadVista; icon: LucideIcon; titulo: string }[] = [
    { id: "grid", icon: Table2, titulo: "Vista Clásica" },
    { id: "matriz", icon: Grid3x3, titulo: "Modo Matriz" },
  ];
  const renderTabExtra = (tab: EditorTabInfo) => {
    if (tab.id === CUADRILLAS_TAB_ID) return renderVistaSwitcher(CUADRILLAS_VISTAS, cuadrillasVista, setCuadrillasVista);
    if (tab.id === MATERIALES_TAB_ID) return renderVistaSwitcher(MATERIALES_VISTAS, materialesVista, setMaterialesVista);
    if (tab.id === EQUIPO_COSTO_HORARIO_TAB_ID) {
      return renderVistaSwitcher(EQUIPO_COSTO_HORARIO_VISTAS, equipoCostoHorarioVista, setEquipoCostoHorarioVista);
    }
    if (tab.id === TABULADORES_SALARIO_TAB_ID) {
      return renderVistaSwitcher(TABULADORES_SALARIO_VISTAS, tabuladoresSalarioVista, setTabuladoresSalarioVista);
    }
    if (tab.id === PERFILES_INACTIVIDAD_TAB_ID) {
      return renderVistaSwitcher(PERFILES_INACTIVIDAD_VISTAS, perfilInactividadVista, setPerfilInactividadVista);
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
    if (seccion === "configuracion-portafolio") {
      return <PortafolioConfigSidebar onOpenCatalogo={openCatalogoGridTab} />;
    }
    return <CatalogosSidebar onOpenGrupo={openCatalogoTab} onOpenCatalogo={openCatalogoGridTab} />;
  };

  const menus: MenuDef[] = [
    {
      id: "file",
      label: "Archivo",
      actions: [
        { label: "Crear portafolio…", onClick: handleCrearPortafolio, disabled: !cuenta },
        { label: "Abrir portafolio…", onClick: handleAbrirPortafolio, disabled: !cuenta },
        { label: "Cerrar portafolio", onClick: handleCerrarPortafolio, disabled: !portafolioAbierto },
        "separator",
        { label: "Nuevo proyecto", onClick: agregarProyecto, disabled: !portafolioAbierto },
        "separator",
        { label: "Árbol", onClick: openArbolDemoTab, disabled: !portafolioAbierto },
        { label: "Hoja de cálculo", onClick: openHojaCalculoTab, disabled: !portafolioAbierto },
        "separator",
        { label: "Salir", onClick: () => getCurrentWindow().close() },
      ],
    },
    {
      id: "edit",
      label: "Editar",
      actions: [
        { label: "Deshacer", shortcut: "Ctrl+Z", disabled: true },
        { label: "Rehacer", shortcut: "Ctrl+Shift+Z", disabled: true },
        "separator",
        { label: "Cortar", shortcut: "Ctrl+X", onClick: () => void activeGridClipboard()?.cut() },
        { label: "Copiar", shortcut: "Ctrl+C", onClick: () => void activeGridClipboard()?.copy() },
        { label: "Pegar", shortcut: "Ctrl+V", onClick: () => void activeGridClipboard()?.paste() },
      ],
    },
    {
      id: "selection",
      label: "Selección",
      actions: [
        { label: "Seleccionar todo", shortcut: "Ctrl+A", disabled: true },
        { label: "Expandir selección", disabled: true },
      ],
    },
    {
      id: "view",
      label: "Ver",
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
      <WindowFrame>
        <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
          {portafolioAbierto && sidebarVisible && (
            <>
              <ResizablePanel defaultSize="18" minSize="12" maxSize="40" className="flex flex-col bg-muted/40">
                <SidebarHeader menus={menus} onHideSidebar={() => setSidebarVisible(false)} />
                <Toolbar items={SECCIONES} active={seccion} onSelect={setSeccion} />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderSidebar()}</div>
                <CuentaFooter cuenta={cuenta} onCerrarSesion={handleCerrarSesion} />
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          <ResizablePanel className="flex flex-col overflow-hidden">
            <MenuBar
              menus={menus}
              onOpenSettings={openSettingsTab}
              sidebarVisible={sidebarVisible}
              onToggleSidebar={() => setSidebarVisible((v) => !v)}
              showAppMenu={!portafolioAbierto || !sidebarVisible}
              showSidebarToggle={portafolioAbierto && !sidebarVisible}
            />
            <EditorTabs
              tabs={tabs}
              activeId={activeTabId}
              renderTabExtra={renderTabExtra}
              onSelect={setActiveTabId}
              onClose={closeTab}
              actions={tabActions}
            />
            <main className="flex-1 overflow-hidden">{renderTabContent()}</main>
          </ResizablePanel>
        </ResizablePanelGroup>

        <OperacionProgresoDialog
          abierto={operacionPortafolio !== null}
          titulo={operacionPortafolio?.titulo ?? ""}
          mensaje={operacionPortafolio?.mensaje ?? ""}
          error={operacionPortafolio?.error}
          onCerrar={() => setOperacionPortafolio(null)}
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
        <Toaster />
      </WindowFrame>
    </OrganizacionContext.Provider>
  );
}
