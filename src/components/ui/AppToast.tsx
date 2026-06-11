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

const DEFAULT_TOAST_DURATION_MS = 4500

const variantClassName: Record<AppToastVariant, string> = {
  success: "border-emerald-200/80 bg-[#FFFDF9] text-zinc-950 shadow-emerald-950/[0.08]",
  error: "border-rose-200/80 bg-[#FFFDF9] text-zinc-950 shadow-rose-950/[0.08]",
  info: "border-slate-200/90 bg-[#FFFDF9] text-zinc-950 shadow-slate-950/[0.08]",
  warning: "border-amber-200/90 bg-[#FFFDF9] text-zinc-950 shadow-amber-950/[0.08]",
}

const variantIconClassName: Record<AppToastVariant, string> = {
  success: "border-emerald-100 bg-emerald-50 text-emerald-700",
  error: "border-rose-100 bg-rose-50 text-rose-700",
  info: "border-slate-100 bg-slate-50 text-slate-700",
  warning: "border-amber-100 bg-amber-50 text-amber-700",
}

const variantProgressClassName: Record<AppToastVariant, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  info: "bg-slate-500",
  warning: "bg-amber-500",
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
      }, message.durationMs ?? DEFAULT_TOAST_DURATION_MS)
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
    <div
      aria-live="polite"
      aria-relevant="additions removals"
      className="fixed inset-x-3 bottom-3 z-[60] flex flex-col-reverse gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:w-96 sm:flex-col"
    >
      {toasts.map((toast) => {
        const Icon = variantIcon[toast.variant]
        const role = toast.variant === "error" || toast.variant === "warning" ? "alert" : "status"
        const durationMs = toast.durationMs ?? DEFAULT_TOAST_DURATION_MS
        const showProgress = toast.durationMs !== null

        return (
          <div
            key={toast.id}
            role={role}
            className={cn(
              "relative overflow-hidden rounded-2xl border p-3.5 text-sm shadow-xl backdrop-blur",
              variantClassName[toast.variant],
            )}
          >
            <div className="flex gap-3">
              <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border", variantIconClassName[toast.variant])}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold leading-5 text-zinc-950">{toast.title}</p>
                {toast.description && (
                  <div className="mt-0.5 text-[12px] font-medium leading-5 text-zinc-600">
                    {toast.description}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-mr-1 -mt-1 text-zinc-400 hover:bg-orange-50 hover:text-zinc-950"
                onClick={() => onDismiss(toast.id)}
              >
                <X aria-hidden="true" />
                <span className="sr-only">Tutup notifikasi</span>
              </Button>
            </div>
            {showProgress && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-zinc-950/[0.04]">
                <div
                  className={cn("h-full origin-left", variantProgressClassName[toast.variant])}
                  style={{
                    animation: `app-toast-progress ${durationMs}ms linear forwards`,
                  } as React.CSSProperties}
                />
              </div>
            )}
          </div>
        )
      })}
      <style>
        {"@keyframes app-toast-progress{from{transform:scaleX(1)}to{transform:scaleX(0)}}"}
      </style>
    </div>
  )
}
