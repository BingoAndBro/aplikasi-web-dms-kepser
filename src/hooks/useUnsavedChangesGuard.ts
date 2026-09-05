import { useBlocker } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'

import { useConfirm } from '#/hooks/useConfirm'

const DEFAULT_MESSAGE = 'Perubahan yang belum Anda simpan akan hilang jika meninggalkan halaman ini.'

interface UseUnsavedChangesGuardOptions {
  isDirty: boolean
  message?: string
}

type GuardedCallback = () => void | Promise<void>

/**
 * Blocks in-app navigation and browser close while a form is dirty.
 *
 * In-app navigation shows the shared {@link useConfirm} dialog; the browser-close
 * path stays on the native `beforeunload` prompt (browsers forbid custom UI there).
 */
export function useUnsavedChangesGuard({
  isDirty,
  message = DEFAULT_MESSAGE,
}: UseUnsavedChangesGuardOptions) {
  const confirm = useConfirm()
  const skipNextBlockRef = useRef(false)
  const inFlightRef = useRef(false)

  const askLeave = useCallback(
    () =>
      confirm({
        tone: 'warning',
        title: 'Keluar tanpa menyimpan?',
        description: message,
        confirmLabel: 'Keluar tanpa menyimpan',
        cancelLabel: 'Tetap di halaman',
      }),
    [confirm, message],
  )

  const confirmIfDirty = useCallback(
    async (callback: GuardedCallback) => {
      if (!isDirty) {
        return callback()
      }

      if (inFlightRef.current) return

      inFlightRef.current = true
      let proceed = false
      try {
        proceed = await askLeave()
      } finally {
        inFlightRef.current = false
      }

      if (!proceed) return

      skipNextBlockRef.current = true
      try {
        return await callback()
      } finally {
        skipNextBlockRef.current = false
      }
    },
    [isDirty, askLeave],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipNextBlockRef.current) {
        return
      }

      event.preventDefault()
      event.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty, message])

  useBlocker({
    shouldBlockFn: async () => {
      if (!isDirty || skipNextBlockRef.current) {
        return false
      }

      // A confirm is already open for a concurrent navigation attempt — keep blocking.
      if (inFlightRef.current) {
        return true
      }

      inFlightRef.current = true
      try {
        const proceed = await askLeave()
        return !proceed
      } finally {
        inFlightRef.current = false
      }
    },
    enableBeforeUnload: false,
    disabled: !isDirty,
  })

  return {
    confirmIfDirty,
  }
}
