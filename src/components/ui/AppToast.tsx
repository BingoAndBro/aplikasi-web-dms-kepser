"use client"

import * as React from "react"
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react"

import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

export type AppToastVariant = "success" | "error" | "info" | "warning"

export type AppToastMessage = {
  id?: string
  title: string
  description?: React.ReactNode
  variant?: AppToastVariant
  durationMs?: number | null
}

export type AppToastRecord = Required<Pick<AppToastMessage, "id" | "variant">> &
  Omit<AppToastMessage, "id" | "variant">

type AppToastContextValue = {
  showToast: (message: AppToastMessage) => string
  dismissToast: (id: string) => void
}

const AppToastContext = React.createContext<AppToastContextValue | null>(null)

const variantClassName: Record<AppToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  error: "border-red-200 bg-red-50 text-red-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
}

const variantIcon = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: TriangleAlert,
} as const

export type AppToastProviderProps = {
  children: React.ReactNode
  maxToasts?: number
}

export function AppToastProvider({
  children,
  maxToasts = 4,
}: AppToastProviderProps) {
  const [toasts, setToasts] = React.useState<AppToastRecord[]>([])

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  const showToast = (message: AppToastMessage) => {
    const id =
      message.id ??
      `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const toast: AppToastRecord = {
      ...message,
      id,
      variant: message.variant ?? "info",
    }

    setToasts((current) => [toast, ...current].slice(0, maxToasts))

    if (message.durationMs !== null) {
      window.setTimeout(() => {
        dismissToast(id)
      }, message.durationMs ?? 5000)
    }

    return id
  }

  return (
    <AppToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <AppToastViewport toasts={toasts} onDismiss={dismissToast} />
    </AppToastContext.Provider>
  )
}

export function useAppToast() {
  const context = React.useContext(AppToastContext)

  if (!context) {
    throw new Error("useAppToast must be used within AppToastProvider")
  }

  return context
}

export type AppToastViewportProps = {
  toasts: AppToastRecord[]
  onDismiss: (id: string) => void
}

export function AppToastViewport({
  toasts,
  onDismiss,
}: AppToastViewportProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:w-96">
      {toasts.map((toast) => {
        const Icon = variantIcon[toast.variant]
        const role = toast.variant === "error" ? "alert" : "status"

        return (
          <div
            key={toast.id}
            role={role}
            className={cn(
              "flex gap-3 rounded-xl border p-3 text-sm shadow-lg",
              variantClassName[toast.variant],
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{toast.title}</p>
              {toast.description && (
                <div className="mt-1 text-sm opacity-85">
                  {toast.description}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="-mr-1 -mt-1"
              onClick={() => onDismiss(toast.id)}
            >
              <X aria-hidden="true" />
              <span className="sr-only">Tutup notifikasi</span>
            </Button>
          </div>
        )
      })}
    </div>
  )
}
