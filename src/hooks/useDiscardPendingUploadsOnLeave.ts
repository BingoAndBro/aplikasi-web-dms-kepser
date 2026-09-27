import { useEffect, type RefObject } from 'react'

import { requestPendingUploadCleanup } from '#/lib/storage/pending-upload-cleanup-client'

/**
 * Deletes the pending uploads a form still tracks when the Pegawai leaves it
 * without saving: any in-app navigation (the component unmounts) and closing or
 * reloading the tab (`pagehide`). The request uses `keepalive` so it survives
 * the navigation.
 *
 * `sessionPendingUrlsRef` must hold only pending uploads that are NOT persisted
 * yet — callers clear it once a save/submit has moved the files to formal
 * storage. Pending paths that were already moved are skipped by the server.
 */
export function useDiscardPendingUploadsOnLeave(
  sessionPendingUrlsRef: RefObject<Set<string>>,
  context: string,
): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const discard = (reason: string) => {
      const urls = [...sessionPendingUrlsRef.current]
      if (urls.length === 0) return

      sessionPendingUrlsRef.current = new Set()
      void requestPendingUploadCleanup(urls, { context: `${context}:${reason}`, keepalive: true })
    }

    const handlePageHide = () => discard('pagehide')

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      discard('unmount')
    }
  }, [sessionPendingUrlsRef, context])
}
