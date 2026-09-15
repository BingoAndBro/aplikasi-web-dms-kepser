import * as React from "react"

import { cn } from "#/lib/utils"

export type EmptyStateProps = {
  title: string
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-brand-border-strong bg-white/80 text-center",
        compact ? "gap-2 p-4" : "gap-3 p-8",
        className,
      )}
    >
      {icon && (
        <div className="flex size-10 items-center justify-center rounded-full bg-brand-surface text-brand-solid-active">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <div className="mx-auto max-w-md text-sm text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}
