import { useBlocker } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'

const DEFAULT_MESSAGE = 'Perubahan belum disimpan. Yakin ingin keluar?'

interface UseUnsavedChangesGuardOptions {
  isDirty: boolean
  message?: string
}

type GuardedCallback = () => void | Promise<void>

export function useUnsavedChangesGuard({
  isDirty,
  message = DEFAULT_MESSAGE,
}: UseUnsavedChangesGuardOptions) {
  const skipNextBlockRef = useRef(false)

  const confirmIfDirty = useCallback(
    (callback: GuardedCallback) => {
      if (!isDirty) {
        return callback()
      }

      if (typeof window !== 'undefined' && !window.confirm(message)) {
        return
      }

      skipNextBlockRef.current = true
      const result = callback()

      if (result instanceof Promise) {
        return result.finally(() => {
          skipNextBlockRef.current = false
        })
      }

      setTimeout(() => {
        skipNextBlockRef.current = false
      }, 0)

      return result
    },
    [isDirty, message]
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
    shouldBlockFn: () => {
      if (!isDirty || skipNextBlockRef.current) {
        return false
      }

      if (typeof window === 'undefined') {
        return false
      }

      return !window.confirm(message)
    },
    enableBeforeUnload: false,
    disabled: !isDirty,
  })

  return {
    confirmIfDirty,
  }
}
