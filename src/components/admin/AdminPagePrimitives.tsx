import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Check, ChevronDown, Edit2, Search, Trash2 } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import {
  DATA_FILTER_SELECT_MENU_TONE_CLASS,
  DATA_FILTER_SELECT_OPTION_SELECTED_TONE_CLASS,
  DATA_FILTER_SELECT_OPTION_TONE_CLASS,
  DATA_FILTER_SELECT_TRIGGER_DISABLED_TONE_CLASS,
  DATA_FILTER_SELECT_TRIGGER_TONE_CLASS,
  DATA_SEARCH_ICON_TONE_CLASS,
  DATA_SEARCH_INPUT_TONE_CLASS,
  DATA_TABLE_SHELL_TONE_CLASS,
} from '#/lib/data-table-classes'
import { cn } from '#/lib/utils'

export const adminNativeSelectClassName = cn(
  'h-11 min-w-[180px] rounded-[22px] px-5 text-sm font-bold shadow-[0_3px_10px_var(--shadow-card)] disabled:cursor-not-allowed disabled:opacity-50',
  DATA_FILTER_SELECT_TRIGGER_TONE_CLASS,
)

export const adminPageContainerClassName =
  'mx-auto w-full max-w-[1480px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10'
export const adminContentCompactClassName = 'mx-auto w-full max-w-[980px]'
export const adminContentStandardClassName = 'mx-auto w-full max-w-[1180px]'
export const adminContentWideClassName = 'mx-auto w-full max-w-[1480px]'
export const adminTableToolbarClassName = ''
export const adminTableBodyClassName = ''
export const adminFormFieldClassName =
  'h-11 rounded-[14px] border-border-default bg-white px-4 text-sm font-semibold text-text-strong shadow-none transition placeholder:text-text-muted hover:border-brand-solid focus-visible:border-brand-solid focus-visible:ring-2 focus-visible:ring-brand-solid/20'
export const adminTextareaClassName =
  'min-h-24 w-full resize-none rounded-[14px] border border-border-default bg-white px-4 py-3 text-sm font-semibold text-text-strong outline-none transition placeholder:text-text-muted hover:border-brand-solid focus:border-brand-solid focus:ring-2 focus:ring-brand-solid/20'
export const adminPrimaryActionClassName =
  'h-11 rounded-[20px] bg-brand-solid px-5 text-sm font-extrabold text-white shadow-[0_8px_14px_rgba(255,90,0,0.20),inset_0_-1px_0_rgba(132,37,0,0.20)] hover:bg-brand-text focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 [&_svg]:size-[16px] [&_svg]:stroke-[2.4]'
export const adminDialogContentClassName =
  'overflow-hidden rounded-[26px] border border-border-default bg-white p-0 text-text-strong shadow-2xl shadow-slate-950/20'
export const adminDialogHeaderClassName =
  'border-b border-border-default bg-white px-7 py-6 pr-14'
export const adminDialogBodyClassName = 'space-y-6 px-7 py-6'
export const adminDialogFooterClassName =
  'gap-3 border-t border-border-default bg-white px-7 py-5'
export const adminDialogCancelButtonClassName =
  'h-10 rounded-full border-border-default bg-white px-6 text-sm font-bold text-text-strong hover:bg-slate-50'
export const adminDialogSubmitButtonClassName =
  'h-10 rounded-full bg-brand-solid px-6 text-sm font-extrabold text-white shadow-[0_8px_16px_rgba(255,90,0,0.18)] hover:bg-brand-text'
export const adminDialogDestructiveButtonClassName =
  'h-10 rounded-full bg-danger-text px-6 text-sm font-extrabold text-white shadow-[0_8px_16px_rgba(240,4,70,0.18)] hover:bg-danger-text'
export const adminFormLabelClassName =
  'mb-2 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-text-muted'
export const adminFormSectionTitleClassName =
  'text-[11px] font-extrabold uppercase tracking-[0.08em] text-brand-text-muted'
