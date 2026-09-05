import { useCallback } from 'react'

import { useConfirm } from '#/hooks/useConfirm'

const DEFAULT_MESSAGE = 'Tidak ada perubahan yang terdeteksi pada dokumen ini. Tetap lanjutkan?'

interface UseNoChangeSubmitGuardOptions {
  isDirty: boolean
  message?: string
}

type GuardedCallback = () => void | Promise<void>

/**
 * Asks for confirmation (via the shared {@link useConfirm} dialog) before running
 * `callback` when the form has no detected changes.
 */
export function useNoChangeSubmitGuard({
  isDirty,
  message = DEFAULT_MESSAGE,
}: UseNoChangeSubmitGuardOptions) {
  const confirm = useConfirm()

  const confirmIfNoChange = useCallback(
    async (callback: GuardedCallback) => {
      if (isDirty) {
        return callback()
      }

      const proceed = await confirm({
        tone: 'warning',
        title: 'Tidak ada perubahan',
        description: message,
        confirmLabel: 'Tetap Lanjutkan',
        cancelLabel: 'Batal',
      })

      if (!proceed) return

      return callback()
    },
    [isDirty, message, confirm],
  )

  return {
    confirmIfNoChange,
  }
}
