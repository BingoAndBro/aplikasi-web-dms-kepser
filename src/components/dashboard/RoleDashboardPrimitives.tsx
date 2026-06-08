import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { ArrowRight, Inbox } from 'lucide-react'

type RoleDashboardHeaderProps = {
  title: ReactNode
  description: ReactNode
  actionHref?: string
  actionLabel?: ReactNode
  actionIcon?: ReactNode
}

export function RoleDashboardPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1400px] space-y-8 px-7 py-8 sm:px-8 lg:px-10', className)}>
      {children}
    </div>
  )
}

export function RoleDashboardHeader({
  title,
  description,
  actionHref,
  actionLabel,
  actionIcon,
}: RoleDashboardHeaderProps) {
  return (
    <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-headline text-3xl font-black leading-tight tracking-tight text-[#3D332A] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#7A622E]">
          {description}
        </p>
      </div>
      {actionHref && actionLabel && (
        <Button
          nativeButton={false}
          render={<a href={actionHref} />}
          className="h-11 w-full gap-2 rounded-xl bg-[#FF5A00] px-5 text-sm font-extrabold text-white shadow-sm shadow-orange-500/20 hover:bg-[#EA580C] sm:w-auto"
        >
          {actionIcon}
          {actionLabel}
        </Button>
      )}
    </section>
  )
}

type DashboardMetricCardProps = {
  label: ReactNode
  value: ReactNode
  badge?: ReactNode
  icon: ReactNode
  tone?: 'sky' | 'rose' | 'emerald' | 'amber' | 'orange' | 'zinc'
  valueClassName?: string
}

const metricToneClassName: Record<NonNullable<DashboardMetricCardProps['tone']>, {
  border: string
  icon: string
  badge: string
  label: string
  glow: string
  accent: string
}> = {
  sky: {
    border: 'border-sky-200',
    icon: 'border-sky-100 bg-sky-50 text-sky-600',
    badge: 'bg-sky-50 text-sky-700',
    label: 'text-sky-700',
    glow: 'hover:border-sky-300 hover:shadow-[0_18px_42px_rgba(14,165,233,0.18)]',
    accent: 'from-sky-100/80 via-white/40 to-transparent',
  },
  rose: {
    border: 'border-rose-200',
    icon: 'border-rose-100 bg-rose-50 text-rose-600',
    badge: 'bg-rose-50 text-rose-700',
    label: 'text-rose-700',
    glow: 'hover:border-rose-300 hover:shadow-[0_18px_42px_rgba(244,63,94,0.18)]',
    accent: 'from-rose-100/80 via-white/40 to-transparent',
  },
  emerald: {
    border: 'border-emerald-200',
    icon: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    badge: 'bg-emerald-50 text-emerald-700',
    label: 'text-emerald-700',
    glow: 'hover:border-emerald-300 hover:shadow-[0_18px_42px_rgba(16,185,129,0.18)]',
    accent: 'from-emerald-100/80 via-white/40 to-transparent',
  },
  amber: {
    border: 'border-amber-200',
    icon: 'border-amber-100 bg-amber-50 text-amber-700',
    badge: 'bg-amber-50 text-amber-700',
    label: 'text-amber-700',
    glow: 'hover:border-amber-300 hover:shadow-[0_18px_42px_rgba(245,158,11,0.2)]',
    accent: 'from-amber-100/80 via-white/40 to-transparent',
  },
  orange: {
    border: 'border-orange-200',
    icon: 'border-orange-100 bg-orange-50 text-orange-700',
    badge: 'bg-orange-50 text-orange-700',
    label: 'text-orange-700',
    glow: 'hover:border-orange-300 hover:shadow-[0_18px_42px_rgba(249,115,22,0.2)]',
    accent: 'from-orange-100/80 via-white/40 to-transparent',
  },
  zinc: {
    border: 'border-zinc-200',
    icon: 'border-zinc-100 bg-zinc-50 text-zinc-600',
    badge: 'bg-zinc-50 text-zinc-700',
    label: 'text-zinc-700',
    glow: 'hover:border-zinc-300 hover:shadow-[0_18px_42px_rgba(63,63,70,0.14)]',
    accent: 'from-zinc-100/80 via-white/40 to-transparent',
  },
}

export function DashboardMetricCard({
  label,
  value,
  badge,
  icon,
  tone = 'orange',
  valueClassName,
}: DashboardMetricCardProps) {
  const toneClass = metricToneClassName[tone]

  return (
    <div
      className={cn(
        'group relative flex min-h-[150px] flex-col overflow-hidden rounded-[22px] border bg-[#FFFDF9] p-5 shadow-[0_3px_14px_rgba(15,23,42,0.07)] transition-all duration-300 ease-out hover:-translate-y-2 hover:scale-[1.018] active:translate-y-0 active:scale-[0.995]',
        toneClass.border,
        toneClass.glow,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100',
          toneClass.accent,
        )}
      />
      <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-white/70 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-80" />
      <div className="relative mb-7 flex items-start justify-between gap-4">
        <div className={cn('flex size-11 items-center justify-center rounded-2xl border shadow-sm transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:rotate-[-4deg] group-hover:scale-110', toneClass.icon)}>
          {icon}
        </div>
        {badge && (
          <span className={cn('rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] transition-transform duration-300 group-hover:-translate-y-0.5', toneClass.badge)}>
            {badge}
          </span>
        )}
      </div>
      <div className="relative mt-auto transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
        <div className={cn('font-headline text-3xl font-black leading-none tracking-tight text-zinc-950 transition-transform duration-300 ease-out group-hover:scale-[1.035]', valueClassName)}>
          {value}
        </div>
        <p className={cn('mt-2 text-xs font-extrabold leading-tight', toneClass.label)}>
          {label}
        </p>
      </div>
    </div>
  )
}

type DashboardSectionProps = {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}

export function DashboardSection({
  title,
  description,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn('overflow-hidden rounded-[24px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)]', className)}>
      <div className="border-b border-zinc-100 bg-[#F7F3EF] px-5 py-4">
        <h2 className="text-base font-black text-zinc-950">{title}</h2>
        {description && <p className="mt-1 text-xs font-medium leading-5 text-zinc-600">{description}</p>}
      </div>
      {children}
    </section>
  )
}

