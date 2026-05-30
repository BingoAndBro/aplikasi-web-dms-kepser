import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DESTROYED_FILE_MESSAGE,
  downloadFromApi,
  downloadWithSignedUrl,
  fetchFileBlobWithSignedUrl,
  resolveSafeFileAccessErrorMessage,
} from '#/lib/storage-client'

describe('storage client destroyed-file error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns the destroyed-file message only for the expected 410 domain response', async () => {
    const response = Response.json({ error: DESTROYED_FILE_MESSAGE }, { status: 410 })

    await expect(resolveSafeFileAccessErrorMessage(response, 'Gagal memuat pratinjau'))
      .resolves.toBe(DESTROYED_FILE_MESSAGE)
  })

  it('does not convert unauthorized responses into destroyed-file messages', async () => {
    const response = Response.json({ error: DESTROYED_FILE_MESSAGE }, { status: 403 })

    await expect(resolveSafeFileAccessErrorMessage(response, 'Gagal memuat pratinjau'))
      .resolves.toBe('Gagal memuat pratinjau')
  })

  it('does not expose arbitrary 410 backend text', async () => {
    const response = Response.json({
      error: 'File missing at owner-user/document-id/file.pdf?token=secret',
    }, { status: 410 })

    await expect(resolveSafeFileAccessErrorMessage(response, 'Gagal memuat pratinjau'))
      .resolves.toBe('Gagal memuat pratinjau')
  })

  it('surfaces destroyed-file copy for preview blob fetches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      Response.json({ error: DESTROYED_FILE_MESSAGE }, { status: 410 })
    )))

    const result = await fetchFileBlobWithSignedUrl('/api/files/access?token=opaque')

    expect(result).toEqual({ error: DESTROYED_FILE_MESSAGE })
  })

  it('surfaces destroyed-file copy for direct signed download failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      Response.json({ error: DESTROYED_FILE_MESSAGE }, { status: 410 })
    )))

    const result = await downloadWithSignedUrl('/api/files/access?token=opaque', 'lampiran.pdf')

    expect(result).toEqual({ error: DESTROYED_FILE_MESSAGE })
  })

  it('surfaces destroyed-file copy when role download URL succeeds but file access is gone', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ signedUrl: '/api/files/access?token=opaque' }))
      .mockResolvedValueOnce(Response.json({ error: DESTROYED_FILE_MESSAGE }, { status: 410 })))

    const result = await downloadFromApi('/api/ppk/dokumen/doc-id/download/0', 'lampiran.pdf')

    expect(result).toEqual({ error: DESTROYED_FILE_MESSAGE })
  })

  it('keeps generic download fallback for non-domain failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      Response.json({ error: 'Unauthorized' }, { status: 403 })
    )))

    const result = await downloadWithSignedUrl('/api/files/access?token=opaque', 'lampiran.pdf')

    expect(result).toEqual({ error: 'Gagal mengunduh file' })
  })
})
