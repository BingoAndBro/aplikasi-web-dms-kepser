import { describe, expect, it } from 'vitest'
import {
  findDuplicateAdditionalKelengkapanName,
  normalizeKelengkapanName,
} from '#/lib/kelengkapan-validation'
import {
  createAndSubmitDokumenSchema,
  resubmitDokumenSchema,
  updateDokumenSchema,
} from '#/lib/schemas/dokumen'

const USER_CUSTOM_A = 'user-custom-11111111-1111-4111-8111-111111111111'
const USER_CUSTOM_B = 'user-custom-22222222-2222-4222-8222-222222222222'
const MASTER_A = '33333333-3333-4333-8333-333333333333'
const MASTER_B = '44444444-4444-4444-8444-444444444444'

describe('kelengkapan duplicate validation', () => {
  it('normalizes names by trimming, collapsing spaces, and lowercasing', () => {
    expect(normalizeKelengkapanName('  Bukti   Transfer  Final  ')).toBe('bukti transfer final')
  })

  it('detects duplicate additional kelengkapan names with case and whitespace differences', () => {
    expect(findDuplicateAdditionalKelengkapanName([
      lampiran(USER_CUSTOM_A, 'Bukti Transfer'),
      lampiran(USER_CUSTOM_B, '  bukti   transfer '),
    ])).toBe('bukti   transfer')
  })

  it('does not treat master kelengkapan names as additional duplicates', () => {
    expect(findDuplicateAdditionalKelengkapanName([
      lampiran(MASTER_A, 'Surat Tugas'),
      lampiran(MASTER_B, ' surat   tugas '),
    ])).toBeNull()
  })

  it('rejects duplicate additional kelengkapan in submit request schema', () => {
    const parsed = createAndSubmitDokumenSchema.safeParse({
      fungsiId: '55555555-5555-4555-8555-555555555555',
      kegiatanJenisId: '66666666-6666-4666-8666-666666666666',
      isKetuaTim: false,
      tahun: 2020,
      tanggal: '2020-01-01',
      lampiranUrls: [
        lampiran(USER_CUSTOM_A, 'Bukti Transfer'),
        lampiran(USER_CUSTOM_B, '  bukti   transfer '),
      ],
      nominal_realisasi: 1000,
      is_non_material: false,
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain('Nama kelengkapan tambahan tidak boleh duplikat')
    }
  })

  it('allows distinct additional kelengkapan names in submit request schema', () => {
    const parsed = createAndSubmitDokumenSchema.safeParse({
      fungsiId: '55555555-5555-4555-8555-555555555555',
      kegiatanJenisId: '66666666-6666-4666-8666-666666666666',
      isKetuaTim: false,
      tahun: 2020,
      tanggal: '2020-01-01',
      lampiranUrls: [
        lampiran(USER_CUSTOM_A, 'Bukti Transfer'),
        lampiran(USER_CUSTOM_B, 'Daftar Hadir'),
      ],
      nominal_realisasi: 1000,
      is_non_material: false,
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects duplicate additional kelengkapan in revisi and PPK resubmit schemas', () => {
    const payload = {
      lampiranUrls: [
        lampiran(USER_CUSTOM_A, 'Dokumen Pendukung'),
        lampiran(USER_CUSTOM_B, 'dokumen   pendukung'),
      ],
    }

    expect(updateDokumenSchema.safeParse(payload).success).toBe(false)
    expect(resubmitDokumenSchema.safeParse(payload).success).toBe(false)
  })
})

function lampiran(kelengkapanId: string, nama: string) {
  return {
    kelengkapan_id: kelengkapanId,
    nama,
    url: `${kelengkapanId}/file.pdf`,
    uploaded_at: '2026-05-20T00:00:00.000Z',
  }
}
