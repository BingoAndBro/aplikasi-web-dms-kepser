import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import {
  DATA_SEARCH_ICON_TONE_CLASS,
  DATA_SEARCH_INPUT_TONE_CLASS,
  DATA_TABLE_BODY_ROW_TONE_CLASS,
  DATA_TABLE_SHELL_TONE_CLASS,
} from '#/lib/data-table-classes'
import { cn } from '#/lib/utils'
import { ChevronLeft, ChevronRight, Download, FolderOpen, Search } from 'lucide-react'

export const ARCHIVE_PAGE_CONTAINER_CLASS =
  'mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10'

export const ARCHIVE_DETAIL_CONTAINER_CLASS =
  'mx-auto w-full max-w-[92rem] space-y-4 px-4 py-4 sm:px-6 lg:px-7 lg:py-5'

export const ARCHIVE_TABLE_HEAD_CLASS =
  'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'

export const ARCHIVE_TABLE_ROW_CLASS = cn('group', DATA_TABLE_BODY_ROW_TONE_CLASS)

export const ARCHIVE_INLINE_ACTION_CLASS =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-border-default bg-surface px-3 text-xs font-bold text-zinc-600 shadow-sm transition hover:border-brand-border hover:bg-brand-surface hover:text-brand-text'

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
    <section
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-5">
        <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-[#FFF6EA] text-orange-600 shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
          <FolderOpen size={22} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">
            {eyebrow}
          </div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
            {title}
          </h1>
          {description && (
            <div className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </section>
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
        'rounded-[1.15rem] border border-orange-100/80 bg-bg-surface p-4 shadow-sm shadow-zinc-950/[0.035]',
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
    <ArchivePanel className="rounded-[26px] border-border-default p-4 shadow-[0_2px_12px_var(--shadow-card)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="relative min-w-0 flex-1 lg:max-w-xl" htmlFor={id}>
            <span className="sr-only">{label}</span>
            <Search
              size={17}
              className={cn('absolute left-4 top-1/2 -translate-y-1/2', DATA_SEARCH_ICON_TONE_CLASS)}
              aria-hidden="true"
            />
            <input
              id={id}
              type="search"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className={cn('h-10 w-full rounded-[20px] border pl-11 pr-4 text-sm font-medium', DATA_SEARCH_INPUT_TONE_CLASS)}
              placeholder={placeholder}
              autoComplete="off"
            />
          </label>
          {children}
        </div>
        {resultText && (
          <div className="shrink-0 text-xs font-medium text-zinc-600 lg:text-right">
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

type ArchiveExportButtonProps = {
  disabled?: boolean
  title?: string
  onClick: () => void
}

export function ArchiveExportButton({
  disabled,
  title,
  onClick,
}: ArchiveExportButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-10 w-fit gap-1.5 rounded-xl border-orange-200/80 bg-brand-surface px-3 text-xs font-extrabold text-brand-text shadow-sm shadow-orange-500/10 transition hover:border-orange-300 hover:bg-orange-50 hover:text-brand-solid-hover disabled:opacity-50"
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <Download size={14} />
      Ekspor CSV
    </Button>
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
        'rounded-[1.15rem] border border-orange-100 bg-bg-surface p-4 shadow-sm shadow-zinc-950/[0.035]',
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
        'hidden overflow-hidden rounded-[26px] border md:block',
        DATA_TABLE_SHELL_TONE_CLASS,
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
    <div className="group rounded-[22px] border border-zinc-200/80 bg-bg-surface p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:border-orange-100 hover:bg-brand-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-zinc-950 transition-colors group-hover:text-brand-text">
            {title}
          </h3>
          {subtitle && <div className="mt-1 text-xs text-zinc-600">{subtitle}</div>}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {meta.length > 0 && (
        <div className="mt-4 grid gap-2 text-xs text-zinc-600">
          {meta.map((item, index) => (
            <div key={index} className="min-w-0 rounded-xl border border-zinc-200/80 bg-bg-surface p-2.5">
              <p className="font-semibold text-zinc-500">{item.label}</p>
              <div className="mt-0.5 break-words font-medium text-zinc-900">{item.value}</div>
            </div>
          ))}
        </div>
      )}
      {action && <div className="mt-4 border-t border-zinc-100 pt-3">{action}</div>}
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
    <div className={cn('rounded-xl border border-orange-100 bg-bg-surface p-3 shadow-sm shadow-zinc-950/[0.025]', className)}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <div className="text-sm font-semibold leading-relaxed text-zinc-950">
        {value}
      </div>
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
      <span className="rounded-full border border-orange-100 bg-bg-surface px-3 py-1 text-xs font-semibold text-zinc-600">
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
    <div className="w-fit max-w-full overflow-x-auto rounded-xl border border-brand-border bg-[#F7F2EC] p-1 shadow-sm">
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
                  ? 'bg-bg-surface text-brand-solid shadow-sm'
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
