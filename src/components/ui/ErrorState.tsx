import * as React from "react"

import { cn } from "#/lib/utils"

export type ErrorStateVariant = "inline" | "page" | "warning" | "destructive"

const variantClassName: Record<ErrorStateVariant, string> = {
  inline: "border-orange-200 bg-orange-50 text-orange-900",
  page: "border-red-200 bg-white text-red-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  destructive: "border-red-200 bg-red-50 text-red-950",
}

export type ErrorStateProps = {
  title?: string
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: ErrorStateVariant
  className?: string
}

export function ErrorState({
  title = "Terjadi kendala",
  description = "Silakan coba lagi atau hubungi administrator jika kendala berlanjut.",
  action,
  variant = "inline",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border p-4 text-sm shadow-sm",
        variantClassName[variant],
        className,
      )}
    >
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && (
          <div className="text-sm opacity-85">{description}</div>
        )}
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
