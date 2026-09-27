import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadPendingFile } from '#/lib/storage/pending-upload-client'
import { DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE } from '#/lib/upload/document-upload-policy'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadPendingFile', () => {
  it('posts the file to the pending upload endpoint and returns its pending path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: 'u/k_1778064971564_a.pdf' }, 201))
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' })

    const result = await uploadPendingFile({ file, kelengkapanId: 'k-uuid', namaDokumen: 'Bukti' })

    expect(result).toEqual({ ok: true, url: 'u/k_1778064971564_a.pdf' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/upload')
    const body = init.body as FormData
    expect(body.get('file')).toBeInstanceOf(File)
    expect(body.get('kelengkapan_id')).toBe('k-uuid')
    expect(body.get('nama_dokumen')).toBe('Bukti')
  })

  it('returns the server error message when the upload is rejected', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Format file tidak didukung.' }, 400))

    const result = await uploadPendingFile({ file: new File(['x'], 'x.txt'), kelengkapanId: 'k', namaDokumen: 'X' })

    expect(result).toEqual({ ok: false, error: 'Format file tidak didukung.' })
  })

  it('falls back to the generic message on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))

    const result = await uploadPendingFile({ file: new File(['x'], 'x.pdf'), kelengkapanId: 'k', namaDokumen: 'X' })

    expect(result).toEqual({ ok: false, error: DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE })
  })
})

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
