// Client-side request to delete the caller's own pending uploads
// (POST /api/upload?cleanup=pending). The server only deletes pending paths
// owned by the session user; anything else is reported and left untouched.
import { warnDev } from '#/lib/dev-logger'

export const PENDING_UPLOAD_CLEANUP_ENDPOINT = '/api/upload?cleanup=pending'
const PENDING_UPLOAD_CLEANUP_TIMEOUT_MS = 10_000
// Matches the server's cleanupPendingBodySchema `urls.max(50)`.
const PENDING_UPLOAD_CLEANUP_BATCH_SIZE = 50

export type PendingUploadCleanupOptions = {
  /** Short label for dev logs, e.g. 'ajukan-leave'. */
  context: string
  /**
   * Use for page leave / tab close: the browser keeps the request alive after
   * navigation, so callers do not (and should not) await it.
   */
  keepalive?: boolean
}

export async function requestPendingUploadCleanup(
  urls: readonly string[],
  { context, keepalive = false }: PendingUploadCleanupOptions,
): Promise<boolean> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))]
  if (uniqueUrls.length === 0) return true

  const results = await Promise.all(
    chunk(uniqueUrls, PENDING_UPLOAD_CLEANUP_BATCH_SIZE)
      .map(batch => sendCleanupBatch(batch, context, keepalive)),
  )

  return results.every(Boolean)
}

async function sendCleanupBatch(urls: string[], context: string, keepalive: boolean): Promise<boolean> {
  const controller = keepalive ? null : new AbortController()
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), PENDING_UPLOAD_CLEANUP_TIMEOUT_MS)
    : null

  try {
    const response = await fetch(PENDING_UPLOAD_CLEANUP_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      keepalive,
      signal: controller?.signal,
    })

    if (!response.ok) {
      warnDev('[pending-upload-cleanup] Request failed', { context, status: response.status })
      return false
    }

    const json = await response.json().catch(() => null) as { success?: unknown } | null
    const success = json?.success === true
    if (!success) {
      warnDev('[pending-upload-cleanup] Completed with errors', { context })
    }
    return success
  } catch (error) {
    warnDev('[pending-upload-cleanup] Error', {
      context,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return false
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}
