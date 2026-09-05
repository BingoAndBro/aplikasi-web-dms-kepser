"use client"

import * as React from "react"

import {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmReasonConfig,
} from "#/components/ui/ConfirmDialog"

/**
 * Imperative confirmation API. Mount `<ConfirmProvider>` once near the app root,
 * then call `useConfirm()` anywhere:
 *
 * ```ts
 * const confirm = useConfirm()
 * if (await confirm({ title: "Hapus data ini?", tone: "destructive", confirmLabel: "Hapus" })) {
 *   await deleteThing()
 * }
 *
 * const reason = await confirm({
 *   title: "Tolak Dokumen",
 *   tone: "destructive",
 *   withReason: { label: "Catatan Revisi", minLength: 10 },
 * })
 * if (reason !== null) await rejectDoc(reason)
 * ```
 *
 * The dialog resolves and closes immediately on confirm — the caller does async
 * work afterward. Flows that need an in-dialog spinner should use the controlled
 * `<ConfirmDialog pending>` component instead.
 */

type ImperativeConfirmOptions = Omit<
  ConfirmDialogProps,
  "open" | "onOpenChange" | "trigger" | "onConfirm" | "onCancel" | "pending" | "disabled"
>

export type PlainConfirmOptions = ImperativeConfirmOptions & { withReason?: undefined }
export type ReasonConfirmOptions = ImperativeConfirmOptions & {
  withReason: boolean | ConfirmReasonConfig
}

export type ConfirmFn = {
  (options: PlainConfirmOptions): Promise<boolean>
  (options: ReasonConfirmOptions): Promise<string | null>
}

type QueueItem = {
  id: number
  options: ImperativeConfirmOptions
  isReason: boolean
  resolve: (value: boolean | string | null) => void
}

const CLOSE_ANIMATION_MS = 160

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<QueueItem[]>([])
  const [closingId, setClosingId] = React.useState<number | null>(null)
  const idRef = React.useRef(0)

  const current = queue[0] ?? null
  const open = current != null && current.id !== closingId

  const confirm = React.useCallback(
    ((options: ImperativeConfirmOptions) =>
      new Promise<boolean | string | null>((resolve) => {
        idRef.current += 1
        const item: QueueItem = {
          id: idRef.current,
          options,
          isReason: Boolean(
            (options as ReasonConfirmOptions).withReason,
          ),
          resolve,
        }
        setQueue((q) => [...q, item])
      })) as ConfirmFn,
    [],
  )

  const finish = React.useCallback(
    (item: QueueItem, value: boolean | string | null) => {
      item.resolve(value)
      setClosingId(item.id)
      window.setTimeout(() => {
        setQueue((q) => q.filter((it) => it.id !== item.id))
        setClosingId((cid) => (cid === item.id ? null : cid))
      }, CLOSE_ANIMATION_MS)
    },
    [],
  )

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current ? (
        <ConfirmDialog
          key={current.id}
          {...current.options}
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) finish(current, current.isReason ? null : false)
          }}
          onConfirm={(result) =>
            finish(current, current.isReason ? result?.reason ?? "" : true)
          }
        />
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider")
  }
  return ctx
}
