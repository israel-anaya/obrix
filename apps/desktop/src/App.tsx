import { useState } from "react";
import { BarChart3, ListTree, Package, Percent, Ruler } from "lucide-react";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { InsumosPage } from "@/features/catalogo-insumos/InsumosPage";
import { ConceptosPage } from "@/features/catalogo-conceptos/ConceptosPage";

const NAV: NavItem<TabId>[] = [
  { id: "insumos", label: "Insumos", icon: Package },
  { id: "conceptos", label: "Conceptos", icon: ListTree },
  { id: "generadores", label: "Generadores", icon: Ruler },
  { id: "indirectos", label: "Indirectos", icon: Percent },
  { id: "resumen", label: "Resumen", icon: BarChart3 },
];

type TabId = "insumos" | "conceptos" | "generadores" | "indirectos" | "resumen";

export default function App() {
  const [tab, setTab] = useState<TabId>("insumos");
  const actual = NAV.find((n) => n.id === tab)!;

  return (
    <div className="flex h-screen">
      <Sidebar items={NAV} active={tab} onChange={setTab} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-border px-4 py-2.5">
          <h1 className="text-sm font-semibold">{actual.label}</h1>
        </header>
        <main className="flex-1 overflow-auto">
          {tab === "insumos" ? (
            <InsumosPage />
          ) : tab === "conceptos" ? (
            <ConceptosPage />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Próximamente.</p>
          )}
        </main>
      </div>
    </div>
  );
}
