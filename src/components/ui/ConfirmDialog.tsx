"use client"

import * as React from "react"

import { AppDialog, type AppDialogSize } from "#/components/ui/AppDialog"
import { Button } from "#/components/ui/button"
import { DialogClose } from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { cn } from "#/lib/utils"

export type ConfirmDialogVariant = "default" | "warning" | "destructive"

const variantPanelClassName: Record<ConfirmDialogVariant, string> = {
  default: "border-slate-200 bg-slate-50 text-slate-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  destructive: "border-red-200 bg-red-50 text-red-900",
}

export type ConfirmDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactElement
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  variant?: ConfirmDialogVariant
  typedConfirmation?: string
  typedConfirmationLabel?: string
  typedConfirmationHint?: React.ReactNode
  pending?: boolean
  disabled?: boolean
  size?: AppDialogSize
}

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  onConfirm,
  variant = "default",
  typedConfirmation,
  typedConfirmationLabel = "Ketik frasa konfirmasi",
  typedConfirmationHint,
  pending = false,
  disabled = false,
  size = "md",
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = React.useState("")
  const requiresTypedConfirmation = Boolean(typedConfirmation)
  const typedConfirmationMatches =
    !typedConfirmation || typedValue === typedConfirmation
  const confirmDisabled =
    disabled || pending || !typedConfirmationMatches

  React.useEffect(() => {
    if (!open) setTypedValue("")
  }, [open])

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={title}
      description={description}
      descriptionClassName={cn(
        "rounded-lg border p-3 text-sm",
        variantPanelClassName[variant],
      )}
      size={size}
      footer={
        <>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            {cancelLabel}
          </DialogClose>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {pending ? "Memproses..." : confirmLabel}
          </Button>
        </>
      }
    >
      {requiresTypedConfirmation && (
        <div className="space-y-2">
          <Label htmlFor="confirm-dialog-typed-confirmation">
            {typedConfirmationLabel}
          </Label>
          <Input
            id="confirm-dialog-typed-confirmation"
            value={typedValue}
            onChange={(event) => setTypedValue(event.currentTarget.value)}
            placeholder={typedConfirmation}
            disabled={pending}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            {typedConfirmationHint ?? (
              <>Frasa wajib: {typedConfirmation}</>
            )}
          </p>
        </div>
      )}
    </AppDialog>
  )
}