export const adminFormSectionClassName = 'space-y-3 border-b border-border-default pb-4 last:border-b-0 last:pb-0'
export const adminFormGridClassName = 'grid gap-3 md:grid-cols-2'
export const adminRoleCardClassName =
  'relative min-h-[72px] rounded-[14px] border px-3 py-3 text-left text-xs transition-colors'

type AdminPageHeaderProps = {
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
  className,
}: AdminPageHeaderProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-5">
        {icon && (
          <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-bg-surface text-orange-600 shadow-[0_2px_8px_rgba(251,146,60,0.14)] [&_svg]:size-[22px]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-orange-900/70">
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
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2 sm:pt-1">{actions}</div>}
    </section>
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
        'rounded-[26px] border border-zinc-200/80 bg-bg-surface p-5 shadow-[0_3px_14px_rgba(15,23,42,0.07)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

type AdminSearchPanelProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
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
  className,
  children,
  resultText,
  helperText,
}: AdminSearchPanelProps) {
  return (
    <AdminPanel className={cn('p-5 sm:p-6', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          className={cn(
            'min-w-0 gap-4',
            children
              ? 'grid w-full md:grid-cols-[minmax(260px,1fr)] lg:grid-cols-[minmax(320px,1fr)_auto_auto_auto_auto] lg:items-center'
              : 'flex w-full lg:max-w-md',
          )}
        >
          <label
            className={cn('relative min-w-0', !children && 'w-full max-w-md')}
            htmlFor={id}
          >
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
              className={cn('h-11 w-full rounded-xl border pl-11 pr-4 text-sm font-semibold', DATA_SEARCH_INPUT_TONE_CLASS)}
              placeholder={placeholder}
              autoComplete="off"
            />
          </label>
          {children}
        </div>
        {resultText && (
          <div className="shrink-0 text-sm font-semibold text-zinc-900 lg:text-right">
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

type AdminFilterSelectOption = {
  value: string
  label: ReactNode
  disabled?: boolean
}

type AdminFilterSelectProps = {
  value: string
  onChange: (value: string) => void
  options: AdminFilterSelectOption[]
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function AdminFilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = 'Pilih...',
  disabled = false,
  className,
}: AdminFilterSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(option => option.value === value)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={ref} className={cn('relative min-w-[190px]', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        className={cn(
          'grid h-11 w-full grid-cols-[minmax(0,1fr)_24px] items-center gap-3 rounded-[22px] border py-2 pl-5 pr-4 text-sm font-bold shadow-[0_3px_10px_var(--shadow-card)] transition',
          disabled ? DATA_FILTER_SELECT_TRIGGER_DISABLED_TONE_CLASS : DATA_FILTER_SELECT_TRIGGER_TONE_CLASS,
        )}
      >
        <span className="min-w-0 truncate text-left">{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={cn('justify-self-center text-brand-text transition-transform', open && 'rotate-180')} />
      </button>
      {open && !disabled && (
        <div className={cn('absolute left-0 top-[calc(100%+8px)] z-40 min-w-full overflow-hidden rounded-[20px] border py-1 shadow-xl shadow-brand-glow', DATA_FILTER_SELECT_MENU_TONE_CLASS)}>
          {options.map(option => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm font-semibold transition',
                  isSelected ? DATA_FILTER_SELECT_OPTION_SELECTED_TONE_CLASS : DATA_FILTER_SELECT_OPTION_TONE_CLASS,
                  option.disabled && 'cursor-not-allowed text-text-disabled hover:bg-surface',
                )}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected && <Check size={15} className="shrink-0 text-brand-text" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

type AdminConfirmationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  children: ReactNode
  confirmLabel: ReactNode
  onConfirm: () => void
  cancelLabel?: ReactNode
  onCancel?: () => void
  loading?: boolean
  tone?: 'destructive' | 'warning' | 'info' | 'success'
  icon?: ReactNode
}

const ADMIN_TONE_TO_CONFIRM_TONE = {
  destructive: 'destructive',
  warning: 'warning',
  success: 'success',
  info: 'primary',
} as const

/**
 * Admin master-data confirmations. Thin adapter over the app-wide {@link ConfirmDialog}
 * so every admin "Hapus …?" / "Keluar dari form?" prompt matches the rest of the app —
 * the prop shape is preserved, so no admin call site changes.
 */
export function AdminConfirmationDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Batal',
  onCancel,
  loading = false,
  tone = 'destructive',
  icon,
}: AdminConfirmationDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        if (!next) onCancel?.()
        onOpenChange(next)
      }}
      tone={ADMIN_TONE_TO_CONFIRM_TONE[tone]}
      icon={icon}
      title={title}
      description={children}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      pending={loading}
      onConfirm={onConfirm}
    />
  )
}

export function useAdminFormLeaveGuard(isDirty: boolean) {
  useEffect(() => {
    if (typeof window === 'undefined' || !isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Perubahan yang belum disimpan akan hilang.'
      return 'Perubahan yang belum disimpan akan hilang.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])
}

export function AdminFormSelect(props: AdminFilterSelectProps) {
  return <AdminFilterSelect {...props} className={cn('w-full min-w-0', props.className)} />
}

export function AdminRelationPill({
  children,
  tone = 'warm',
}: {
  children: ReactNode
  tone?: 'warm' | 'blue' | 'orange'
}) {
  const toneClassName = {
    warm: 'border-warning-border bg-warning-surface text-warning-text',
    blue: 'border-info-border bg-info-surface text-text-strong',
    orange: 'border-orange-200 bg-orange-50 text-brand-text',
  }[tone]

  return (
    <span className={cn('inline-flex w-fit items-center rounded-md border px-3 py-1 text-sm font-bold leading-none', toneClassName)}>
      {children}
    </span>
  )
}

export function AdminCountPill({ count, label }: { count: number; label: string }) {
  return (
    <AdminRelationPill tone="orange">
      {count} {label}
    </AdminRelationPill>
  )
}

export function AdminActionButtons({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}: {
  onEdit: () => void
  onDelete: () => void
  editLabel: string
  deleteLabel: string
}) {
  return (
    <div className="flex justify-center gap-3">
      <Button
        size="icon-lg"
        variant="ghost"
        onClick={onEdit}
        aria-label={editLabel}
        className="size-9 rounded-xl text-black transition hover:bg-orange-50 hover:text-brand-text"
      >
        <Edit2 size={20} strokeWidth={2.5} />
      </Button>
      <Button
        size="icon-lg"
        variant="ghost"
        onClick={onDelete}
        aria-label={deleteLabel}
        className="size-9 rounded-xl text-black transition hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 size={20} strokeWidth={2.5} />
      </Button>
    </div>
  )
}

export function AdminTableShell({ children, className }: AdminPanelProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[26px] border [&_tbody]:divide-y [&_tbody]:divide-border-default [&_tbody]:text-[13px] [&_td]:px-6 [&_td]:py-5 [&_th]:px-6 [&_th]:py-4 [&_th]:text-[12px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.07em] [&_th]:text-zinc-950 [&_thead_tr]:border-border-default [&_thead_tr]:bg-sunken [&_thead_tr]:hover:bg-sunken [&_tbody_tr]:border-border-default [&_tbody_tr]:bg-surface [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-brand-surface/70',
        DATA_TABLE_SHELL_TONE_CLASS,
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

type AdminStepCardProps = {
  step: number
  title: ReactNode
  description?: ReactNode
  active?: boolean
  complete?: boolean
  className?: string
  children?: ReactNode
}

export function AdminStepCard({
  step,
  title,
  description,
  active = false,
  complete = false,
  className,
  children,
}: AdminStepCardProps) {
  return (
    <AdminPanel
      className={cn(
        'space-y-4',
        active && 'border-orange-200 bg-orange-50/40',
        complete && 'border-emerald-200 bg-emerald-50/40',
        className,
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