type DashboardActionRowProps = {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  href: string
  actionLabel: ReactNode
}

export function DashboardActionRow({
  icon,
  title,
  description,
  meta,
  href,
  actionLabel,
}: DashboardActionRowProps) {
  return (
    <a
      href={href}
      className="group flex cursor-pointer flex-col gap-4 border-b border-zinc-100 px-5 py-4 transition last:border-b-0 hover:bg-[#FFF8F1] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-orange-700">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-sm font-extrabold text-zinc-950 transition group-hover:text-[#FF4D00]">
            {title}
          </h3>
          {description && <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-zinc-600">{description}</p>}
          {meta && <div className="mt-2 text-[11px] font-semibold text-zinc-500">{meta}</div>}
        </div>
      </div>
      <span className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-orange-100 bg-orange-50 px-4 text-xs font-extrabold text-[#FF4D00] shadow-sm transition group-hover:border-orange-200 group-hover:bg-orange-100 sm:w-auto">
        {actionLabel}
        <ArrowRight size={14} />
      </span>
    </a>
  )
}

type DashboardQuickActionsProps = {
  title?: ReactNode
  description?: ReactNode
  actions: Array<{ href: string; label: ReactNode; icon: ReactNode }>
  className?: string
}

export function DashboardQuickActions({
  title = 'Aksi Cepat',
  description,
  actions,
  className,
}: DashboardQuickActionsProps) {
  return (
    <aside className={cn('rounded-[24px] border border-zinc-200/80 bg-[#FFFDF9] p-5 shadow-[0_3px_14px_rgba(15,23,42,0.07)]', className)}>
      <h2 className="text-base font-black text-zinc-950">{title}</h2>
      {description && <p className="mt-1 text-xs font-medium leading-5 text-zinc-600">{description}</p>}
      <div className="mt-4 grid gap-3">
        {actions.map((action) => (
          <a
            key={action.href}
            href={action.href}
            className="group flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-[#FFFDF9] px-3 py-2.5 text-sm font-extrabold text-zinc-900 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#FF4D00]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700 transition group-hover:bg-orange-600 group-hover:text-white">
                {action.icon}
              </span>
              <span className="line-clamp-1">{action.label}</span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-zinc-400 transition group-hover:text-[#FF4D00]" />
          </a>
        ))}
      </div>
    </aside>
  )
}

export function DashboardEmptyState({
  title,
  description,
}: {
  title: ReactNode
  description: ReactNode
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-zinc-100 bg-zinc-50 text-zinc-300 shadow-sm">
        <Inbox size={28} />
      </div>
      <h3 className="text-sm font-extrabold text-zinc-950">{title}</h3>
      <p className="mt-2 max-w-md text-xs font-medium leading-5 text-zinc-600">{description}</p>
    </div>
  )
}

export function formatDashboardCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return '-'
  return `Rp ${new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(value)}`
}
