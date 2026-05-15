import { describe, expect, it } from 'vitest'

import {
  createInternalFileAccessUrl,
  INTERNAL_FILE_ACCESS_PATH,
} from '#/lib/storage/internal-file-access-url'
import {
  verifyFileAccessToken,
  type FileAccessTokenPayload,
} from '#/lib/storage/file-access-token'

const TEST_SECRET = 'unit-test-internal-file-access-url-secret'
const NOW = new Date('2026-05-15T10:00:00.000Z')
const FUTURE = NOW.getTime() + 15 * 60 * 1000

function basePayload(
  overrides: Partial<FileAccessTokenPayload> = {},
): FileAccessTokenPayload {
  return {
    version: 1,
    purpose: 'preview',
    expiresAt: FUTURE,
    issuedAt: NOW.getTime(),
    logicalPath: 'owner-user/document-id/file.pdf',
    contentDisposition: 'inline',
    ...overrides,
  }
}

function extractToken(internalUrl: string): string | null {
  return new URL(internalUrl, 'http://localhost').searchParams.get('token')
}

describe('internal file access URL builder', () => {
  it('builds a relative internal file access URL with one token query parameter', () => {
    const internalUrl = createInternalFileAccessUrl({
      payload: basePayload(),
      secret: TEST_SECRET,
    })

    expect(internalUrl.startsWith(`${INTERNAL_FILE_ACCESS_PATH}?`)).toBe(true)
    expect(internalUrl).not.toMatch(/^https?:\/\//)

    const parsedUrl = new URL(internalUrl, 'http://localhost')
    expect(parsedUrl.pathname).toBe(INTERNAL_FILE_ACCESS_PATH)
    expect([...parsedUrl.searchParams.keys()]).toEqual(['token'])
  })

  it('creates a token that verifies back to the supplied payload', () => {
    const payload = basePayload()
    const internalUrl = createInternalFileAccessUrl({
      payload,
      secret: TEST_SECRET,
    })
    const token = extractToken(internalUrl)

    expect(token).toBeTruthy()
    expect(verifyFileAccessToken(token ?? '', TEST_SECRET, NOW)).toEqual(payload)
  })

  it('URL-encodes the token through URLSearchParams', () => {
    const internalUrl = createInternalFileAccessUrl({
      payload: basePayload(),
      secret: TEST_SECRET,
    })
    const token = extractToken(internalUrl)

    expect(token).toBeTruthy()
    expect(internalUrl).toBe(`${INTERNAL_FILE_ACCESS_PATH}?${new URLSearchParams({
      token: token ?? '',
    }).toString()}`)
  })

  it('does not place raw file references or host data directly in the URL', () => {
    const internalUrl = createInternalFileAccessUrl({
      payload: basePayload({
        logicalPath: 'owner-user/document-id/confidential-report.pdf',
      }),
      secret: TEST_SECRET,
    })

    expect(internalUrl).not.toContain('owner-user')
    expect(internalUrl).not.toContain('document-id')
    expect(internalUrl).not.toContain('confidential-report.pdf')
    expect(internalUrl).not.toContain('localhost')
    expect(internalUrl).not.toContain('storage')
  })

  it('does not include the signing secret in the generated URL', () => {
    const internalUrl = createInternalFileAccessUrl({
      payload: basePayload(),
      secret: TEST_SECRET,
    })

    expect(internalUrl).not.toContain(TEST_SECRET)
  })

  it('does not include filesystem-looking absolute paths outside the token query value', () => {
    const internalUrl = createInternalFileAccessUrl({
      payload: basePayload(),
      secret: TEST_SECRET,
    })
    const parsedUrl = new URL(internalUrl, 'http://localhost')

    expect(parsedUrl.pathname).toBe(INTERNAL_FILE_ACCESS_PATH)
    expect([...parsedUrl.searchParams.keys()]).toEqual(['token'])
    expect(parsedUrl.pathname).not.toContain(':\\')
    expect(parsedUrl.pathname).not.toContain('C:')
    expect(parsedUrl.pathname).not.toContain('/tmp/')
    expect(parsedUrl.pathname).not.toContain('/storage/')
  })

  it('supports document reference tokens without endpoint wiring', () => {
    const payload = basePayload({
      logicalPath: undefined,
      documentId: 'document-123',
      lampiranIndex: 0,
      statusCheck: 'document',
    })
    const internalUrl = createInternalFileAccessUrl({
      payload,
      secret: TEST_SECRET,
    })

    expect(verifyFileAccessToken(extractToken(internalUrl) ?? '', TEST_SECRET, NOW)).toEqual(payload)
  })

  it('round-trips a safe download filename payload through token verification', () => {
    const payload = basePayload({
      purpose: 'download',
      contentDisposition: 'attachment',
      downloadFilename: 'document-123_report.pdf',
    })
    const internalUrl = createInternalFileAccessUrl({
      payload,
      secret: TEST_SECRET,
    })

    expect(verifyFileAccessToken(extractToken(internalUrl) ?? '', TEST_SECRET, NOW)).toEqual(payload)
  })

  it('propagates token helper validation failures', () => {
    expect(() => createInternalFileAccessUrl({
      payload: basePayload({
        logicalPath: '../outside.pdf',
      }),
      secret: TEST_SECRET,
    })).toThrow('traversal')

    expect(() => createInternalFileAccessUrl({
      payload: basePayload(),
      secret: ' ',
    })).toThrow('secret')
  })

  it('rejects forbidden sensitive claims through token helper validation', () => {
    const payloadWithSensitiveClaim = {
      ...basePayload(),
      storageRoot: 'storage',
    } as unknown as FileAccessTokenPayload

    expect(() => createInternalFileAccessUrl({
      payload: payloadWithSensitiveClaim,
      secret: TEST_SECRET,
    })).toThrow('sensitive claim')
  })
})
