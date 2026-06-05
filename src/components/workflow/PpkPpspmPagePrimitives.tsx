import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { cn } from '#/lib/utils'
import { ChevronLeft, ChevronRight, Clock3, Search } from 'lucide-react'

type WorkflowRoleTone = 'ppk' | 'ppspm'

const toneClassName: Record<WorkflowRoleTone, string> = {
  ppk: 'border-orange-100 bg-[#FFF8F1] text-orange-800',
  ppspm: 'border-orange-100 bg-[#FFF8F1] text-orange-800',
}

export const WORKFLOW_TABLE_HEAD_CLASS = 'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'

type WorkflowPageHeaderProps = {
  tone?: WorkflowRoleTone
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  variant?: 'panel' | 'list'
}

export function WorkflowPageHeader({
  tone = 'ppk',
  eyebrow,
  title,
  description,
  actions,
  className,
  variant = 'panel',
}: WorkflowPageHeaderProps) {
  if (variant === 'list') {
    return (
      <section className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
        <div className="flex min-w-0 items-start gap-5">
          <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-[#FFF6EA] text-orange-600 shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
            {eyebrow}
          </div>
          <div className="min-w-0">
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
  placeholder = 'Cari judul, fungsi, atau kegiatan...',
  children,
  resultLabel,
}: WorkflowSearchPanelProps) {
  return (
    <WorkflowPanel className="rounded-[26px] border-zinc-200/80 p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {onSearchChange && (
          <label className="relative min-w-0 flex-1 lg:max-w-xl">
            <span className="sr-only">Cari dokumen</span>
            <Search
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={placeholder}
              value={search ?? ''}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-10 w-full rounded-[20px] border border-zinc-200 bg-white pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-orange-200 focus:ring-4 focus:ring-orange-100/60"
            />
          </label>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {children}
          {resultLabel && (
            <div className="shrink-0 text-xs font-medium text-zinc-600 sm:text-right">
              {resultLabel}
            </div>
          )}
        </div>
      </div>
    </WorkflowPanel>
  )
}

type WorkflowStatusSelectOption = {
  value: string
  label: string
}

type WorkflowStatusSelectProps = {
  value: string
  onChange: (value: string) => void
  options: WorkflowStatusSelectOption[]
  ariaLabel?: string
  className?: string
}

export function WorkflowStatusSelect({
  value,
  onChange,
  options,
  ariaLabel = 'Filter status',
  className,
}: WorkflowStatusSelectProps) {
  const normalizedValue = value || 'ALL'

  return (
    <Select
      value={normalizedValue}
      onValueChange={(nextValue) => onChange(nextValue === 'ALL' ? '' : nextValue ?? '')}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          'h-11 w-full min-w-[148px] rounded-[22px] border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-950 shadow-[0_2px_8px_rgba(15,23,42,0.08)] hover:border-zinc-300 hover:bg-[#FFFDF9] focus-visible:border-orange-200 focus-visible:ring-orange-100/70 sm:w-fit [&_svg]:text-zinc-950',
          className,
        )}
      >
        <SelectValue>
          {(selectedValue) => options.find(option => option.value === selectedValue)?.label ?? 'Semua Status'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        sideOffset={8}
        className="rounded-[18px] border border-zinc-100 bg-white p-2 shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
      >
        {options.map(option => (
          <SelectItem
            key={option.value}
            value={option.value}
            label={option.label}
            className="min-h-10 rounded-xl px-3 py-2 text-sm font-medium text-zinc-900 focus:bg-[#FFF1E6] focus:text-[#FF4D00] data-[selected]:bg-[#FFF1E6] data-[selected]:text-[#FF4D00]"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function WorkflowTableShell({ children, className }: WorkflowPanelProps) {
  return (
    <div
      className={cn(
        'hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block',
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
    <div className="group rounded-[22px] border border-zinc-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:border-orange-100 hover:bg-[#FFFDF9]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{title}</h3>
          {subtitle && <div className="mt-1 text-xs font-medium text-zinc-500">{subtitle}</div>}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {meta.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-600">
          {meta.map((item, index) => (
            <div
              key={index}
              className={cn(
                'min-w-0 rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5',
                item.wide && 'col-span-2',
              )}
            >
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
        'inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-nowrap',
        documentListStatusClassName[key] ?? 'border-slate-200 bg-slate-50 text-slate-700',
        className,
      )}
      title={typeof resolvedLabel === 'string' ? resolvedLabel : undefined}
    >
      {resolvedLabel}
    </span>
  )
}

export function WorkflowDateCell({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-semibold text-zinc-500', className)}>
      <Clock3 size={16} strokeWidth={1.8} className="shrink-0 text-zinc-500" aria-hidden="true" />
      {value}
    </span>
  )
}

export function WorkflowActionButton({ label }: { label: string }) {
  return (
    <Button
      size="icon-lg"
      variant="ghost"
      className="size-10 rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 opacity-100 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-orange-200 group-hover:bg-orange-50 group-hover:text-orange-600 group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] [&_svg]:!size-5"
      aria-label={label}
    >
      <ChevronRight strokeWidth={2.35} />
    </Button>
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
