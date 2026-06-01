import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import { cn } from "#/lib/utils"

export type AppDialogSize = "sm" | "md" | "lg" | "xl"

const dialogSizeClassName: Record<AppDialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
}

export type AppDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactElement
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: AppDialogSize
  showCloseButton?: boolean
  contentClassName?: string
  descriptionClassName?: string
}

export function AppDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  size = "md",
  showCloseButton = true,
  contentClassName,
  descriptionClassName,
}: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn(dialogSizeClassName[size], contentClassName)}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription className={descriptionClassName}>
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-0">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
