import { describe, expect, it } from 'vitest'

import type { DocumentZipEntry } from '#/lib/export/document-zip'
import { rencanakanFileDrive } from '#/lib/google-drive/rencana-file'

const DOC_A = '33333333-3333-4333-8333-333333333333'
const DOC_B = '44444444-4444-4444-8444-444444444444'
const MANUAL = '55555555-5555-4555-8555-555555555555'
const ATT = '66666666-6666-4666-8666-666666666666'

describe('rencanakanFileDrive', () => {
  it('nama file sama dengan ZIP, kunci menjadi kolom sumber, urutan berurutan, content type dari path', () => {
    const entries: DocumentZipEntry[] = [
      {
        folderPath: '2026-10-01_Rapat_33333333',
        files: [
          { namaAman: 'Undangan_Rapat.pdf', logicalPath: `dokumen/${DOC_A}/a.pdf`, kunci: `DOKUMEN:${DOC_A}:0` },
          { namaAman: 'Foto_Rapat.jpg', logicalPath: `dokumen/${DOC_A}/b.JPG`, kunci: `DOKUMEN:${DOC_A}:2` },
        ],
      },
      {
        folderPath: '[Manual] Kuitansi_55555555',
        files: [{ namaAman: 'Kuitansi.pdf', logicalPath: `manual/${MANUAL}/k.pdf`, kunci: `MANUAL:${MANUAL}:${ATT}` }],
      },
    ]

    const { files, dilewati } = rencanakanFileDrive(entries)
    expect(dilewati).toEqual([])
    expect(files).toEqual([
      {
        sumber: 'DOKUMEN', dokumenId: DOC_A, lampiranIndex: 0, manualArsipId: null, attachmentId: null,
        kunci: `DOKUMEN:${DOC_A}:0`, namaFile: 'Undangan_Rapat.pdf', labelDokumen: '2026-10-01_Rapat_33333333',
        urutan: 0, contentType: 'application/pdf',
      },
      expect.objectContaining({ kunci: `DOKUMEN:${DOC_A}:2`, lampiranIndex: 2, urutan: 1, contentType: 'image/jpeg' }),
      {
        sumber: 'MANUAL_ARSIP', dokumenId: null, lampiranIndex: null, manualArsipId: MANUAL, attachmentId: ATT,
        kunci: `MANUAL:${MANUAL}:${ATT}`, namaFile: 'Kuitansi.pdf', labelDokumen: '[Manual] Kuitansi_55555555',
        urutan: 2, contentType: 'application/pdf',
      },
    ])
  })

  it('nama ganda antar-dokumen di-dedup di tingkat folder tautan (P3) dengan akhiran (2), (3)', () => {
    const file = (doc: string, i: number) => ({ namaAman: 'Undangan.pdf', logicalPath: `d/${doc}/${i}.pdf`, kunci: `DOKUMEN:${doc}:${i}` })
    const { files } = rencanakanFileDrive([
      { folderPath: 'A', files: [file(DOC_A, 0), file(DOC_A, 1)] },
      { folderPath: 'B', files: [file(DOC_B, 0)] },
    ])
    expect(files.map((f) => f.namaFile)).toEqual(['Undangan.pdf', 'Undangan (2).pdf', 'Undangan (3).pdf'])
  })

  it('nama yang bentrok dengan DAFTAR_ISI.txt diberi akhiran', () => {
    const { files } = rencanakanFileDrive([
      { folderPath: 'A', files: [{ namaAman: 'DAFTAR_ISI.txt', logicalPath: 'd/x.txt', kunci: `DOKUMEN:${DOC_A}:0` }] },
    ])
    expect(files[0]).toMatchObject({ namaFile: 'DAFTAR_ISI (2).txt', contentType: 'text/plain; charset=utf-8' })
  })

  it('entri tanpa file masuk daftar dilewati dengan alasannya', () => {
    const { files, dilewati } = rencanakanFileDrive([
      { folderPath: 'Kosong', files: [] },
      { folderPath: '[Manual] Lama', files: [], skipReason: 'berkas dimusnahkan, lampiran sudah dihapus' },
    ])
    expect(files).toEqual([])
    expect(dilewati).toEqual([
      { label: 'Kosong', alasan: 'tanpa lampiran tersedia' },
      { label: '[Manual] Lama', alasan: 'berkas dimusnahkan, lampiran sudah dihapus' },
    ])
  })

  it('kunci ganda (dokumen sama dua kali) hanya direncanakan sekali', () => {
    const f = { namaAman: 'a.pdf', logicalPath: 'd/a.pdf', kunci: `DOKUMEN:${DOC_A}:0` }
    const { files } = rencanakanFileDrive([{ folderPath: 'A', files: [f] }, { folderPath: 'A', files: [f] }])
    expect(files).toHaveLength(1)
  })

  it.each([
    ['tanpa kunci', undefined],
    ['kunci rusak', 'DOKUMEN:bukan-uuid:0'],
    ['sumber tak dikenal', `LAIN:${DOC_A}:0`],
  ])('%s -> galat program', (_label, kunci) => {
    expect(() => rencanakanFileDrive([{ folderPath: 'A', files: [{ namaAman: 'a.pdf', logicalPath: 'd/a.pdf', kunci }] }]))
      .toThrow('Entri ZIP tanpa kunci lampiran yang sah')
  })
})
