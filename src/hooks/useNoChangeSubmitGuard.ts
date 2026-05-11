import { useCallback } from 'react'

const DEFAULT_MESSAGE = 'Tidak ada perubahan. Tetap lanjutkan?'

interface UseNoChangeSubmitGuardOptions {
  isDirty: boolean
  message?: string
}

type GuardedCallback = () => void | Promise<void>

export function useNoChangeSubmitGuard({
  isDirty,
  message = DEFAULT_MESSAGE,
}: UseNoChangeSubmitGuardOptions) {
  const confirmIfNoChange = useCallback(
    (callback: GuardedCallback) => {
      if (isDirty) {
        return callback()
      }

      if (typeof window !== 'undefined' && !window.confirm(message)) {
        return
      }

      return callback()
    },
    [isDirty, message]
  )

  return {
    confirmIfNoChange,
  }
}
