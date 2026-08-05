import { useState } from "react";
import { BarChart3, ListTree, Package, Percent, Ruler } from "lucide-react";
import { ActivityBar, type Activity } from "@/components/ActivityBar";
import { EditorTabs, type EditorTabInfo } from "@/components/EditorTabs";
import { StatusBar } from "@/components/StatusBar";
import { InsumosPage } from "@/features/catalogo-insumos/InsumosPage";
import { InsumoList } from "@/features/catalogo-insumos/InsumoList";
import { ConceptosPage } from "@/features/catalogo-conceptos/ConceptosPage";
import { ConceptoTree } from "@/features/catalogo-conceptos/ConceptoTree";
import { ConceptoDetailTab } from "@/features/catalogo-conceptos/ConceptoDetailTab";
import { useInsumos } from "@/hooks/useInsumos";
import { useConceptos } from "@/hooks/useConceptos";

type ActivityId = "insumos" | "conceptos" | "generadores" | "indirectos" | "resumen";

const ACTIVITIES: Activity<ActivityId>[] = [
  { id: "insumos", label: "Insumos", icon: Package },
  { id: "conceptos", label: "Conceptos", icon: ListTree },
  { id: "generadores", label: "Generadores", icon: Ruler },
  { id: "indirectos", label: "Indirectos", icon: Percent },
  { id: "resumen", label: "Resumen", icon: BarChart3 },
];

const ACTIVITY_TITLE: Record<ActivityId, string> = {
  insumos: "Insumos",
  conceptos: "Conceptos",
  generadores: "Generadores",
  indirectos: "Indirectos",
  resumen: "Resumen",
};

const CONCEPTO_TAB_PREFIX = "concepto:";

export default function App() {
  const insumosState = useInsumos();
  const conceptosState = useConceptos();

  const [activity, setActivity] = useState<ActivityId>("insumos");
  const [tabs, setTabs] = useState<EditorTabInfo[]>([
    { id: "insumos", title: "Insumos", closable: false },
  ]);
  const [activeTabId, setActiveTabId] = useState("insumos");

  const openTab = (tab: EditorTabInfo) => {
    setTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
  };

  const openActivityTab = (id: ActivityId) => {
    setActivity(id);
    openTab({ id, title: ACTIVITY_TITLE[id], closable: false });
  };

  const openConceptoTab = (conceptoId: string) => {
    const concepto = conceptosState.conceptos.find((c) => c.id === conceptoId);
    openTab({
      id: `${CONCEPTO_TAB_PREFIX}${conceptoId}`,
      title: concepto?.clave ?? conceptoId,
      closable: true,
    });
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id && next.length > 0) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const renderTabContent = () => {
    if (!activeTab) return null;
    if (activeTab.id === "insumos") {
      return (
        <InsumosPage
          insumos={insumosState.insumos}
          error={insumosState.error}
          onCreate={insumosState.crear}
        />
      );
    }
    if (activeTab.id === "conceptos") {
      return (
        <ConceptosPage
          conceptos={conceptosState.conceptos}
          error={conceptosState.error}
          onCreate={conceptosState.crear}
        />
      );
    }
    if (activeTab.id.startsWith(CONCEPTO_TAB_PREFIX)) {
      const id = activeTab.id.slice(CONCEPTO_TAB_PREFIX.length);
      return <ConceptoDetailTab concepto={conceptosState.conceptos.find((c) => c.id === id)} />;
    }
    return <p className="p-4 text-sm text-muted-foreground">Próximamente.</p>;
  };

  const renderSidebar = () => {
    if (activity === "insumos") {
      return (
        <InsumoList insumos={insumosState.insumos} onOpenCatalogo={() => openActivityTab("insumos")} />
      );
    }
    if (activity === "conceptos") {
      return (
        <ConceptoTree
          conceptos={conceptosState.conceptos}
          activeId={
            activeTabId.startsWith(CONCEPTO_TAB_PREFIX)
              ? activeTabId.slice(CONCEPTO_TAB_PREFIX.length)
              : null
          }
          onOpenCatalogo={() => openActivityTab("conceptos")}
          onOpenConcepto={openConceptoTab}
        />
      );
    }
    return <p className="p-2 text-xs text-muted-foreground">Próximamente.</p>;
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar activities={ACTIVITIES} active={activity} onSelect={openActivityTab} />
        <aside className="w-56 shrink-0 overflow-auto border-r border-border bg-muted/40">
          {renderSidebar()}
        </aside>
        <div className="flex flex-1 flex-col overflow-hidden">
          <EditorTabs tabs={tabs} activeId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />
          <main className="flex-1 overflow-auto">{renderTabContent()}</main>
        </div>
      </div>
      <StatusBar
        proyecto="Proyecto demo · local"
        conteo={`${conceptosState.conceptos.length} conceptos · ${insumosState.insumos.length} insumos`}
      />
    </div>
  );
}
