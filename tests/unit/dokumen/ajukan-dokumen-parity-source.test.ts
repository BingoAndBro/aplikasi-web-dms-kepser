import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/routes/pegawai/dokumen/aju.tsx', 'utf8')

describe('Phase 15L.1 Ajukan Dokumen parity source guard', () => {
  it('uses three grouped presentation stages with confirmation and an in-page success state', () => {
    expect(source).toContain("'Informasi Dasar'")
    expect(source).toContain("'Kelengkapan'")
    expect(source).toContain("'Review & Ajukan'")
    expect(source).toContain('Ajukan dokumen ini?')
    expect(source).toContain('Pastikan jenis permintaan, kegiatan, nominal realisasi, dan kelengkapan sudah benar.')
    expect(source).toContain('setSubmittedDocument(response.dokumen)')
    expect(source).toContain('Lihat Daftar Dokumen')
    expect(source).toContain('Ajukan Dokumen Lain')
    expect(source).toContain('Lihat Detail Dokumen')
    expect(source).toContain('useAppToast()')
    expect(source).toContain('submitInFlightRef.current')
  })

  it('keeps the visual parity pass bounded to response-backed Ajukan presentation', () => {
    expect(source).toContain('Progress Pengajuan')
    expect(source).toContain('MAJOR_STEP_SUBTITLES')
    expect(source).toContain('Konsekuensi pengajuan')
    expect(source).toContain('Pengajuan selesai')
    expect(source).toContain('<AppDialog')
    expect(source).not.toContain('<ConfirmDialog')
    expect(source).not.toContain('#/routes/api')
  })

  it('preserves the submit endpoint and business payload identifiers', () => {
    expect(source).toContain("apiMutation<SubmitResponse>('/api/dokumen/submit'")
    expect(source).toContain('nominal_realisasi: nominalValue')
    expect(source).toContain('is_non_material: isNonMaterial')
    expect(source).toContain('jenisDokumenId: isNonMaterial ? jenisDokumenId : undefined')
    expect(source).toContain('jenisPermintaanId: !isNonMaterial ? selectedJenisPermintaanId : undefined')
    expect(source).toContain('kategoriPermintaanId: !isNonMaterial ? selectedKategoriPermintaanId : undefined')
    expect(source).toContain('detailPermintaanId: !isNonMaterial ? selectedDetailPermintaanId : undefined')
  })

  it('does not introduce forbidden Ajukan terminology or features', () => {
    expect(source).not.toContain('Simpan Draft')
    expect(source).not.toContain('Nomor Surat')
    expect(source).not.toContain('Cari Arsip')
    expect(source).not.toContain('Laporan Klasifikasi')
  })
})
