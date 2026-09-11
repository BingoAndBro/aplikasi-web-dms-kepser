import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createBerkasArsipItemAttachmentFileResponse,
  type BerkasArsipFileAccessRepository,
} from '#/lib/archive/berkas-arsip-file-access'

const BERKAS_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_BERKAS_ID = '22222222-2222-4222-8222-222222222222'
const WORKFLOW_ITEM_ID = '33333333-3333-4333-8333-333333333333'
const MANUAL_ITEM_ID = '44444444-4444-4444-8444-444444444444'
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const MANUAL_ARSIP_ID = '66666666-6666-4666-8666-666666666666'
const MANUAL_ATTACHMENT_ID = '77777777-7777-4777-8777-777777777777'
const TEST_ROOT = path.resolve('.tmp', 'berkas-arsip-file-access')
const WORKFLOW_LOGICAL_PATH = 'owner-user/workflow/report.pdf'
const TEST_FILE_CONTENT = '%PDF-1.4 folder berkas file'

describe('berkas arsip item file access helper', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('streams a WORKFLOW item attachment for non-DIMUSNAHKAN folders', async () => {
    await writeTestFile(WORKFLOW_LOGICAL_PATH, TEST_FILE_CONTENT)

    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'preview',
    }, {
      repository: createRepository(),
      root: TEST_ROOT,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toBe(
      'inline; filename="Bukti Pembayaran_Detail Pembayaran_Kegiatan Pembayaran_2026-05-29.pdf"',
    )
    expect(await response.text()).toBe(TEST_FILE_CONTENT)
    expectNoLeak(JSON.stringify([...response.headers.entries()]))
  })

  it('uses the existing dokumen persetujuan filename format for WORKFLOW downloads', async () => {
    await writeTestFile(WORKFLOW_LOGICAL_PATH, TEST_FILE_CONTENT)

    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'download',
    }, {
      repository: createRepository({
        workflowLampiranUrls: [{
          nama: 'Label Persetujuan',
          fileName: 'Bukti Transfer Final.pdf',
          url: WORKFLOW_LOGICAL_PATH,
          content_type: 'application/pdf',
        }],
      }),
      root: TEST_ROOT,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Label Persetujuan_Detail Pembayaran_Kegiatan Pembayaran_2026-05-29.pdf"',
    )
    expectNoLeak(JSON.stringify([...response.headers.entries()]))
  })

  it('falls back safely when WORKFLOW filename metadata is unsafe or incomplete', async () => {
    await writeTestFile(WORKFLOW_LOGICAL_PATH, TEST_FILE_CONTENT)

    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'download',
    }, {
      repository: createRepository({
        workflowLampiranUrls: [{
          nama: 'Bukti Aman',
          fileName: '../rahasia.pdf',
          url: WORKFLOW_LOGICAL_PATH,
          content_type: 'application/pdf',
        }],
      }),
      root: TEST_ROOT,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Bukti Aman_Detail Pembayaran_Kegiatan Pembayaran_2026-05-29.pdf"',
    )
    expectNoLeak(JSON.stringify([...response.headers.entries()]))
  })

  it('uses generic WORKFLOW fallback names only when source metadata has no safe usable name', async () => {
    await writeTestFile(WORKFLOW_LOGICAL_PATH, TEST_FILE_CONTENT)

    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'download',
    }, {
      repository: createRepository({
        workflowDocumentOverrides: {
          tanggal: null,
          kegiatan_nama: null,
          komponen_nama: null,
          jenis_permintaan_nama: null,
          kategori_permintaan_nama: null,
          detail_permintaan_nama: null,
        },
        workflowLampiranUrls: [{
          nama: 'https://files.example.test/signed?token=secret',
          fileName: '../rahasia.pdf',
          original_filename: 'C:\\storage\\secret-token.pdf',
          url: WORKFLOW_LOGICAL_PATH,
          content_type: 'application/pdf',
        }],
      }),
      root: TEST_ROOT,
    })

    const header = response.headers.get('Content-Disposition') ?? ''

    expect(response.status).toBe(200)
    expect(header).toBe('attachment; filename="Lampiran 1.pdf"')
    expectNoLeak(header)
  })

  it('serves WORKFLOW files with label fallback when master metadata and content type are incomplete', async () => {
    await writeTestFile(WORKFLOW_LOGICAL_PATH, TEST_FILE_CONTENT)

    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'preview',
    }, {
      repository: createRepository({
        workflowDocumentOverrides: {
          tanggal: null,
          kegiatan_nama: null,
          komponen_nama: null,
          jenis_permintaan_nama: null,
          kategori_permintaan_nama: null,
          detail_permintaan_nama: null,
        },
        workflowLampiranUrls: [{
          nama: 'Bukti Aman',
          url: WORKFLOW_LOGICAL_PATH,
        }],
      }),
      root: TEST_ROOT,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="Bukti Aman.pdf"')
    expect(await response.text()).toBe(TEST_FILE_CONTENT)
    expectNoLeak(JSON.stringify([...response.headers.entries()]))
  })

  it('delegates a MANUAL item attachment by folder item and lampiran index', async () => {
    const manualFileResponse = vi.fn(async () => new Response('manual-file', {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="manual.pdf"',
      },
    }))

    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: MANUAL_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'download',
    }, {
      repository: createRepository(),
      manualFileResponse,
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('manual-file')
    expect(manualFileResponse).toHaveBeenCalledWith({
      manualArsipId: MANUAL_ARSIP_ID,
      attachmentId: MANUAL_ATTACHMENT_ID,
      purpose: 'download',
    })
    expectNoLeak(JSON.stringify([...response.headers.entries()]))
  })

  it.each([
    ['WORKFLOW', WORKFLOW_ITEM_ID],
    ['MANUAL', MANUAL_ITEM_ID],
  ] as const)('blocks stale %s item links when the current folder is DIMUSNAHKAN', async (_sourceType, itemId) => {
    const manualFileResponse = vi.fn(async () => new Response('should not be called'))
    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId,
      lampiranIndex: 0,
      purpose: 'preview',
    }, {
      repository: createRepository({ folderStatus: 'DIMUSNAHKAN' }),
      root: TEST_ROOT,
      manualFileResponse,
    })

    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(410)
    expect(body).toBe('{"error":"Data file sudah dimusnahkan"}')
    expect(manualFileResponse).not.toHaveBeenCalled()
    expectNoLeak(body)
  })

  it('revalidates folder lifecycle on each request and blocks after status changes', async () => {
    await writeTestFile(WORKFLOW_LOGICAL_PATH, TEST_FILE_CONTENT)

    let folderStatus: 'AKTIF' | 'DIMUSNAHKAN' = 'AKTIF'
    const repository = createRepository({
      get folderStatus() {
        return folderStatus
      },
    })

    const first = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'preview',
    }, {
      repository,
      root: TEST_ROOT,
    })

    folderStatus = 'DIMUSNAHKAN'

    const stale = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'preview',
    }, {
      repository,
      root: TEST_ROOT,
    })

    expect(first.status).toBe(200)
    expect(stale.status).toBe(410)
    expect(await stale.json()).toEqual({ error: 'Data file sudah dimusnahkan' })
  })

  it('rejects item references that do not belong to the folder', async () => {
    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'download',
    }, {
      repository: createRepository({ itemBerkasId: OTHER_BERKAS_ID }),
      root: TEST_ROOT,
    })

    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(404)
    expect(body).toBe('{"error":"Lampiran berkas tidak ditemukan"}')
    expectNoLeak(body)
  })

  it('rejects missing source rows cleanly', async () => {
    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 0,
      purpose: 'preview',
    }, {
      repository: createRepository({ workflowSourceMissing: true }),
      root: TEST_ROOT,
    })

    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(404)
    expect(body).toBe('{"error":"Sumber item tidak ditemukan"}')
    expectNoLeak(body)
  })

  it('rejects invalid lampiran indexes cleanly', async () => {
    const response = await createBerkasArsipItemAttachmentFileResponse({
      berkasId: BERKAS_ID,
      itemId: WORKFLOW_ITEM_ID,
      lampiranIndex: 9,
      purpose: 'download',
    }, {
      repository: createRepository(),
      root: TEST_ROOT,
    })

    const body = JSON.stringify(await response.json())

    expect(response.status).toBe(404)
    expect(body).toBe('{"error":"Lampiran berkas tidak ditemukan"}')
    expectNoLeak(body)
  })

  it('does not expose paths, storage roots, tokens, raw SQL, or raw rows in error DTOs', async () => {
    const responses = await Promise.all([
      createBerkasArsipItemAttachmentFileResponse({
        berkasId: BERKAS_ID,
        itemId: WORKFLOW_ITEM_ID,
        lampiranIndex: 0,
        purpose: 'preview',
      }, {
        repository: createRepository({
          workflowLampiranUrls: [{ nama: 'Unsafe', url: '../secret.pdf' }],
        }),
        root: TEST_ROOT,
      }),
      createBerkasArsipItemAttachmentFileResponse({
        berkasId: BERKAS_ID,
        itemId: MANUAL_ITEM_ID,
        lampiranIndex: 99,
        purpose: 'download',
      }, {
        repository: createRepository(),
      }),
    ])

    for (const response of responses) {
      expect(response.status).not.toBe(200)
      expectNoLeak(JSON.stringify(await response.json()))
    }
  })
})

