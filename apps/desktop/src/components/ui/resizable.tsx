import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ style, ...props }: ResizablePrimitive.PanelProps) {
  // `Panel` aplica `overflow: "auto"` inline por defecto (gana sobre cualquier
  // `overflow-hidden` en className), creando un scroll propio que compite con
  // el de contenido que ya maneja el suyo (p. ej. ag-Grid) y corta la última
  // fila — se sobreescribe a "hidden" salvo que el caller pida lo contrario.
  return (
    <ResizablePrimitive.Panel
      data-slot="resizable-panel"
      style={{ overflow: "hidden", ...style }}
      {...props}
    />
  )
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/handle relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-1.5 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize",
        className
      )}
      {...props}
    >
      <div className="pointer-events-none h-full w-0.5 bg-border group-hover/handle:bg-ring/60 group-aria-[orientation=horizontal]/handle:h-0.5 group-aria-[orientation=horizontal]/handle:w-full" />
      {withHandle && (
        <div className="pointer-events-none absolute z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border group-aria-[orientation=horizontal]/handle:h-1 group-aria-[orientation=horizontal]/handle:w-6" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
