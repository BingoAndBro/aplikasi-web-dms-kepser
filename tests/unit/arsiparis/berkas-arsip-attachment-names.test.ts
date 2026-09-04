import { describe, expect, it, vi } from 'vitest'

import {
  resolveManualAttachmentNames,
  resolveWorkflowAttachmentNames,
  resolveWorkflowAttachmentReference,
} from '#/lib/archive/berkas-arsip-attachment-names'

const DOCUMENT = {
  id: 'dokumen-id',
  judul: 'Dokumen Workflow',
  tanggal: '2026-05-30',
  is_non_material: false,
  kegiatan_nama: 'Kegiatan Pembayaran',
  jenis_dokumen_nama: null,
  jenis_permintaan_nama: 'Jenis Pembayaran',
  kategori_permintaan_nama: 'Kategori Pembayaran',
  detail_permintaan_nama: 'Detail Pembayaran',
}

describe('berkas attachment name resolver', () => {
  it('uses source-style workflow filenames when safe metadata is complete', () => {
    const names = resolveWorkflowAttachmentNames([
      {
        nama: 'Bukti Pembayaran',
        url: 'owner-user/workflow/bukti.pdf',
      },
    ], DOCUMENT)

    expect(names).toEqual([
      {
        label: 'Bukti Pembayaran',
        previewTitle: 'Bukti Pembayaran_Detail Pembayaran_Kegiatan Pembayaran_2026-05-30.pdf',
        downloadFilename: 'Bukti Pembayaran_Detail Pembayaran_Kegiatan Pembayaran_2026-05-30.pdf',
      },
    ])
  })

  it('falls back to safe workflow source labels and extensions when document metadata is incomplete', () => {
    const incompleteDocument = {
      ...DOCUMENT,
      tanggal: null,
      kegiatan_nama: null,
      jenis_permintaan_nama: null,
      kategori_permintaan_nama: null,
      detail_permintaan_nama: null,
    }

    const reference = resolveWorkflowAttachmentReference([
      {
        nama: 'Bukti Aman',
        url: 'owner-user/workflow/bukti-aman.pdf',
      },
    ], incompleteDocument, 0)

    expect(reference).toMatchObject({
      label: 'Bukti Aman',
      previewTitle: 'Bukti Aman.pdf',
      downloadFilename: 'Bukti Aman.pdf',
      logicalPath: 'owner-user/workflow/bukti-aman.pdf',
    })
  })

  it('falls back when source-style workflow filename building throws', async () => {
    vi.resetModules()
    vi.doMock('#/lib/dokumen', async (importOriginal) => {
      const actual = await importOriginal<typeof import('#/lib/dokumen')>()

      return {
        ...actual,
        buildStorageFilename: () => {
          throw new Error('synthetic document cannot build filename')
        },
      }
    })

    const module = await import('#/lib/archive/berkas-arsip-attachment-names')

    const names = module.resolveWorkflowAttachmentNames([
      {
        nama: 'Bukti Aman',
        url: 'owner-user/workflow/bukti-aman.pdf',
      },
    ], DOCUMENT)

    expect(names).toEqual([
      {
        label: 'Bukti Aman',
        previewTitle: 'Bukti Aman.pdf',
        downloadFilename: 'Bukti Aman.pdf',
      },
    ])

    vi.doUnmock('#/lib/dokumen')
    vi.resetModules()
  })

  it('uses generic workflow fallback only when metadata is unsafe', () => {
    const names = resolveWorkflowAttachmentNames([
      {
        nama: 'https://files.example.test/signed?token=secret',
        fileName: '../secret.pdf',
        original_filename: 'C:\\storage\\secret-token.pdf',
        url: 'owner-user/workflow/report.pdf',
      },
    ], DOCUMENT)

    expect(names).toEqual([
      {
        label: 'Lampiran 1',
        previewTitle: 'Lampiran 1.pdf',
        downloadFilename: 'Lampiran 1.pdf',
      },
    ])
    expect(JSON.stringify(names)).not.toContain('token')
    expect(JSON.stringify(names)).not.toContain('owner-user')
  })

  it('builds the same formal filename for manual attachments as the download endpoint (RP-06)', () => {
    expect(resolveManualAttachmentNames(
      {
        judul_lampiran: 'Bukti Manual',
        original_filename: 'manual.pdf',
        content_type: 'application/pdf',
      },
      {
        nama: 'Pengadaan ATK',
        tanggal: '2026-05-22',
        category_nama: 'Pengadaan',
      },
    )).toEqual({
      label: 'Bukti Manual',
      previewTitle: 'Bukti_Manual_Pengadaan_ATK_Pengadaan_2026-05-22.pdf',
      downloadFilename: 'Bukti_Manual_Pengadaan_ATK_Pengadaan_2026-05-22.pdf',
    })
  })

  it('falls back to generic segments when manual document metadata is missing', () => {
    expect(resolveManualAttachmentNames(
      {
        judul_lampiran: 'Bukti Manual',
        original_filename: 'manual.pdf',
        content_type: 'application/pdf',
      },
      {
        nama: null,
        tanggal: null,
        category_nama: null,
      },
    )).toEqual({
      label: 'Bukti Manual',
      previewTitle: 'Bukti_Manual_Arsip_Kategori_Tanggal.pdf',
      downloadFilename: 'Bukti_Manual_Arsip_Kategori_Tanggal.pdf',
    })
  })

  it('omits the extension rather than guessing when content type and filename are both unknown', () => {
    expect(resolveManualAttachmentNames(
      {
        judul_lampiran: 'Bukti Manual',
        original_filename: null,
        content_type: null,
      },
      {
        nama: 'Pengadaan ATK',
        tanggal: '2026-05-22',
        category_nama: 'Pengadaan',
      },
    )).toEqual({
      label: 'Bukti Manual',
      previewTitle: 'Bukti_Manual_Pengadaan_ATK_Pengadaan_2026-05-22',
      downloadFilename: 'Bukti_Manual_Pengadaan_ATK_Pengadaan_2026-05-22',
    })
  })
})
