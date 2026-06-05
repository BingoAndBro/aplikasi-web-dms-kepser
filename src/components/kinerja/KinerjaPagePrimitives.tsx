import type { ReactNode } from 'react'

import { Search } from 'lucide-react'

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
        'rounded-3xl border border-orange-100 bg-gradient-to-br from-[#FFF8F1] via-[#FFFDF9] to-orange-50/70 p-5 shadow-sm sm:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-700/70">
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
        'rounded-2xl border border-orange-100/80 bg-[#FFFDF9] p-4 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

type KinerjaSummaryCardProps = {
  label: ReactNode
  value: ReactNode
  helper?: ReactNode
  icon?: ReactNode
  emphasis?: boolean
  className?: string
}

export function KinerjaSummaryCard({
  label,
  value,
  helper,
  icon,
  emphasis = false,
  className,
}: KinerjaSummaryCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 shadow-sm',
        emphasis
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-[#FFFDF9] to-[#FFF8F1]'
          : 'border-orange-100 bg-[#FFFDF9]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
            {label}
          </p>
          <div
            className={cn(
              'mt-2 font-headline text-2xl font-extrabold text-zinc-950',
              emphasis && 'text-emerald-900',
            )}
          >
            {value}
          </div>
        </div>
        {icon && (
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-2xl',
              emphasis ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-50 text-orange-700',
            )}
          >
            {icon}
          </div>
        )}
      </div>
      {helper && <div className="mt-2 text-xs leading-relaxed text-zinc-600">{helper}</div>}
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
              className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-700/50"
              aria-hidden="true"
            />
            <input
              id={id}
              type="search"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="h-10 w-full rounded-xl border border-orange-100 bg-[#FFFDF9] pl-9 pr-4 text-sm font-semibold text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
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
        'hidden overflow-hidden rounded-2xl border border-orange-100 bg-[#FFFDF9] shadow-sm lg:block',
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
    <div className="rounded-2xl border border-orange-100 bg-[#FFFDF9] p-4 shadow-sm">
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

type KinerjaNoticeProps = {
  children: ReactNode
  className?: string
}

export function KinerjaNotice({ children, className }: KinerjaNoticeProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}
