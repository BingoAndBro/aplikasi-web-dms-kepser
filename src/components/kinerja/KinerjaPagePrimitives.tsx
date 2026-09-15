import type { ReactNode } from 'react'

import { Search } from 'lucide-react'

import {
  DATA_SEARCH_ICON_TONE_CLASS,
  DATA_SEARCH_INPUT_TONE_CLASS,
  DATA_TABLE_SHELL_TONE_CLASS,
} from '#/lib/data-table-classes'
import { cn } from '#/lib/utils'

type KinerjaPageHeaderProps = {
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function KinerjaPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: KinerjaPageHeaderProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-brand-border bg-gradient-to-br from-brand-surface via-bg-surface to-brand-surface/70 p-5 shadow-sm sm:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-brand-solid-active/70">
            {eyebrow}
          </div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
            {title}
          </h1>
          {description && (
            <div className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-700">
              {description}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

type KinerjaPanelProps = {
  children: ReactNode
  className?: string
}

export function KinerjaPanel({ children, className }: KinerjaPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-brand-border/80 bg-bg-surface p-4 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

type KinerjaSearchPanelProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  children?: ReactNode
  resultText?: ReactNode
  helperText?: ReactNode
}

export function KinerjaSearchPanel({
  id,
  label,
  value,
  onChange,
  placeholder,
  children,
  resultText,
  helperText,
}: KinerjaSearchPanelProps) {
  return (
    <KinerjaPanel className="p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="relative min-w-0 flex-1 md:max-w-md" htmlFor={id}>
            <span className="sr-only">{label}</span>
            <Search
              size={15}
              className={cn('absolute left-3 top-1/2 -translate-y-1/2', DATA_SEARCH_ICON_TONE_CLASS)}
              aria-hidden="true"
            />
            <input
              id={id}
              type="search"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className={cn('h-10 w-full rounded-xl border pl-9 pr-4 text-sm font-semibold', DATA_SEARCH_INPUT_TONE_CLASS)}
              placeholder={placeholder}
              autoComplete="off"
            />
          </label>
          {children}
        </div>
        {resultText && (
          <div className="text-xs font-semibold text-zinc-500">
            {resultText}
          </div>
        )}
      </div>
      {helperText && (
        <div className="mt-2 text-xs leading-relaxed text-zinc-600">
          {helperText}
        </div>
      )}
    </KinerjaPanel>
  )
}

export function KinerjaTableShell({ children, className }: KinerjaPanelProps) {
  return (
    <div
      className={cn(
        'hidden overflow-hidden rounded-2xl border lg:block',
        DATA_TABLE_SHELL_TONE_CLASS,
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

type KinerjaMobileListProps = {
  children: ReactNode
  className?: string
}

export function KinerjaMobileList({ children, className }: KinerjaMobileListProps) {
  return <div className={cn('grid gap-3 lg:hidden', className)}>{children}</div>
}

type KinerjaMobileCardProps = {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  meta?: Array<{ label: ReactNode; value: ReactNode }>
}

export function KinerjaMobileCard({
  title,
  subtitle,
  status,
  meta = [],
}: KinerjaMobileCardProps) {
  return (
    <div className="rounded-2xl border border-brand-border bg-bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-bold text-zinc-950">{title}</h3>
          {subtitle && <div className="mt-1 text-xs text-zinc-600">{subtitle}</div>}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {meta.length > 0 && (
        <div className="mt-4 grid gap-2 text-xs text-zinc-600">
          {meta.map((item, index) => (
            <div key={index} className="flex items-start justify-between gap-3">
              <span className="font-semibold text-zinc-500">{item.label}</span>
              <span className="text-right font-medium text-zinc-800">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
