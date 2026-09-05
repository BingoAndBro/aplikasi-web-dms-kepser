"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  Loader2,
  TriangleAlert,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

/**
 * The single confirmation dialog for the whole app. Centred layout with a
 * tone-coloured icon badge, matching `AppToast` and the app's warm-orange system.
 *
 * Use it controlled (`open` / `onOpenChange`) when the dialog must stay open with
 * an in-dialog spinner during async work (`pending`). For fire-and-forget
 * confirmations prefer the imperative `useConfirm()` hook.
 */

export type ConfirmTone =
  | "default"
  | "primary"
  | "warning"
  | "destructive"
  | "success"
  | "info"

/** Legacy prop kept for back-compat — mapped onto {@link ConfirmTone}. */
export type ConfirmDialogVariant = "default" | "warning" | "destructive"

export type ConfirmDialogSize = "sm" | "md" | "lg" | "xl"

export type ConfirmResult = { reason?: string; typedValue?: string }

export type ConfirmReasonConfig = {
  label?: React.ReactNode
  placeholder?: string
  required?: boolean
  minLength?: number
  maxLength?: number
  rows?: number
}

export type ConfirmDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactElement
  title: React.ReactNode
  description?: React.ReactNode
  /** Extra content (summary cards, etc.) rendered left-aligned above the footer. */
  children?: React.ReactNode
  /** Override the auto icon picked from `tone`. */
  icon?: React.ReactNode
  tone?: ConfirmTone
  /** @deprecated use `tone` */
  variant?: ConfirmDialogVariant
  confirmLabel?: React.ReactNode
  cancelLabel?: React.ReactNode
  onConfirm: (result?: ConfirmResult) => void | Promise<void>
  onCancel?: () => void
  pending?: boolean
  disabled?: boolean
  hideCancel?: boolean
  /** Collect a required free-text reason before the action is allowed. */
  withReason?: boolean | ConfirmReasonConfig
  /** Require the user to type an exact phrase before the action is allowed. */
  typedConfirmation?: string
  typedConfirmationLabel?: React.ReactNode
  typedConfirmationHint?: React.ReactNode
  /** Alias of {@link ConfirmDialogProps.typedConfirmation}. */
  requireTyped?: string
  size?: ConfirmDialogSize
  /** Allow Esc / backdrop to dismiss. Defaults to `false` for destructive, `true` otherwise. */
  allowDismiss?: boolean
  className?: string
}

const VARIANT_TO_TONE: Record<ConfirmDialogVariant, ConfirmTone> = {
  default: "default",
  warning: "warning",
  destructive: "destructive",
}

const toneBadgeClassName: Record<ConfirmTone, string> = {
  default: "bg-orange-50 text-orange-600",
  primary: "bg-orange-50 text-orange-600",
  warning: "bg-amber-50 text-amber-600",
  destructive: "bg-rose-50 text-rose-600",
  success: "bg-emerald-50 text-emerald-600",
  info: "bg-slate-50 text-slate-600",
}

const toneConfirmClassName: Record<ConfirmTone, string> = {
  default: "bg-[#FF5F1F] text-white hover:bg-[#EA580C]",
  primary: "bg-[#FF5F1F] text-white hover:bg-[#EA580C]",
  warning: "bg-amber-600 text-white hover:bg-amber-700",
  destructive: "bg-rose-600 text-white hover:bg-rose-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  info: "bg-slate-700 text-white hover:bg-slate-800",
}

const toneIcon: Record<ConfirmTone, React.ComponentType<{ className?: string }>> = {
  default: HelpCircle,
  primary: HelpCircle,
  warning: TriangleAlert,
  destructive: AlertTriangle,
  success: CheckCircle2,
  info: Info,
}

const sizeClassName: Record<ConfirmDialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
}

