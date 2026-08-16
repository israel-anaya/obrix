import { useEffect } from "react"
import { dismissToast, useToasts } from "@/hooks/use-toast"
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastViewport } from "@/components/ui/toast"

function ToastItem({ id, description, variant, duration }: ReturnType<typeof useToasts>[number]) {
  useEffect(() => {
    if (duration == null) return
    const t = setTimeout(() => dismissToast(id), duration)
    return () => clearTimeout(t)
  }, [id, duration])

  return (
    <Toast
      variant={variant}
      onOpenChange={(open) => {
        if (!open) dismissToast(id)
      }}
    >
      <ToastDescription>{description}</ToastDescription>
      <ToastClose />
    </Toast>
  )
}

export function Toaster() {
  const toasts = useToasts()
  return (
    <ToastProvider swipeDirection="up" duration={Infinity}>
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
