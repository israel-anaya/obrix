import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditorTabInfo {
  id: string;
  title: string;
  closable: boolean;
}

export function EditorTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  actions,
}: {
  tabs: EditorTabInfo[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-stretch border-b border-border bg-muted/20">
      <div className="flex min-w-0 flex-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "group flex cursor-pointer items-center gap-2 border-r border-border px-3 py-2 text-sm text-muted-foreground",
                isActive && "bg-background text-foreground",
              )}
            >
              <span className="truncate">{tab.title}</span>
              {tab.closable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.id);
                  }}
                  className="rounded opacity-0 hover:bg-border group-hover:opacity-100"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border px-1.5">{actions}</div>
      )}
    </div>
  );
}
