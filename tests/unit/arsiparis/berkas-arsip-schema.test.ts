import { describe, expect, it } from 'vitest'
import {
  BERKAS_STATUS,
  BERKAS_STATUS_VALUES,
} from '#/lib/constants/archive-status'
import {
  berkasItemSourceTypeSchema,
  berkasStatusSchema,
  closeBerkasMetadataSchema,
} from '#/lib/schemas/berkas-arsip'

describe('berkas arsip schema foundation', () => {
  it('keeps folder status constants minimal', () => {
    expect(BERKAS_STATUS_VALUES).toEqual(['OPEN', 'CLOSED'])
    expect(BERKAS_STATUS.OPEN).toBe('OPEN')
    expect(BERKAS_STATUS.CLOSED).toBe('CLOSED')
    expect(berkasStatusSchema.safeParse('INAKTIF').success).toBe(false)
  })

  it('allows only current source types for folder items', () => {
    expect(berkasItemSourceTypeSchema.parse('WORKFLOW')).toBe('WORKFLOW')
    expect(berkasItemSourceTypeSchema.parse('MANUAL')).toBe('MANUAL')
    expect(berkasItemSourceTypeSchema.safeParse('LEGACY').success).toBe(false)
  })

  it('validates future close-folder metadata without runtime wiring', () => {
    const parsed = closeBerkasMetadataSchema.parse({
      nomor_spm: '  SPM-001/2026  ',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      closed_at: '2026-05-29',
    })

    expect(parsed).toEqual({
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      closed_at: '2026-05-29',
    })
  })

  it('rejects incomplete close-folder metadata', () => {
    const parsed = closeBerkasMetadataSchema.safeParse({
      nomor_spm: '',
      retensi_aktif: '2 Tahun',
      retensi_inaktif: '3 Tahun',
      closed_at: '2026-02-31',
    })

    expect(parsed.success).toBe(false)
  })
})
