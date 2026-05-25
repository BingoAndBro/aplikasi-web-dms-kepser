import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  createUnifiedArchiveAttachmentFileResponse,
  type UnifiedArchiveFileActionDatabase,
} from '#/lib/archive/unified-archive-file-actions'

const WORKFLOW_ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const MANUAL_ARCHIVE_ID = '22222222-2222-4222-8222-222222222222'
const DOKUMEN_ID = '33333333-3333-4333-8333-333333333333'
const MANUAL_SOURCE_ID = '44444444-4444-4444-8444-444444444444'
const ATTACHMENT_ID = '55555555-5555-4555-8555-555555555555'
const TEST_ROOT = path.resolve('.tmp', 'unified-archive-file-actions')
const WORKFLOW_LOGICAL_PATH = 'owner-user/workflow-doc/report.pdf'
const TEST_FILE_CONTENT = '%PDF-1.4 unified archive file action'

describe('unified archive file actions', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('returns safe 404 when the canonical archive row is missing', async () => {
    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: WORKFLOW_ARCHIVE_ID,
      attachmentRef: 'workflow-1',
      purpose: 'preview',
      database: createFakeDatabase({ canonicalRows: [] }),
      root: TEST_ROOT,
    })
    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(404)
    expect(body).toBe('{"error":"Arsip tidak ditemukan"}')
    expectNoLeak(body)
  })

  it('blocks DIMUSNAHKAN canonical archive file access with 410', async () => {
    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: WORKFLOW_ARCHIVE_ID,
      attachmentRef: 'workflow-1',
      purpose: 'download',
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow({ status_arsip: 'DIMUSNAHKAN' })],
      }),
      root: TEST_ROOT,
    })
    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(410)
    expect(body).toBe('{"error":"File arsip tidak tersedia karena arsip telah dimusnahkan"}')
    expectNoLeak(body)
  })

  it('streams a valid WORKFLOW archive attachment without exposing path or token details', async () => {
    await writeTestFile(WORKFLOW_LOGICAL_PATH, TEST_FILE_CONTENT)

    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: WORKFLOW_ARCHIVE_ID,
      attachmentRef: 'workflow-1',
      purpose: 'preview',
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow()],
        workflowRows: [workflowDocumentRow()],
      }),
      root: TEST_ROOT,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="Bukti Persetujuan.pdf"')
    expect(await response.text()).toBe(TEST_FILE_CONTENT)
    expectNoLeak(JSON.stringify([...response.headers.entries()]))
  })

  it('rejects WORKFLOW refs that do not belong to the canonical snapshot', async () => {
    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: WORKFLOW_ARCHIVE_ID,
      attachmentRef: 'workflow-2',
      purpose: 'preview',
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow()],
        workflowRows: [workflowDocumentRow()],
      }),
      root: TEST_ROOT,
    })
    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(404)
    expect(body).toBe('{"error":"Lampiran arsip tidak ditemukan"}')
    expectNoLeak(body)
  })

  it('rejects WORKFLOW snapshot entries without a safe server-resolvable file reference', async () => {
    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: WORKFLOW_ARCHIVE_ID,
      attachmentRef: 'workflow-1',
      purpose: 'preview',
      database: createFakeDatabase({
        canonicalRows: [workflowCanonicalRow({
          lampiran_snapshot: [{
            nama: 'Unsafe',
            url: '../secret.pdf',
          }],
        })],
        workflowRows: [workflowDocumentRow()],
      }),
      root: TEST_ROOT,
    })

    expect(response.status).toBe(404)
    expectNoLeak(JSON.stringify(await response.json()))
  })

  it('rejects MANUAL attachments that do not belong to the linked canonical source', async () => {
    const manualResponder = vi.fn(async () => new Response('should not be called'))
    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: MANUAL_ARCHIVE_ID,
      attachmentRef: `manual-${ATTACHMENT_ID}`,
      purpose: 'download',
      database: createFakeDatabase({
        canonicalRows: [manualCanonicalRow()],
        manualRows: [manualSourceRow()],
        manualAttachmentRows: [],
      }),
      root: TEST_ROOT,
      manualFileResponse: manualResponder,
    })

    expect(response.status).toBe(404)
    expect(manualResponder).not.toHaveBeenCalled()
    expectNoLeak(JSON.stringify(await response.json()))
  })

  it('delegates a valid linked MANUAL attachment to the existing safe manual file responder', async () => {
    const manualResponder = vi.fn(async () => new Response('manual-file', {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="safe.pdf"',
      },
    }))

    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: MANUAL_ARCHIVE_ID,
      attachmentRef: `manual-${ATTACHMENT_ID}`,
      purpose: 'download',
      database: createFakeDatabase({
        canonicalRows: [manualCanonicalRow()],
        manualRows: [manualSourceRow()],
        manualAttachmentRows: [manualAttachmentRow()],
      }),
      root: TEST_ROOT,
      manualFileResponse: manualResponder,
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('manual-file')
    expect(manualResponder).toHaveBeenCalledWith({
      manualArsipId: MANUAL_SOURCE_ID,
      attachmentId: ATTACHMENT_ID,
      purpose: 'download',
    })
    expectNoLeak(JSON.stringify([...response.headers.entries()]))
  })

  it('blocks stale MANUAL action links when the linked source is DIMUSNAHKAN', async () => {
    const manualResponder = vi.fn(async () => new Response('should not be called'))
    const response = await createUnifiedArchiveAttachmentFileResponse({
      archiveId: MANUAL_ARCHIVE_ID,
      attachmentRef: `manual-${ATTACHMENT_ID}`,
      purpose: 'preview',
      database: createFakeDatabase({
        canonicalRows: [manualCanonicalRow()],
        manualRows: [manualSourceRow({ status_arsip: 'DIMUSNAHKAN' })],
        manualAttachmentRows: [manualAttachmentRow()],
      }),
      root: TEST_ROOT,
      manualFileResponse: manualResponder,
    })

    expect(response.status).toBe(410)
    expect(manualResponder).not.toHaveBeenCalled()
    expectNoLeak(JSON.stringify(await response.json()))
  })
})

