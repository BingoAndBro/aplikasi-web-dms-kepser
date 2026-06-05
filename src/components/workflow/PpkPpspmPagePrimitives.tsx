import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

type WorkflowRoleTone = 'ppk' | 'ppspm'

const toneClassName: Record<WorkflowRoleTone, string> = {
  ppk: 'border-orange-100 bg-[#FFF8F1] text-orange-800',
  ppspm: 'border-orange-100 bg-[#FFF8F1] text-orange-800',
}

type WorkflowPageHeaderProps = {
  tone?: WorkflowRoleTone
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function WorkflowPageHeader({
  tone = 'ppk',
  eyebrow,
  title,
  description,
  actions,
  className,
}: WorkflowPageHeaderProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border p-5 shadow-sm sm:p-6',
        toneClassName[tone],
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

type WorkflowPanelProps = {
  children: ReactNode
  className?: string
}

export function WorkflowPanel({ children, className }: WorkflowPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-orange-100/80 bg-white p-4 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

type WorkflowSearchPanelProps = {
  search?: string
  onSearchChange?: (value: string) => void
  placeholder?: string
  children?: ReactNode
  resultLabel?: ReactNode
}

export function WorkflowSearchPanel({
  search,
  onSearchChange,
  placeholder = 'Cari dokumen...',
  children,
  resultLabel,
}: WorkflowSearchPanelProps) {
  return (
    <WorkflowPanel className="p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          {onSearchChange && (
            <label className="relative min-w-0 flex-1 md:max-w-md">
              <span className="sr-only">Cari dokumen</span>
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-700/50"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder={placeholder}
                value={search ?? ''}
                onChange={(event) => onSearchChange(event.target.value)}
                className="h-10 w-full rounded-xl border border-orange-100 bg-[#FFFDF9] pl-9 pr-4 text-sm text-zinc-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70 placeholder:text-zinc-400"
              />
            </label>
          )}
          {children}
        </div>
        {resultLabel && (
          <div className="text-xs font-semibold text-zinc-500">
            {resultLabel}
          </div>
        )}
      </div>
    </WorkflowPanel>
  )
}

export function WorkflowTableShell({ children, className }: WorkflowPanelProps) {
  return (
    <div
      className={cn(
        'hidden overflow-hidden rounded-2xl border border-orange-100/80 bg-white shadow-sm md:block',
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

type WorkflowMobileListProps = {
  children: ReactNode
  className?: string
}

export function WorkflowMobileList({ children, className }: WorkflowMobileListProps) {
  return (
    <div className={cn('grid gap-3 md:hidden', className)}>
      {children}
    </div>
  )
}

type WorkflowMobileCardProps = {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  meta?: Array<{ label: ReactNode; value: ReactNode; wide?: boolean }>
  action?: ReactNode
}

export function WorkflowMobileCard({
  title,
  subtitle,
  status,
  meta = [],
  action,
}: WorkflowMobileCardProps) {
  return (
    <div className="rounded-2xl border border-orange-100/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-bold text-zinc-950">{title}</h3>
          {subtitle && <div className="mt-1 text-xs text-zinc-600">{subtitle}</div>}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {meta.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-600">
          {meta.map((item, index) => (
            <div
              key={index}
              className={cn(
                'min-w-0 rounded-xl border border-orange-100 bg-[#FFFDF9] p-2.5',
                item.wide && 'col-span-2',
              )}
            >
              <p className="font-semibold text-zinc-500">{item.label}</p>
              <div className="mt-0.5 break-words font-medium text-zinc-900">{item.value}</div>
            </div>
          ))}
        </div>
      )}
      {action && <div className="mt-4 border-t border-orange-100 pt-3">{action}</div>}
    </div>
  )
}

const documentListStatusClassName: Record<string, string> = {
  DRAFT: 'border-slate-200 bg-slate-50 text-slate-700',
  IN_PPK_VALIDATION: 'border-amber-200 bg-amber-50 text-amber-700',
  IN_BENDAHARA_APPROVAL: 'border-sky-200 bg-sky-50 text-sky-700',
  NEED_REVISION: 'border-rose-200 bg-rose-50 text-rose-700',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  TERSIMPAN: 'border-slate-200 bg-slate-50 text-slate-700',
  ARCHIVED: 'border-slate-200 bg-slate-50 text-slate-700',
}

const documentListStatusLabel: Record<string, string> = {
  DRAFT: 'Draft',
  IN_PPK_VALIDATION: 'Validasi PPK',
  IN_BENDAHARA_APPROVAL: 'Menunggu Persetujuan',
  NEED_REVISION: 'Perlu Revisi',
  COMPLETED: 'Selesai',
  TERSIMPAN: 'Tersimpan',
  ARCHIVED: 'Diarsipkan',
}

type DocumentListStatusBadgeProps = {
  status: string | null | undefined
  label?: ReactNode
  className?: string
}

export function DocumentListStatusBadge({
  status,
  label,
  className,
}: DocumentListStatusBadgeProps) {
  const key = status ?? ''
  const resolvedLabel = label ?? documentListStatusLabel[key] ?? 'Status'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase text-nowrap',
        documentListStatusClassName[key] ?? 'border-slate-200 bg-slate-50 text-slate-700',
        className,
      )}
      title={typeof resolvedLabel === 'string' ? resolvedLabel : undefined}
    >
      {resolvedLabel}
    </span>
  )
}

type WorkflowFieldCardProps = {
  label: ReactNode
  value: ReactNode
  className?: string
}

export function WorkflowFieldCard({
  label,
  value,
  className,
}: WorkflowFieldCardProps) {
  return (
    <div className={cn('rounded-xl border border-orange-100 bg-[#FFFDF9] p-3', className)}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <div className="text-sm font-semibold leading-relaxed text-zinc-950">
        {value}
      </div>
    </div>
  )
}

type WorkflowPaginationProps = {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

export function WorkflowPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: WorkflowPaginationProps) {
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
      <span className="rounded-full border border-orange-100 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
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

type WorkflowStep = {
  key: string
  label: string
}

type WorkflowTimelineProps = {
  steps: WorkflowStep[]
  status: string
  currentIndex: number
  revisionStepKey?: string
  revisionIcon?: ReactNode
}

export function WorkflowTimeline({
  steps,
  status,
  currentIndex,
  revisionStepKey,
  revisionIcon,
}: WorkflowTimelineProps) {
  return (
    <WorkflowPanel>
      <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        Alur Dokumen
      </p>
      <div className="flex items-center gap-0">
        {steps.map((step, index) => {
          const isCurrent = step.key === status
          const isPast = currentIndex > index || status === 'COMPLETED'
          const showAsRevision = status === 'NEED_REVISION' && step.key === revisionStepKey

          return (
            <div key={step.key} className="relative flex flex-1 flex-col items-center">
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'absolute right-[-50%] top-4 z-0 h-0.5 w-full',
                    isPast ? 'bg-orange-500' : 'bg-orange-100',
                  )}
                />
              )}
              <div
                className={cn(
                  'relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  isCurrent || showAsRevision || isPast
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-orange-100 bg-[#FFFDF9] text-zinc-400',
                )}
              >
                {showAsRevision ? revisionIcon : index + 1}
              </div>
              <span
                className={cn(
                  'mt-2 text-center text-[10px] font-semibold',
                  isCurrent || showAsRevision || isPast ? 'text-orange-700' : 'text-zinc-400',
                )}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </WorkflowPanel>
  )
}

type RevisionNotePanelProps = {
  title: ReactNode
  children: ReactNode
}

export function RevisionNotePanel({ title, children }: RevisionNotePanelProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <p className="mb-1 text-xs font-black uppercase tracking-[0.16em] text-amber-700">
        {title}
      </p>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

type WorkflowDashboardCardProps = {
  title: ReactNode
  description: ReactNode
  href: string
  icon: ReactNode
}

export function WorkflowDashboardCard({
  title,
  description,
  href,
  icon,
}: WorkflowDashboardCardProps) {
  return (
    <a
      href={href}
      className="group cursor-pointer rounded-2xl border border-orange-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-700 transition group-hover:bg-orange-600 group-hover:text-white">
        {icon}
      </div>
      <h2 className="font-headline text-lg font-extrabold text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{description}</p>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-orange-700">
        Buka halaman
      </p>
    </a>
  )
}
