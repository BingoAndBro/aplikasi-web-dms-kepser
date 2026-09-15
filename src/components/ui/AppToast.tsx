"use client"

import * as React from "react"
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react"

import { Button } from "#/components/ui/button"
import { toneClasses, type Tone } from "#/lib/tone"
import { cn } from "#/lib/utils"

export type AppToastVariant = "success" | "error" | "info" | "warning"

// AppToastVariant is the public API (used across the app as showToast({ variant })) —
// kept as-is; VARIANT_TO_TONE maps it onto the shared semantic Tone. "info" used to
// render slate here (a 3rd, different "info" from StatusBadge's sky and AdminNotice's
// orange) — now correctly sky, matching the rest of the app.
const VARIANT_TO_TONE: Record<AppToastVariant, Tone> = {
  success: "success",
  error: "danger",
  info: "info",
  warning: "warning",
}

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

// Card background/text deliberately stay neutral regardless of severity —
// only the border + shadow carry the tone tint — so this stays a local table
// rather than the shared toneClasses() 'notice' surface (which tints the bg).
const variantClassName: Record<AppToastVariant, string> = {
  success: "border-success-border bg-surface text-zinc-950 shadow-success-solid/10",
  error: "border-danger-border bg-surface text-zinc-950 shadow-danger-solid/10",
  info: "border-info-border bg-surface text-zinc-950 shadow-info-solid/10",
  warning: "border-warning-border bg-surface text-zinc-950 shadow-warning-solid/10",
}

const variantProgressClassName: Record<AppToastVariant, string> = {
  success: "bg-success-solid",
  error: "bg-danger-solid",
  info: "bg-info-solid",
  warning: "bg-warning-solid",
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
              <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border", toneClasses(VARIANT_TO_TONE[toast.variant], 'notice'))}>
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
                className="-mr-1 -mt-1 text-zinc-400 hover:bg-brand-surface hover:text-zinc-950"
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
