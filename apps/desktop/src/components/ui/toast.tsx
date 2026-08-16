import * as React from "react"
import { Toast as ToastPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function ToastProvider({ ...props }: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider data-slot="toast-provider" {...props} />
}

function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed top-3 left-1/2 z-100 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 outline-none",
        className
      )}
      {...props}
    />
  )
}

const toastVariants = cva(
  "relative flex items-center gap-2 rounded-lg border bg-clip-padding px-3 py-2 text-xs shadow-md duration-150 data-open:animate-in data-open:slide-in-from-top-2 data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
  {
    variants: {
      variant: {
        default: "border-border bg-popover text-popover-foreground",
        success: "border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Toast({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Root> & VariantProps<typeof toastVariants>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
}

function ToastDescription({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("flex-1", className)}
      {...props}
    />
  )
}

function ToastClose({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      title="Cerrar"
      className={cn(
        "shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10",
        className
      )}
      {...props}
    >
      <XIcon size={13} />
    </ToastPrimitive.Close>
  )
}

export { ToastProvider, ToastViewport, Toast, ToastDescription, ToastClose }
