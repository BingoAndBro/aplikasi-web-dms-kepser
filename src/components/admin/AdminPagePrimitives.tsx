import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Check, ChevronDown, Edit2, Search, Trash2 } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { cn } from '#/lib/utils'

export const adminNativeSelectClassName =
  'h-11 min-w-[180px] rounded-[22px] border border-zinc-200 bg-white px-5 text-sm font-bold text-zinc-950 shadow-[0_3px_10px_rgba(15,23,42,0.06)] outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70 disabled:cursor-not-allowed disabled:opacity-50'

export const adminPageContainerClassName =
  'mx-auto w-full max-w-[1480px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10'
export const adminContentCompactClassName = 'mx-auto w-full max-w-[980px]'
export const adminContentStandardClassName = 'mx-auto w-full max-w-[1180px]'
export const adminContentWideClassName = 'mx-auto w-full max-w-[1480px]'
export const adminTableToolbarClassName = ''
export const adminTableBodyClassName = ''
export const adminFormFieldClassName =
  'h-11 rounded-[14px] border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#071A3A] shadow-none transition placeholder:text-[#8A8A8A] hover:border-[#FF5A00] focus-visible:border-[#FF5A00] focus-visible:ring-2 focus-visible:ring-[#FF5A00]/20'
export const adminTextareaClassName =
  'min-h-24 w-full resize-none rounded-[14px] border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-semibold text-[#071A3A] outline-none transition placeholder:text-[#8A8A8A] hover:border-[#FF5A00] focus:border-[#FF5A00] focus:ring-2 focus:ring-[#FF5A00]/20'
export const adminPrimaryActionClassName =
  'h-11 rounded-[20px] bg-[#FF5A00] px-5 text-sm font-extrabold text-white shadow-[0_8px_14px_rgba(255,90,0,0.20),inset_0_-1px_0_rgba(132,37,0,0.20)] hover:bg-[#F04F00] focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 [&_svg]:size-[16px] [&_svg]:stroke-[2.4]'
export const adminDialogContentClassName =
  'overflow-hidden rounded-[26px] border border-[#CAD4E2] bg-white p-0 text-[#071A3A] shadow-2xl shadow-slate-950/20'
export const adminDialogHeaderClassName =
  'border-b border-[#E8EEF5] bg-white px-7 py-6 pr-14'
export const adminDialogBodyClassName = 'space-y-6 px-7 py-6'
export const adminDialogFooterClassName =
  'gap-3 border-t border-[#E8EEF5] bg-[#F7FAFD] px-7 py-5'
export const adminDialogCancelButtonClassName =
  'h-10 rounded-full border-[#DCE6F0] bg-white px-6 text-sm font-bold text-[#071A3A] hover:bg-slate-50'
export const adminDialogSubmitButtonClassName =
  'h-10 rounded-full bg-[#FF5A00] px-6 text-sm font-extrabold text-white shadow-[0_8px_16px_rgba(255,90,0,0.18)] hover:bg-[#F04F00]'
export const adminDialogDestructiveButtonClassName =
  'h-10 rounded-full bg-[#F00446] px-6 text-sm font-extrabold text-white shadow-[0_8px_16px_rgba(240,4,70,0.18)] hover:bg-[#D9043D]'
export const adminFormLabelClassName =
  'mb-2 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#35527A]'
export const adminFormSectionTitleClassName =
  'text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#5C5147]'
export const adminFormSectionClassName = 'space-y-3 border-b border-[#E8EEF5] pb-4 last:border-b-0 last:pb-0'
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
          <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-[#FFF6EA] text-orange-600 shadow-[0_2px_8px_rgba(251,146,60,0.14)] [&_svg]:size-[22px]">
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
        'rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] p-5 shadow-[0_3px_14px_rgba(15,23,42,0.07)]',
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
              className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-700/50"
              aria-hidden="true"
            />
            <input
              id={id}
              type="search"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#E9D2BD] bg-[#FFFDF9] pl-11 pr-4 text-sm font-semibold text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
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
          'grid h-11 w-full grid-cols-[minmax(0,1fr)_24px] items-center gap-3 rounded-[22px] border bg-white py-2 pl-5 pr-4 text-sm font-bold shadow-[0_3px_10px_rgba(15,23,42,0.06)] transition',
          disabled
            ? 'cursor-not-allowed border-zinc-200 text-zinc-300'
            : 'border-zinc-200 text-zinc-950 hover:border-orange-200 hover:bg-[#FFF8F1]',
        )}
      >
        <span className="min-w-0 truncate text-left">{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={cn('justify-self-center text-[#FF4D00] transition-transform', open && 'rotate-180')} />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 min-w-full overflow-hidden rounded-[20px] border border-orange-100 bg-white py-1 shadow-xl shadow-orange-950/10">
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
                  isSelected ? 'bg-[#FFF0E7] text-[#FF4D00]' : 'text-zinc-950 hover:bg-[#FFF4ED]',
                  option.disabled && 'cursor-not-allowed text-zinc-300 hover:bg-white',
                )}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected && <Check size={15} className="shrink-0 text-[#FF4D00]" />}
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
    warm: 'border-[#F4D7A8] bg-[#FFF9F0] text-[#5B3A00]',
    blue: 'border-[#D8E5F7] bg-[#F2F7FF] text-[#001A42]',
    orange: 'border-orange-200 bg-orange-50 text-[#FF4D00]',
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
        className="size-9 rounded-xl text-black transition hover:bg-orange-50 hover:text-[#FF4D00]"
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
        'overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)] [&_tbody]:divide-y [&_tbody]:divide-zinc-100 [&_tbody]:text-[13px] [&_td]:px-6 [&_td]:py-5 [&_th]:px-6 [&_th]:py-4 [&_th]:text-[12px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.07em] [&_th]:text-zinc-950 [&_thead_tr]:border-neutral-200 [&_thead_tr]:bg-neutral-100 [&_thead_tr]:hover:bg-neutral-100 [&_tbody_tr]:border-zinc-100 [&_tbody_tr]:bg-[#FFFDF9] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[#FFF8F1]/70',
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
