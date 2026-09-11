import { describe, expect, it } from 'vitest'
import { deriveWorkflowNamaArsip } from '#/lib/archive/workflow-nama-arsip'

describe('deriveWorkflowNamaArsip', () => {
  it('combines document type and title when both are available', () => {
    expect(deriveWorkflowNamaArsip({
      namaDokumen: 'Laporan Kinerja',
      judul: '  Realisasi   Triwulan I  ',
      kegiatanNama: 'Kegiatan fallback',
    })).toBe('Laporan Kinerja - Realisasi Triwulan I')
  })

  it('uses title before kegiatan name', () => {
    expect(deriveWorkflowNamaArsip({
      judul: 'Dokumen Final',
      kegiatanNama: 'Kegiatan fallback',
    })).toBe('Dokumen Final')
  })

  it('falls back to kegiatan name and then a generic safe name', () => {
    expect(deriveWorkflowNamaArsip({
      kegiatanNama: 'Penyusunan Publikasi',
    })).toBe('Penyusunan Publikasi')

    expect(deriveWorkflowNamaArsip({
      judul: '   ',
      namaDokumen: null,
      kegiatanNama: '',
    })).toBe('Arsip Dokumen')
  })

  it('caps the derived name to a bounded length', () => {
    expect(deriveWorkflowNamaArsip({
      judul: 'x'.repeat(300),
    })).toHaveLength(255)
  })
})