type FakeDatabaseOptions = {
  canonicalRows?: unknown[]
  workflowRows?: unknown[]
  manualRows?: unknown[]
  manualAttachmentRows?: unknown[]
}

function createFakeDatabase(options: FakeDatabaseOptions): UnifiedArchiveFileActionDatabase {
  return {
    select() {
      let selectedTable: unknown
      const query = {
        from(table: unknown) {
          selectedTable = table
          return query
        },
        where() {
          return query
        },
        limit() {
          return Promise.resolve(rowsFor(selectedTable, options))
        },
      }

      return query
    },
  }
}

function rowsFor(table: unknown, options: FakeDatabaseOptions): unknown[] {
  if (table === arsip) return options.canonicalRows ?? []
  if (table === dokumenTransaksi) return options.workflowRows ?? []
  if (table === manualArsip) return options.manualRows ?? []
  if (table === manualArsipAttachment) return options.manualAttachmentRows ?? []
  return []
}

function workflowCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WORKFLOW_ARCHIVE_ID,
    source_type: 'WORKFLOW',
    dokumen_id: DOKUMEN_ID,
    status_arsip: 'AKTIF',
    lampiran_snapshot: [{
      nama: 'Bukti Persetujuan',
      content_type: 'application/pdf',
      url: WORKFLOW_LOGICAL_PATH,
    }],
    ...overrides,
  }
}

function manualCanonicalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_ARCHIVE_ID,
    source_type: 'MANUAL',
    dokumen_id: null,
    status_arsip: 'AKTIF',
    lampiran_snapshot: null,
    ...overrides,
  }
}

function workflowDocumentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DOKUMEN_ID,
    status: 'ARCHIVED',
    ...overrides,
  }
}

function manualSourceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MANUAL_SOURCE_ID,
    status_arsip: 'AKTIF',
    ...overrides,
  }
}

function manualAttachmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ATTACHMENT_ID,
    ...overrides,
  }
}

async function writeTestFile(logicalPath: string, content: string): Promise<void> {
  const targetPath = path.join(TEST_ROOT, ...logicalPath.split('/'))
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)
}

function expectNoLeak(value: string): void {
  expect(value).not.toContain('logical_path')
  expect(value).not.toContain('physical_path')
  expect(value).not.toContain('signedUrl')
  expect(value).not.toContain('signed_url')
  expect(value).not.toContain('token')
  expect(value).not.toContain('secret')
  expect(value).not.toContain('owner-user')
  expect(value).not.toContain('workflow-doc')
  expect(value).not.toContain('manual-arsip')
  expect(value).not.toContain(TEST_ROOT)
  expect(value).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(value).not.toContain('DATABASE_URL')
  expect(value).not.toContain('select ')
  expect(value).not.toContain('from ')
}
