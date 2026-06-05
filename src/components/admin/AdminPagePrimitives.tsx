import type { ReactNode } from 'react'

import { Search } from 'lucide-react'

import { cn } from '#/lib/utils'

type AdminPageHeaderProps = {
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: AdminPageHeaderProps) {
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

type AdminPanelProps = {
  children: ReactNode
  className?: string
}

export function AdminPanel({ children, className }: AdminPanelProps) {
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

type AdminSummaryCardProps = {
  label: ReactNode
  value: ReactNode
  helper?: ReactNode
  icon?: ReactNode
  emphasis?: boolean
  className?: string
}

export function AdminSummaryCard({
  label,
  value,
  helper,
  icon,
  emphasis = false,
  className,
}: AdminSummaryCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 shadow-sm',
        emphasis
          ? 'border-orange-200 bg-gradient-to-br from-orange-50 via-[#FFFDF9] to-[#FFF8F1]'
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
              emphasis && 'text-orange-900',
            )}
          >
            {value}
          </div>
        </div>
        {icon && (
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-2xl',
              emphasis ? 'bg-orange-100 text-orange-800' : 'bg-orange-50 text-orange-700',
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

type AdminSearchPanelProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  children?: ReactNode
  resultText?: ReactNode
  helperText?: ReactNode
}

export function AdminSearchPanel({
  id,
  label,
  value,
  onChange,
  placeholder,
  children,
  resultText,
  helperText,
}: AdminSearchPanelProps) {
  return (
    <AdminPanel className="p-3">
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
    </AdminPanel>
  )
}

export function AdminTableShell({ children, className }: AdminPanelProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-orange-100 bg-[#FFFDF9] shadow-sm',
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

type AdminNoticeProps = {
  tone?: 'info' | 'success' | 'warning' | 'destructive'
  children: ReactNode
  className?: string
}

const noticeToneClassName: Record<NonNullable<AdminNoticeProps['tone']>, string> = {
  info: 'border-orange-200 bg-orange-50 text-orange-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  destructive: 'border-red-200 bg-red-50 text-red-900',
}

export function AdminNotice({
  tone = 'info',
  children,
  className,
}: AdminNoticeProps) {
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

type AdminStepCardProps = {
  step: number
  title: ReactNode
  description?: ReactNode
  active?: boolean
  complete?: boolean
  children?: ReactNode
}

export function AdminStepCard({
  step,
  title,
  description,
  active = false,
  complete = false,
  children,
}: AdminStepCardProps) {
  return (
    <AdminPanel
      className={cn(
        'space-y-4',
        active && 'border-orange-200 bg-orange-50/40',
        complete && 'border-emerald-200 bg-emerald-50/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black',
            complete
              ? 'bg-emerald-600 text-white'
              : active
                ? 'bg-orange-600 text-white'
                : 'bg-orange-50 text-orange-700',
          )}
        >
          {step}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-zinc-950">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">{description}</p>
          )}
        </div>
      </div>
      {children}
    </AdminPanel>
  )
}
