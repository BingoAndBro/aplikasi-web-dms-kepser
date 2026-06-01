import { Skeleton } from "#/components/ui/skeleton"
import { cn } from "#/lib/utils"

export type LoadingStateVariant = "page" | "card" | "list"

export type LoadingStateProps = {
  variant?: LoadingStateVariant
  label?: string
  rows?: number
  className?: string
}

export function LoadingState({
  variant = "page",
  label = "Memuat data",
  rows = 4,
  className,
}: LoadingStateProps) {
  if (variant === "list") {
    return (
      <div
        className={cn("space-y-3", className)}
        aria-busy="true"
        aria-label={label}
      >
        {Array.from({ length: rows }).map((_, index) => (
          <div
            // Static skeleton rows only; no fake real record data is rendered.
            key={index}
            className="rounded-xl border bg-white p-4"
          >
            <Skeleton className="mb-3 h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === "card") {
    return (
      <div
        className={cn("rounded-xl border bg-white p-4", className)}
        aria-busy="true"
        aria-label={label}
      >
        <Skeleton className="mb-4 h-5 w-1/3" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn("space-y-4 rounded-xl border bg-white p-6", className)}
      aria-busy="true"
      aria-label={label}
    >
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  )
}
