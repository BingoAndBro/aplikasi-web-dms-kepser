import { afterEach, describe, expect, it, vi } from 'vitest'

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111'

type MockDocument = {
  id: string
  createdBy: string
  status: string
  revisionTarget: string | null
  lampiranUrls: unknown
}

describe('resolveDocumentLampiranLogicalPathForExport (non-HTTP resolver for ZIP export)', () => {
  afterEach(() => {
    vi.doUnmock('#/db/client')
    vi.resetModules()
  })

  it('returns the same logicalPath the existing token path would resolve for a valid document + lampiran index', async () => {
    const document: MockDocument = {
      id: DOCUMENT_ID,
      createdBy: 'owner-user',
      status: 'COMPLETED',
      revisionTarget: null,
      lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
    }

    const { resolveDocumentLampiranLogicalPathForExport, resolveDocumentLampiranAccessForToken } =
      await importWithDbMock(document)

    const exportResult = await resolveDocumentLampiranLogicalPathForExport({
      documentId: DOCUMENT_ID,
      lampiranIndex: 0,
    })
    const tokenResult = await resolveDocumentLampiranAccessForToken({
      payload: {
        version: 1,
        purpose: 'preview',
        documentId: DOCUMENT_ID,
        lampiranIndex: 0,
        subjectUserId: 'owner-user',
        sessionId: 'unit-test-session',
        statusCheck: 'document',
        contentDisposition: 'inline',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
      session: { userId: 'owner-user', roles: [], sessionId: 'unit-test-session' },
    })

    expect(exportResult).toEqual({ ok: true, logicalPath: 'owner-user/document-id/file.pdf' })
    expect(exportResult).toEqual(tokenResult)
  })

  it('does not re-check ownership/role — only berkas/DIMUSNAHKAN status and path safety', async () => {
    const document: MockDocument = {
      id: DOCUMENT_ID,
      createdBy: 'owner-user',
      status: 'COMPLETED',
      revisionTarget: null,
      lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
    }

    const { resolveDocumentLampiranLogicalPathForExport } = await importWithDbMock(document)

    const result = await resolveDocumentLampiranLogicalPathForExport({
      documentId: DOCUMENT_ID,
      lampiranIndex: 0,
    })

    expect(result).toEqual({ ok: true, logicalPath: 'owner-user/document-id/file.pdf' })
  })

  it('blocks documents in a DIMUSNAHKAN berkas with the existing message', async () => {
    const document: MockDocument = {
      id: DOCUMENT_ID,
      createdBy: 'owner-user',
      status: 'COMPLETED',
      revisionTarget: null,
      lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
    }

    const { resolveDocumentLampiranLogicalPathForExport } = await importWithDbMock(document, true)

    const result = await resolveDocumentLampiranLogicalPathForExport({
      documentId: DOCUMENT_ID,
      lampiranIndex: 0,
    })

    expect(result).toEqual({ ok: false, status: 410, message: 'Data file sudah dimusnahkan' })
  })

  it('returns 404 for a lampiranIndex out of range', async () => {
    const document: MockDocument = {
      id: DOCUMENT_ID,
      createdBy: 'owner-user',
      status: 'COMPLETED',
      revisionTarget: null,
      lampiranUrls: [{ url: 'owner-user/document-id/file.pdf' }],
    }

    const { resolveDocumentLampiranLogicalPathForExport } = await importWithDbMock(document)

    const result = await resolveDocumentLampiranLogicalPathForExport({
      documentId: DOCUMENT_ID,
      lampiranIndex: 5,
    })

    expect(result).toEqual({ ok: false, status: 404, message: 'Lampiran tidak ditemukan' })
  })

  it('returns 404 without throwing for a non-UUID or missing documentId', async () => {
    const { resolveDocumentLampiranLogicalPathForExport } = await importWithDbMock(null)

    const notUuid = await resolveDocumentLampiranLogicalPathForExport({
      documentId: 'not-a-uuid',
      lampiranIndex: 0,
    })
    expect(notUuid).toEqual({ ok: false, status: 404, message: 'Dokumen tidak ditemukan' })

    const notFound = await resolveDocumentLampiranLogicalPathForExport({
      documentId: DOCUMENT_ID,
      lampiranIndex: 0,
    })
    expect(notFound).toEqual({ ok: false, status: 404, message: 'Dokumen tidak ditemukan' })
  })

  it('returns a controlled failure (not ok:true) for a malformed lampiran url entry, without leaking parsing details', async () => {
    const document: MockDocument = {
      id: DOCUMENT_ID,
      createdBy: 'owner-user',
      status: 'COMPLETED',
      revisionTarget: null,
      lampiranUrls: [{ url: '../outside-root/file.pdf' }],
    }

    const { resolveDocumentLampiranLogicalPathForExport } = await importWithDbMock(document)

    const result = await resolveDocumentLampiranLogicalPathForExport({
      documentId: DOCUMENT_ID,
      lampiranIndex: 0,
    })

    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('outside-root')
  })
})

async function importWithDbMock(document: MockDocument | null, destroyedBerkasMembership = false) {
  vi.resetModules()
  vi.doMock('#/db/client', () => ({
    db: createDocumentAccessDbMock(document, destroyedBerkasMembership),
  }))

  return import('#/lib/storage/document-file-access')
}

function createDocumentAccessDbMock(
  document: MockDocument | null,
  destroyedBerkasMembership: boolean,
) {
  const select = vi.fn()
    .mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => document ? [document] : []),
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => destroyedBerkasMembership
              ? [{ id: '22222222-2222-4222-8222-222222222222' }]
              : []),
          })),
        })),
      })),
    })

  return { select }
}