const DEFAULT_REASON: Required<ConfirmReasonConfig> = {
  label: "Catatan",
  placeholder: "",
  required: true,
  minLength: 10,
  maxLength: 2000,
  rows: 4,
}

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  icon,
  tone: toneProp,
  variant,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  onConfirm,
  onCancel,
  pending = false,
  disabled = false,
  hideCancel = false,
  withReason,
  typedConfirmation,
  typedConfirmationLabel = "Ketik frasa konfirmasi",
  typedConfirmationHint,
  requireTyped,
  size = "sm",
  allowDismiss,
  className,
}: ConfirmDialogProps) {
  const tone: ConfirmTone =
    toneProp ?? (variant ? VARIANT_TO_TONE[variant] : "default")
  const phrase = requireTyped ?? typedConfirmation
  const requiresPhrase = Boolean(phrase)
  const reasonConfig: Required<ConfirmReasonConfig> | null = withReason
    ? { ...DEFAULT_REASON, ...(withReason === true ? {} : withReason) }
    : null

  const [typedValue, setTypedValue] = React.useState("")
  const [reasonValue, setReasonValue] = React.useState("")
  const [reasonTouched, setReasonTouched] = React.useState(false)
  const cancelRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!open) {
      setTypedValue("")
      setReasonValue("")
      setReasonTouched(false)
    }
  }, [open])

  const phraseMatches = !requiresPhrase || typedValue === phrase
  const reasonTrimmed = reasonValue.trim()
  const reasonValid =
    !reasonConfig ||
    !reasonConfig.required ||
    reasonTrimmed.length >= reasonConfig.minLength
  const confirmDisabled = disabled || pending || !phraseMatches || !reasonValid
  const dismissAllowed = allowDismiss ?? tone !== "destructive"

  const handleOpenChange = (
    nextOpen: boolean,
    eventDetails?: { reason?: string },
  ) => {
    if (nextOpen) {
      onOpenChange?.(true)
      return
    }
    if (pending) return
    if (
      !dismissAllowed &&
      (eventDetails?.reason === "escape-key" ||
        eventDetails?.reason === "outside-press")
    ) {
      return
    }
    onCancel?.()
    onOpenChange?.(false)
  }

  const handleConfirm = () => {
    const needsResult = Boolean(reasonConfig) || requiresPhrase
    const result: ConfirmResult = {}
    if (reasonConfig) result.reason = reasonValue
    if (requiresPhrase) result.typedValue = typedValue
    void onConfirm(needsResult ? result : undefined)
  }

  const IconComponent = toneIcon[tone]
  const iconNode = icon ?? <IconComponent className="size-6" />

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent
        className={cn(sizeClassName[size], className)}
        initialFocus={tone === "destructive" ? cancelRef : undefined}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-full",
              toneBadgeClassName[tone],
            )}
            aria-hidden="true"
          >
            {iconNode}
          </span>
          <AlertDialogTitle className="text-center">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="mx-auto max-w-sm text-center">
              {description}
            </AlertDialogDescription>
          ) : null}
        </div>

        {(children || reasonConfig || requiresPhrase) && (
          <div className="mt-5 space-y-4 text-left">
            {children}

            {reasonConfig && (
              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-dialog-reason"
                  className="block text-xs font-semibold text-zinc-700"
                >
                  {reasonConfig.label}
                  {reasonConfig.required ? (
                    <span className="text-error"> *</span>
                  ) : null}
                </label>
                <textarea
                  id="confirm-dialog-reason"
                  value={reasonValue}
                  onChange={(event) => setReasonValue(event.currentTarget.value)}
                  onBlur={() => setReasonTouched(true)}
                  rows={reasonConfig.rows}
                  maxLength={reasonConfig.maxLength}
                  placeholder={reasonConfig.placeholder || undefined}
                  disabled={pending}
                  className={cn(
                    "w-full resize-none rounded-xl border bg-[#FFFDF9] px-3 py-2 text-sm text-zinc-950 outline-none transition focus:ring-2",
                    tone === "destructive"
                      ? "border-rose-200 focus:border-rose-400 focus:ring-rose-100"
                      : "border-[#F0E1D5] focus:border-orange-300 focus:ring-orange-100",
                  )}
                />
                <div className="flex items-center justify-between text-[10px] font-medium text-outline">
                  <span>
                    {reasonConfig.required
                      ? `Min. ${reasonConfig.minLength} karakter`
                      : "Opsional"}
                  </span>
                  <span>
                    {reasonValue.length}/{reasonConfig.maxLength}
                  </span>
                </div>
                {reasonTouched && !reasonValid ? (
                  <p className="text-[10px] font-semibold text-error">
                    Catatan minimal {reasonConfig.minLength} karakter.
                  </p>
                ) : null}
              </div>
            )}

            {requiresPhrase && (
              <div className="space-y-2">
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-semibold leading-relaxed text-rose-700">
                  {typedConfirmationHint ?? (
                    <>
                      Ketik <span className="font-mono font-bold">{`"${phrase}"`}</span>{" "}
                      untuk melanjutkan.
                    </>
                  )}
                </div>
                <label htmlFor="confirm-dialog-typed" className="sr-only">
                  {typedConfirmationLabel}
                </label>
                <input
                  id="confirm-dialog-typed"
                  value={typedValue}
                  onChange={(event) => setTypedValue(event.currentTarget.value)}
                  placeholder={phrase}
                  disabled={pending}
                  autoComplete="off"
                  className="w-full rounded-xl border border-red-200 bg-[#FFFDF9] px-3 py-2 text-sm font-semibold text-zinc-950 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          {!hideCancel && (
            <AlertDialogClose
              ref={cancelRef}
              render={<Button variant="outline" disabled={pending} />}
            >
              {cancelLabel}
            </AlertDialogClose>
          )}
          <Button
            type="button"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className={cn("rounded-xl px-5 font-extrabold", toneConfirmClassName[tone])}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Memproses...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
