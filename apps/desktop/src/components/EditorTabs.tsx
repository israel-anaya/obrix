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
}: {
  tabs: EditorTabInfo[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div className="flex border-b border-border bg-muted/20">
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
  );
}
