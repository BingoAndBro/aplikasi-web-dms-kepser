import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

export const ARCHIVE_PAGE_CONTAINER_CLASS =
  'mx-auto w-full max-w-[1280px] space-y-7 px-4 pt-4 sm:px-6 lg:px-8'

export const ARCHIVE_DETAIL_CONTAINER_CLASS =
  'mx-auto w-full max-w-[92rem] space-y-4 px-4 py-4 sm:px-6 lg:px-7 lg:py-5'

export const ARCHIVE_TABLE_HEAD_CLASS =
  'px-5 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500'

export const ARCHIVE_TABLE_ROW_CLASS =
  'group border-t border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70'

export const ARCHIVE_INLINE_ACTION_CLASS =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-zinc-200/80 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700'

type ArchivePageHeaderProps = {
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function ArchivePageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: ArchivePageHeaderProps) {
  return (
    <div
      className={cn(
        'rounded-[1.35rem] border border-orange-100/80 bg-gradient-to-br from-[#FFF8F1] via-[#FFFDF9] to-orange-50/60 p-5 shadow-sm shadow-zinc-950/[0.035] sm:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-700/70">
            {eyebrow}
          </div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
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

type ArchivePanelProps = {
  children: ReactNode
  className?: string
}

export function ArchivePanel({ children, className }: ArchivePanelProps) {
  return (
    <div
      className={cn(
        'rounded-[1.15rem] border border-orange-100/80 bg-[#FFFDF9] p-4 shadow-sm shadow-zinc-950/[0.035]',
        className,
      )}
    >
      {children}
    </div>
  )
}

type ArchiveSearchPanelProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  helperText?: ReactNode
  resultText?: ReactNode
  children?: ReactNode
}

export function ArchiveSearchPanel({
  id,
  label,
  value,
  onChange,
  placeholder,
  helperText,
  resultText,
  children,
}: ArchiveSearchPanelProps) {
  return (
    <ArchivePanel className="p-3.5">
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
    </ArchivePanel>
  )
}

type ArchiveSummaryCardProps = {
  label: ReactNode
  value: ReactNode
  helper?: ReactNode
  icon?: ReactNode
  className?: string
}

export function ArchiveSummaryCard({
  label,
  value,
  helper,
  icon,
  className,
}: ArchiveSummaryCardProps) {
  return (
    <div
      className={cn(
        'rounded-[1.15rem] border border-orange-100 bg-[#FFFDF9] p-4 shadow-sm shadow-zinc-950/[0.035]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
            {label}
          </p>
          <div className="mt-2 font-headline text-2xl font-extrabold text-zinc-950">
            {value}
          </div>
        </div>
        {icon && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
            {icon}
          </div>
        )}
      </div>
      {helper && <div className="mt-2 text-xs text-zinc-600">{helper}</div>}
    </div>
  )
}

export function ArchiveTableShell({ children, className }: ArchivePanelProps) {
  return (
    <div
      className={cn(
        'hidden overflow-hidden rounded-[1.35rem] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block',
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

type ArchiveMobileListProps = {
  children: ReactNode
  className?: string
}

export function ArchiveMobileList({ children, className }: ArchiveMobileListProps) {
  return <div className={cn('grid gap-3 md:hidden', className)}>{children}</div>
}

type ArchiveMobileCardProps = {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  meta?: Array<{ label: ReactNode; value: ReactNode }>
  action?: ReactNode
}

export function ArchiveMobileCard({
  title,
  subtitle,
  status,
  meta = [],
  action,
}: ArchiveMobileCardProps) {
  return (
    <div className="rounded-[1.15rem] border border-zinc-200/80 bg-[#FFFDF9] p-4 shadow-sm shadow-zinc-950/[0.035]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-bold text-zinc-950">
            {title}
          </h3>
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
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

type ArchiveFieldCardProps = {
  label: ReactNode
  value: ReactNode
  className?: string
}

export function ArchiveFieldCard({
  label,
  value,
  className,
}: ArchiveFieldCardProps) {
  return (
    <div className={cn('rounded-xl border border-orange-100 bg-[#FFFDF9] p-3 shadow-sm shadow-zinc-950/[0.025]', className)}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <div className="text-sm font-semibold leading-relaxed text-zinc-950">
        {value}
      </div>
    </div>
  )
}

type ArchiveNoticeProps = {
  tone?: 'info' | 'success' | 'warning' | 'destructive'
  children: ReactNode
  className?: string
}

const noticeToneClassName: Record<NonNullable<ArchiveNoticeProps['tone']>, string> = {
  info: 'border-orange-200 bg-orange-50 text-orange-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  destructive: 'border-red-200 bg-red-50 text-red-900',
}

export function ArchiveNotice({
  tone = 'info',
  children,
  className,
}: ArchiveNoticeProps) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-xs leading-relaxed shadow-sm',
        noticeToneClassName[tone],
        className,
      )}
    >
      {children}
    </div>
  )
}

type ArchivePaginationProps = {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

export function ArchivePagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: ArchivePaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        size="icon-xs"
        variant="outline"
        aria-label="Halaman sebelumnya"
        onClick={onPrevious}
        disabled={page === 0}
      >
        <ChevronLeft size={14} />
      </Button>
      <span className="rounded-full border border-orange-100 bg-[#FFFDF9] px-3 py-1 text-xs font-semibold text-zinc-600">
        Halaman {page + 1} dari {totalPages}
      </span>
      <Button
        size="icon-xs"
        variant="outline"
        aria-label="Halaman berikutnya"
        onClick={onNext}
        disabled={page >= totalPages - 1}
      >
        <ChevronRight size={14} />
      </Button>
    </div>
  )
}

type ArchiveTabsProps<T extends string> = {
  tabs: Array<{ id: T; label: ReactNode }>
  activeTab: T
  onChange: (tab: T) => void
}

export function ArchiveTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
}: ArchiveTabsProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#F0E1D5] bg-[#F7F2EC] p-1 shadow-sm">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-2 text-xs font-bold transition',
                active
                  ? 'bg-[#FFFDF9] text-[#FF5A00] shadow-sm'
                  : 'text-zinc-500 hover:bg-[#FFFAF6] hover:text-zinc-950',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
