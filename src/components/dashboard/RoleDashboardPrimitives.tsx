import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import type { Tone } from '#/lib/tone'
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
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-brand-text-muted">
          {description}
        </p>
      </div>
      {actionHref && actionLabel && (
        <Button
          nativeButton={false}
          render={<a href={actionHref} />}
          className="h-11 w-full gap-2 rounded-xl bg-brand-solid px-5 text-sm font-extrabold text-white shadow-sm shadow-brand-solid/20 hover:bg-brand-solid-hover sm:w-auto"
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
  tone?: MetricTone
  valueClassName?: string
}

// border/icon/badge/label draw from the shared semantic tokens (src/styles.css
// Group 3); glow/accent are card-specific decoration kept local rather than
// added to the shared toneClasses() helper (plan Fase 2: "glow/accent ->
// lapisan extension, bukan core"). Re-keyed from Tailwind color names
// (sky/rose/emerald/amber/orange/zinc) to semantic Tone — "zinc" was
// confirmed unused at every one of the 23 call sites, "orange" was the
// unused default; both are now folded into "neutral"/"brand" respectively.
// "brand-fixed" (PPSPM identity, Fase 8) has no dashboard-card styling.
type MetricTone = Exclude<Tone, 'brand-fixed'>

const metricToneExtra: Record<MetricTone, { glow: string; accent: string }> = {
  info: {
    glow: 'hover:border-info-border hover:shadow-[0_18px_42px_rgba(14,165,233,0.18)]',
    accent: 'from-info-surface/80 via-white/40 to-transparent',
  },
  danger: {
    glow: 'hover:border-danger-border hover:shadow-[0_18px_42px_rgba(244,63,94,0.18)]',
    accent: 'from-danger-surface/80 via-white/40 to-transparent',
  },
  success: {
    glow: 'hover:border-success-border hover:shadow-[0_18px_42px_rgba(16,185,129,0.18)]',
    accent: 'from-success-surface/80 via-white/40 to-transparent',
  },
  warning: {
    glow: 'hover:border-warning-border hover:shadow-[0_18px_42px_rgba(245,158,11,0.2)]',
    accent: 'from-warning-surface/80 via-white/40 to-transparent',
  },
  brand: {
    glow: 'hover:border-brand-border-strong hover:shadow-[0_18px_42px_rgba(249,115,22,0.2)]',
    accent: 'from-brand-surface/80 via-white/40 to-transparent',
  },
  neutral: {
    glow: 'hover:border-neutral-status-border hover:shadow-[0_18px_42px_rgba(63,63,70,0.14)]',
    accent: 'from-neutral-status-surface/80 via-white/40 to-transparent',
  },
}

const metricToneClassName: Record<MetricTone, {
  border: string
  icon: string
  badge: string
  label: string
  glow: string
  accent: string
}> = {
  info: { border: 'border-info-border', icon: 'border-info-border bg-info-surface text-info-text', badge: 'bg-info-surface text-info-text', label: 'text-info-text', ...metricToneExtra.info },
  danger: { border: 'border-danger-border', icon: 'border-danger-border bg-danger-surface text-danger-text', badge: 'bg-danger-surface text-danger-text', label: 'text-danger-text', ...metricToneExtra.danger },
  success: { border: 'border-success-border', icon: 'border-success-border bg-success-surface text-success-text', badge: 'bg-success-surface text-success-text', label: 'text-success-text', ...metricToneExtra.success },
  warning: { border: 'border-warning-border', icon: 'border-warning-border bg-warning-surface text-warning-text', badge: 'bg-warning-surface text-warning-text', label: 'text-warning-text', ...metricToneExtra.warning },
  brand: { border: 'border-brand-border', icon: 'border-brand-border bg-brand-surface text-brand-text', badge: 'bg-brand-surface text-brand-text', label: 'text-brand-text', ...metricToneExtra.brand },
  neutral: { border: 'border-neutral-status-border', icon: 'border-neutral-status-border bg-neutral-status-surface text-neutral-status-text', badge: 'bg-neutral-status-surface text-neutral-status-text', label: 'text-neutral-status-text', ...metricToneExtra.neutral },
}

export function DashboardMetricCard({
  label,
  value,
  badge,
  icon,
  tone = 'brand',
  valueClassName,
}: DashboardMetricCardProps) {
  const toneClass = metricToneClassName[tone]

  return (
    <div
      className={cn(
        'group relative flex min-h-[150px] flex-col overflow-hidden rounded-[22px] border bg-bg-surface p-5 shadow-[0_3px_14px_rgba(15,23,42,0.07)] transition-all duration-300 ease-out hover:-translate-y-2 hover:scale-[1.018] active:translate-y-0 active:scale-[0.995]',
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
    <section className={cn('overflow-hidden rounded-[24px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)]', className)}>
      <div className="border-b border-zinc-100 bg-bg-sunken px-5 py-4">
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
      className="group flex cursor-pointer flex-col gap-4 border-b border-zinc-100 px-5 py-4 transition last:border-b-0 hover:bg-brand-surface sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-brand-border bg-brand-surface text-brand-solid-active">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-sm font-extrabold text-zinc-950 transition group-hover:text-brand-text">
            {title}
          </h3>
          {description && <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-zinc-600">{description}</p>}
          {meta && <div className="mt-2 text-[11px] font-semibold text-zinc-500">{meta}</div>}
        </div>
      </div>
      <span className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-brand-surface px-4 text-xs font-extrabold text-brand-text shadow-sm transition group-hover:border-brand-border-strong group-hover:bg-brand-border sm:w-auto">
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
    <aside className={cn('rounded-[24px] border border-zinc-200/80 bg-bg-surface p-5 shadow-[0_3px_14px_rgba(15,23,42,0.07)]', className)}>
      <h2 className="text-base font-black text-zinc-950">{title}</h2>
      {description && <p className="mt-1 text-xs font-medium leading-5 text-zinc-600">{description}</p>}
      <div className="mt-4 grid gap-3">
        {actions.map((action) => (
          <a
            key={action.href}
            href={action.href}
            className="group flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-bg-surface px-3 py-2.5 text-sm font-extrabold text-zinc-900 transition hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-text"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-surface text-brand-solid-active transition group-hover:bg-brand-solid group-hover:text-white">
                {action.icon}
              </span>
              <span className="line-clamp-1">{action.label}</span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-zinc-400 transition group-hover:text-brand-text" />
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
