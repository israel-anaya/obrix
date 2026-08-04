import { useState } from "react";
import { cn } from "@/lib/utils";
import { InsumosPage } from "@/features/catalogo-insumos/InsumosPage";
import { ConceptosPage } from "@/features/catalogo-conceptos/ConceptosPage";

const TABS = [
  { id: "insumos", label: "Insumos" },
  { id: "conceptos", label: "Conceptos" },
  { id: "generadores", label: "Generadores" },
  { id: "indirectos", label: "Indirectos" },
  { id: "resumen", label: "Resumen" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [tab, setTab] = useState<TabId>("insumos");

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-border px-3">
        <span className="py-2.5 text-sm font-semibold">Obrix</span>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-t-md px-2.5 py-2.5 text-sm text-muted-foreground hover:text-foreground",
                tab === t.id && "border-b-2 border-accent text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
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
  );
}
