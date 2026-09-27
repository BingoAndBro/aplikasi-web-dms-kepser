import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PENDING_UPLOAD_CLEANUP_ENDPOINT,
  requestPendingUploadCleanup,
} from '#/lib/storage/pending-upload-cleanup-client'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(jsonResponse({ success: true }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestPendingUploadCleanup', () => {
  it('sends nothing when there is nothing to clean', async () => {
    await expect(requestPendingUploadCleanup(['', ''], { context: 'test' })).resolves.toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the de-duplicated pending urls to the cleanup endpoint', async () => {
    await expect(requestPendingUploadCleanup(['a/1.pdf', 'a/2.pdf', 'a/1.pdf'], { context: 'test' })).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(PENDING_UPLOAD_CLEANUP_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ urls: ['a/1.pdf', 'a/2.pdf'] })
    expect(init.keepalive).toBe(false)
  })

  it('uses keepalive (no abort timer) for page-leave cleanup', async () => {
    await requestPendingUploadCleanup(['a/1.pdf'], { context: 'leave', keepalive: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.keepalive).toBe(true)
    expect(init.signal).toBeUndefined()
  })

  it('splits more than 50 urls into batches accepted by the server schema', async () => {
    const urls = Array.from({ length: 120 }, (_, index) => `a/${index}.pdf`)

    await requestPendingUploadCleanup(urls, { context: 'test' })

    const batchSizes = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).urls.length)
    expect(batchSizes).toEqual([50, 50, 20])
  })

  it('reports failure on a non-OK response or a partial server cleanup', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
    await expect(requestPendingUploadCleanup(['a/1.pdf'], { context: 'test' })).resolves.toBe(false)

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, errors: [{ url: 'a/1.pdf' }] }))
    await expect(requestPendingUploadCleanup(['a/1.pdf'], { context: 'test' })).resolves.toBe(false)

    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await expect(requestPendingUploadCleanup(['a/1.pdf'], { context: 'test' })).resolves.toBe(false)
  })
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
