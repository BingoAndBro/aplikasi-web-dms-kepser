import { describe, expect, it } from 'vitest'

import {
  resolveBerkasArsipItemAttachments,
  type BerkasArsipFileAccessRepository,
} from '#/lib/archive/berkas-arsip-file-access'

const BERKAS_ID = '11111111-1111-4111-8111-111111111111'
const WORKFLOW_ITEM_ID = '33333333-3333-4333-8333-333333333333'
const MANUAL_ITEM_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_ITEM_ID = '99999999-9999-4999-8999-999999999999'
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const MANUAL_ARSIP_ID = '66666666-6666-4666-8666-666666666666'

describe('resolveBerkasArsipItemAttachments (non-HTTP resolver for RP-02 ZIP export)', () => {
  it('returns all 3 attachments for a WORKFLOW item, namaAman matching the existing download filename', async () => {
    const result = await resolveBerkasArsipItemAttachments(BERKAS_ID, WORKFLOW_ITEM_ID, {
      repository: createRepository({
        workflowLampiranUrls: [
          { nama: 'Bukti Satu', url: 'owner/doc/1.pdf', content_type: 'application/pdf' },
          { nama: 'Bukti Dua', url: 'owner/doc/2.pdf', content_type: 'application/pdf' },
          { nama: 'Bukti Tiga', url: 'owner/doc/3.pdf', content_type: 'application/pdf' },
        ],
      }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.attachments).toHaveLength(3)
    expect(result.attachments[0]).toEqual({
      logicalPath: 'owner/doc/1.pdf',
      namaAman: 'Bukti Satu_Detail Pembayaran_Kegiatan Pembayaran_2026-05-29.pdf',
    })
  })

  it('returns all attachments for a MANUAL item, namaAman matching the existing download filename (RP-06 follow-up)', async () => {
    const result = await resolveBerkasArsipItemAttachments(BERKAS_ID, MANUAL_ITEM_ID, {
      repository: createRepository({
        manualAttachments: [
          {
            logicalPath: 'owner/manual/1.pdf',
            judulLampiran: 'Lampiran Satu',
            originalFilename: 'satu.pdf',
            contentType: 'application/pdf',
            manualNama: 'Dokumen Manual',
            manualTanggal: '2026-05-30',
            categoryNama: 'Pengadaan',
          },
          {
            logicalPath: 'owner/manual/2.pdf',
            judulLampiran: 'Lampiran Dua',
            originalFilename: 'dua.pdf',
            contentType: 'application/pdf',
            manualNama: 'Dokumen Manual',
            manualTanggal: '2026-05-30',
            categoryNama: 'Pengadaan',
          },
        ],
      }),
    })

    expect(result).toEqual({
      ok: true,
      attachments: [
        { logicalPath: 'owner/manual/1.pdf', namaAman: 'Lampiran_Satu_Dokumen_Manual_Pengadaan_2026-05-30.pdf' },
        { logicalPath: 'owner/manual/2.pdf', namaAman: 'Lampiran_Dua_Dokumen_Manual_Pengadaan_2026-05-30.pdf' },
      ],
    })
  })

  it('returns an empty array (not an error) for a WORKFLOW item with no lampiran_urls', async () => {
    const result = await resolveBerkasArsipItemAttachments(BERKAS_ID, WORKFLOW_ITEM_ID, {
      repository: createRepository({ workflowLampiranUrls: [] }),
    })

    expect(result).toEqual({ ok: true, attachments: [] })
  })

  it('returns an empty array (not an error) for a MANUAL item with 0 attachment rows', async () => {
    const result = await resolveBerkasArsipItemAttachments(BERKAS_ID, MANUAL_ITEM_ID, {
      repository: createRepository({ manualAttachments: [] }),
    })

    expect(result).toEqual({ ok: true, attachments: [] })
  })

  it('rejects the whole item (not partial) when the folder is DIMUSNAHKAN', async () => {
    const result = await resolveBerkasArsipItemAttachments(BERKAS_ID, WORKFLOW_ITEM_ID, {
      repository: createRepository({ folderStatus: 'DIMUSNAHKAN' }),
    })

    expect(result).toEqual({ ok: false, status: 410, message: 'Data file sudah dimusnahkan' })
  })

  it('returns a controlled 404 without throwing when the item does not belong to the berkas', async () => {
    const result = await resolveBerkasArsipItemAttachments(BERKAS_ID, OTHER_ITEM_ID, {
      repository: createRepository(),
    })

    expect(result).toEqual({ ok: false, status: 404, message: 'Lampiran berkas tidak ditemukan' })
  })

  it('returns a controlled 404 without crashing for an unrecognized source_type', async () => {
    const result = await resolveBerkasArsipItemAttachments(BERKAS_ID, WORKFLOW_ITEM_ID, {
      repository: createRepository({ itemSourceType: 'UNKNOWN' }),
    })

    expect(result).toEqual({ ok: false, status: 404, message: 'Sumber item tidak ditemukan' })
  })
})

type RepositoryOptions = {
  folderStatus?: 'AKTIF' | 'DIMUSNAHKAN'
  itemSourceType?: string
  workflowLampiranUrls?: unknown[]
  manualAttachments?: Array<{
    logicalPath: string
    judulLampiran: string
    originalFilename?: string | null
    contentType?: string | null
    manualNama?: string | null
    manualTanggal?: string | null
    categoryNama?: string | null
  }>
}

function createRepository(options: RepositoryOptions = {}): BerkasArsipFileAccessRepository {
  return {
    async getFolderById(berkasId) {
      if (berkasId !== BERKAS_ID) return null

      return { id: BERKAS_ID, status_arsip: options.folderStatus ?? 'AKTIF' }
    },
    async getItemById(_berkasId, itemId) {
      if (itemId === WORKFLOW_ITEM_ID) {
        return {
          id: WORKFLOW_ITEM_ID,
          berkas_id: BERKAS_ID,
          source_type: options.itemSourceType ?? 'WORKFLOW',
          dokumen_id: DOKUMEN_ID,
          manual_arsip_id: null,
        }
      }

      if (itemId === MANUAL_ITEM_ID) {
        return {
          id: MANUAL_ITEM_ID,
          berkas_id: BERKAS_ID,
          source_type: 'MANUAL',
          dokumen_id: null,
          manual_arsip_id: MANUAL_ARSIP_ID,
        }
      }

      return null
    },
    async getWorkflowSourceById(dokumenId) {
      if (dokumenId !== DOKUMEN_ID) return null

      return {
        id: DOKUMEN_ID,
        judul: 'Dokumen Workflow',
        tanggal: '2026-05-29',
        is_non_material: false,
        kegiatan_nama: 'Kegiatan Pembayaran',
        jenis_dokumen_nama: null,
        jenis_permintaan_nama: 'Jenis Pembayaran',
        kategori_permintaan_nama: 'Kategori Pembayaran',
        detail_permintaan_nama: 'Detail Pembayaran',
        lampiran_urls: options.workflowLampiranUrls ?? [{
          nama: 'Bukti Pembayaran',
          url: 'owner/doc/1.pdf',
          content_type: 'application/pdf',
        }],
      }
    },
    async getManualAttachmentByIndex(manualArsipId, lampiranIndex) {
      if (manualArsipId !== MANUAL_ARSIP_ID) return null

      const rows = options.manualAttachments ?? []
      const row = rows[lampiranIndex]

      return row ? { id: `${lampiranIndex}` } : null
    },
    async getManualAttachmentsForItem(manualArsipId) {
      if (manualArsipId !== MANUAL_ARSIP_ID) return []

      return (options.manualAttachments ?? [
        { logicalPath: 'owner/manual/1.pdf', judulLampiran: 'Lampiran Manual' },
      ]).map(row => ({
        originalFilename: null,
        contentType: null,
        manualNama: null,
        manualTanggal: null,
        categoryNama: null,
        ...row,
      }))
    },
  }
}
