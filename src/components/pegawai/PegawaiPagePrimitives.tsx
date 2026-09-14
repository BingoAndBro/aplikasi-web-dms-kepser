import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import { DATA_SEARCH_ICON_TONE_CLASS, DATA_SEARCH_INPUT_TONE_CLASS } from '#/lib/data-table-classes'
import { cn } from '#/lib/utils'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

type PegawaiPageHeaderProps = {
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PegawaiPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PegawaiPageHeaderProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-orange-100 bg-brand-surface p-5 shadow-sm sm:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-700/70">
            {eyebrow}
          </div>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
            {title}
          </h1>
          {description && (
            <div className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700">
              {description}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

type PegawaiPanelProps = ComponentPropsWithoutRef<'div'> & {
  children: ReactNode
}

export function PegawaiPanel({ children, className, ...props }: PegawaiPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-orange-100/80 bg-bg-surface p-4 shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

type PegawaiSearchPanelProps = {
  search: string
  onSearchChange: (value: string) => void
  placeholder: string
  children?: ReactNode
  resultLabel?: ReactNode
}

export function PegawaiSearchPanel({
  search,
  onSearchChange,
  placeholder,
  children,
  resultLabel,
}: PegawaiSearchPanelProps) {
  return (
    <PegawaiPanel className="p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1 md:max-w-md">
            <span className="sr-only">Cari dokumen</span>
            <Search
              size={15}
              className={cn('absolute left-3 top-1/2 -translate-y-1/2', DATA_SEARCH_ICON_TONE_CLASS)}
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder={placeholder}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className={cn('h-10 w-full rounded-xl border pl-9 pr-4 text-sm', DATA_SEARCH_INPUT_TONE_CLASS)}
            />
          </label>
          {children}
        </div>
        {resultLabel && (
          <div className="text-xs font-semibold text-zinc-500">
            {resultLabel}
          </div>
        )}
      </div>
    </PegawaiPanel>
  )
}

type PegawaiFieldCardProps = {
  label: ReactNode
  value: ReactNode
  className?: string
}

export function PegawaiFieldCard({
  label,
  value,
  className,
}: PegawaiFieldCardProps) {
  return (
    <div className={cn('rounded-xl border border-orange-100 bg-bg-surface p-3', className)}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <div className="text-sm font-semibold leading-relaxed text-zinc-950">
        {value}
      </div>
    </div>
  )
}

type PegawaiPaginationProps = {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

export function PegawaiPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: PegawaiPaginationProps) {
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
