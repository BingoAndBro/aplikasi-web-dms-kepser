import { describe, expect, it } from 'vitest'

import {
  assertValidFileAccessTokenPayload,
  isFileAccessTokenPurpose,
  signFileAccessToken,
  verifyFileAccessToken,
  type FileAccessTokenPayload,
} from '#/lib/storage/file-access-token'

const TEST_SECRET = 'unit-test-file-token-secret'
const NOW = new Date('2026-05-14T10:00:00.000Z')
const FUTURE = NOW.getTime() + 15 * 60 * 1000

function basePayload(overrides: Partial<FileAccessTokenPayload> = {}): FileAccessTokenPayload {
  return {
    version: 1,
    purpose: 'preview',
    expiresAt: FUTURE,
    issuedAt: NOW.getTime(),
    documentId: 'document-123',
    lampiranIndex: 0,
    contentDisposition: 'inline',
    statusCheck: 'document',
    ...overrides,
  }
}

describe('file access token helpers', () => {
  it('signs and verifies a preview token payload', () => {
    const payload = basePayload()
    const token = signFileAccessToken(payload, TEST_SECRET)

    expect(verifyFileAccessToken(token, TEST_SECRET, NOW)).toEqual(payload)
  })

  it('uses deterministic payload serialization for signing', () => {
    const first = signFileAccessToken(basePayload(), TEST_SECRET)
    const second = signFileAccessToken({
      statusCheck: 'document',
      contentDisposition: 'inline',
      lampiranIndex: 0,
      documentId: 'document-123',
      issuedAt: NOW.getTime(),
      expiresAt: FUTURE,
      purpose: 'preview',
      version: 1,
    }, TEST_SECRET)

    expect(first).toBe(second)
  })

  it('supports a raw logical path token without resolving physical paths', () => {
    const payload = basePayload({
      documentId: undefined,
      lampiranIndex: undefined,
      logicalPath: 'user-123//document-123/file.pdf',
    })
    const expectedPayload = {
      ...payload,
      logicalPath: 'user-123/document-123/file.pdf',
    }

    const token = signFileAccessToken(payload, TEST_SECRET)

    expect(verifyFileAccessToken(token, TEST_SECRET, NOW)).toEqual(expectedPayload)
  })

  it('rejects expired tokens during verification', () => {
    const token = signFileAccessToken(basePayload({
      issuedAt: NOW.getTime() - 10 * 60 * 1000,
      expiresAt: NOW.getTime() - 1,
    }), TEST_SECRET)

    expect(verifyFileAccessToken(token, TEST_SECRET, NOW)).toBeNull()
  })

  it('rejects tampered tokens', () => {
    const token = signFileAccessToken(basePayload(), TEST_SECRET)
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`

    expect(verifyFileAccessToken(tamperedToken, TEST_SECRET, NOW)).toBeNull()
  })

  it('rejects malformed token strings', () => {
    expect(verifyFileAccessToken('', TEST_SECRET, NOW)).toBeNull()
    expect(verifyFileAccessToken('not-a-token', TEST_SECRET, NOW)).toBeNull()
    expect(verifyFileAccessToken('v2.invalid.invalid', TEST_SECRET, NOW)).toBeNull()
    expect(verifyFileAccessToken('v1.invalid.invalid.extra', TEST_SECRET, NOW)).toBeNull()
  })

  it('validates allowed token purposes', () => {
    expect(isFileAccessTokenPurpose('preview')).toBe(true)
    expect(isFileAccessTokenPurpose('download')).toBe(true)
    expect(isFileAccessTokenPurpose('delete')).toBe(false)
  })

  it('rejects invalid core claims', () => {
    expect(() => assertValidFileAccessTokenPayload({
      ...basePayload(),
      version: 2,
    })).toThrow('version')

    expect(() => assertValidFileAccessTokenPayload({
      ...basePayload(),
      purpose: 'delete',
    })).toThrow('purpose')

    expect(() => assertValidFileAccessTokenPayload({
      ...basePayload(),
      expiresAt: 1.5,
    })).toThrow('expiresAt')
  })

  it('requires a file reference claim', () => {
    expect(() => assertValidFileAccessTokenPayload({
      version: 1,
      purpose: 'preview',
      expiresAt: FUTURE,
    })).toThrow('file reference')
  })

  it('requires document tokens to include a valid lampiran index', () => {
    expect(() => assertValidFileAccessTokenPayload(basePayload({
      lampiranIndex: undefined,
    }))).toThrow('file reference')

    expect(() => assertValidFileAccessTokenPayload(basePayload({
      lampiranIndex: -1,
    }))).toThrow('lampiranIndex')
  })

  it('rejects unsupported and sensitive claims', () => {
    expect(() => assertValidFileAccessTokenPayload({
      ...basePayload(),
      extra: 'value',
    })).toThrow('unsupported claim')

    expect(() => assertValidFileAccessTokenPayload({
      ...basePayload(),
      storageRoot: 'storage',
    })).toThrow('sensitive claim')

    expect(() => assertValidFileAccessTokenPayload({
      ...basePayload(),
      sessionTokenHash: 'hash-value',
    })).toThrow('sensitive claim')
  })

  it('rejects unsafe string claim values', () => {
    expect(() => assertValidFileAccessTokenPayload(basePayload({
      logicalPath: 'user-123/../file.pdf',
    }))).toThrow('traversal')

    expect(() => assertValidFileAccessTokenPayload(basePayload({
      logicalPath: 'user-123/./file.pdf',
    }))).toThrow('dot')

    expect(() => assertValidFileAccessTokenPayload(basePayload({
      logicalPath: 'user-123//../file.pdf',
    }))).toThrow('traversal')

    expect(() => assertValidFileAccessTokenPayload(basePayload({
      logicalPath: 'C:\\storage\\file.pdf',
    }))).toThrow('Windows absolute path')

    expect(() => assertValidFileAccessTokenPayload(basePayload({
      logicalPath: 'file://storage/file.pdf',
    }))).toThrow('URL')

    expect(() => assertValidFileAccessTokenPayload(basePayload({
      purpose: 'download',
      contentDisposition: 'attachment',
      downloadFilename: 'folder/report.pdf',
    }))).toThrow('path separators')
  })

  it('keeps preview and download disposition claims consistent with purpose', () => {
    expect(() => assertValidFileAccessTokenPayload(basePayload({
      contentDisposition: 'attachment',
    }))).toThrow('Preview')

    expect(() => assertValidFileAccessTokenPayload(basePayload({
      purpose: 'download',
      contentDisposition: 'inline',
    }))).toThrow('Download')

    expect(assertValidFileAccessTokenPayload(basePayload({
      purpose: 'download',
      contentDisposition: 'attachment',
      downloadFilename: 'document-123_report.pdf',
    }))).toMatchObject({
      purpose: 'download',
      contentDisposition: 'attachment',
    })
  })
})