type RepositoryOptions = {
  folderStatus?: 'AKTIF' | 'DIMUSNAHKAN'
  itemBerkasId?: string
  workflowSourceMissing?: boolean
  workflowLampiranUrls?: unknown
  manualAttachments?: Array<{
    logicalPath: string
    judulLampiran: string
    originalFilename?: string | null
    contentType?: string | null
    manualNama?: string | null
    manualTanggal?: string | null
    komponenNama?: string | null
  }>
  workflowDocumentOverrides?: Partial<{
    tanggal: string | null
    is_non_material: boolean | null
    kegiatan_nama: string | null
    komponen_nama: string | null
    jenis_permintaan_nama: string | null
    kategori_permintaan_nama: string | null
    detail_permintaan_nama: string | null
  }>
}

function createRepository(options: RepositoryOptions = {}): BerkasArsipFileAccessRepository {
  return {
    async getFolderById(berkasId) {
      if (berkasId !== BERKAS_ID) return null

      return {
        id: BERKAS_ID,
        status_arsip: options.folderStatus ?? 'AKTIF',
      }
    },
    async getItemById(_berkasId, itemId) {
      if (itemId === WORKFLOW_ITEM_ID) {
        return {
          id: WORKFLOW_ITEM_ID,
          berkas_id: options.itemBerkasId ?? BERKAS_ID,
          source_type: 'WORKFLOW',
          dokumen_id: DOKUMEN_ID,
          manual_arsip_id: null,
        }
      }

      if (itemId === MANUAL_ITEM_ID) {
        return {
          id: MANUAL_ITEM_ID,
          berkas_id: options.itemBerkasId ?? BERKAS_ID,
          source_type: 'MANUAL',
          dokumen_id: null,
          manual_arsip_id: MANUAL_ARSIP_ID,
        }
      }

      return null
    },
    async getWorkflowSourceById(dokumenId) {
      if (options.workflowSourceMissing || dokumenId !== DOKUMEN_ID) return null

      return {
        id: DOKUMEN_ID,
        judul: 'Dokumen Workflow',
        tanggal: '2026-05-29',
        is_non_material: false,
        kegiatan_nama: 'Kegiatan Pembayaran',
        komponen_nama: 'Komponen Pembayaran',
        nama_dokumen: null,
        jenis_permintaan_nama: 'Jenis Pembayaran',
        kategori_permintaan_nama: 'Kategori Pembayaran',
        detail_permintaan_nama: 'Detail Pembayaran',
        lampiran_urls: options.workflowLampiranUrls ?? [{
          nama: 'Bukti Pembayaran',
          url: WORKFLOW_LOGICAL_PATH,
          content_type: 'application/pdf',
        }],
        ...options.workflowDocumentOverrides,
      }
    },
    async getManualAttachmentByIndex(manualArsipId, lampiranIndex) {
      if (manualArsipId !== MANUAL_ARSIP_ID || lampiranIndex !== 0) return null

      return { id: MANUAL_ATTACHMENT_ID }
    },
    async getManualAttachmentsForItem(manualArsipId) {
      if (manualArsipId !== MANUAL_ARSIP_ID) return []

      return (options.manualAttachments ?? [
        { logicalPath: 'owner-user/manual/lampiran.pdf', judulLampiran: 'Lampiran Manual' },
      ]).map(row => ({
        originalFilename: null,
        contentType: null,
        manualNama: null,
        manualTanggal: null,
        komponenNama: null,
        ...row,
      }))
    },
  }
}

async function writeTestFile(logicalPath: string, content: string): Promise<void> {
  const targetPath = path.join(TEST_ROOT, ...logicalPath.split('/'))
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)
}

function expectNoLeak(value: string): void {
  expect(value).not.toContain('logical_path')
  expect(value).not.toContain('logicalPath')
  expect(value).not.toContain('physical_path')
  expect(value).not.toContain('signedUrl')
  expect(value).not.toContain('signed_url')
  expect(value).not.toContain('token')
  expect(value).not.toContain('secret')
  expect(value).not.toContain('owner-user')
  expect(value).not.toContain('workflow/report')
  expect(value).not.toContain(TEST_ROOT)
  expect(value).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(value).not.toContain('DATABASE_URL')
  expect(value).not.toContain('select ')
  expect(value).not.toContain('from ')
  expect(value).not.toContain('SQL')
  expect(value).not.toContain('session')
  expect(value).not.toContain('cookie')
  expect(value).not.toContain('raw')
}
