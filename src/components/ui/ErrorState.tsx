import * as React from "react"

import { toneClasses } from "#/lib/tone"
import { cn } from "#/lib/utils"

// "inline" and "warning" are confirmed dead (0 real call sites; every one of
// the 30+ usages passes "page" or "destructive") — kept for API stability,
// now correctly token-based rather than removed. "page" mixes a layout
// concern (full-page white bg) into what's otherwise a tone enum; splitting
// that out would mean editing 26+ call sites for no visible change, so it
// stays a local one-off rather than routing through toneClasses().
export type ErrorStateVariant = "inline" | "page" | "warning" | "destructive"

const variantClassName: Record<ErrorStateVariant, string> = {
  inline: toneClasses('brand', 'notice'),
  page: "border-danger-border bg-white text-danger-text",
  warning: toneClasses('warning', 'notice'),
  destructive: toneClasses('danger', 'notice'),
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
