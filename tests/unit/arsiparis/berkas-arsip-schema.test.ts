import { describe, expect, it } from 'vitest'
import * as arsipSchema from '#/db/schema/arsip'
import { berkasArsip, berkasArsipActivity, berkasArsipItem } from '#/db/schema/arsip/berkas-arsip'
import { manualArsip } from '#/db/schema/arsip/manual-arsip'
import {
  BERKAS_ACTIVITY_EVENT_LABELS,
  BERKAS_ACTIVITY_EVENT_TYPES,
} from '#/lib/archive/berkas-arsip-activity'
import {
  BERKAS_ARCHIVE_STATUS,
  BERKAS_ARCHIVE_STATUS_VALUES,
  BERKAS_STATUS,
  BERKAS_STATUS_VALUES,
} from '#/lib/constants/archive-status'
import {
  addBerkasItemRequestSchema,
  berkasArchiveStatusSchema,
  berkasItemSourceTypeSchema,
  berkasStatusSchema,
  closeBerkasMetadataSchema,
  nullableBerkasArchiveStatusSchema,
  openBerkasRequestSchema,
} from '#/lib/schemas/berkas-arsip'

describe('berkas arsip schema foundation', () => {
  it('keeps folder status constants minimal', () => {
    expect(BERKAS_STATUS_VALUES).toEqual(['OPEN', 'CLOSED'])
    expect(BERKAS_STATUS.OPEN).toBe('OPEN')
    expect(BERKAS_STATUS.CLOSED).toBe('CLOSED')
    expect(berkasStatusSchema.safeParse('INAKTIF').success).toBe(false)
  })

  it('reuses archive lifecycle values for nullable folder lifecycle foundation', () => {
    expect(BERKAS_ARCHIVE_STATUS_VALUES).toEqual(['AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN'])
    expect(BERKAS_ARCHIVE_STATUS.AKTIF).toBe('AKTIF')
    expect(BERKAS_ARCHIVE_STATUS.INAKTIF).toBe('INAKTIF')
    expect(BERKAS_ARCHIVE_STATUS.USUL_MUSNAH).toBe('USUL_MUSNAH')
    expect(BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN).toBe('DIMUSNAHKAN')
    expect(berkasArchiveStatusSchema.parse('AKTIF')).toBe('AKTIF')
    expect(nullableBerkasArchiveStatusSchema.parse(null)).toBeNull()
    expect(nullableBerkasArchiveStatusSchema.safeParse('VERIFIKASI_PENYUSUTAN').success).toBe(false)
  })

  it('models folder archive lifecycle as nullable on berkas_arsip', () => {
    expect(berkasArsip.statusArsip.name).toBe('status_arsip')
    expect(berkasArsip.statusArsip.notNull).toBe(false)
  })

  it('models append-only berkas activity events separately from document workflow logs', () => {
    expect(BERKAS_ACTIVITY_EVENT_TYPES).toEqual([
      'BERKAS_DIBUKA',
      'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN',
      'DOKUMEN_MANUAL_DITAMBAHKAN',
      'BERKAS_DITUTUP',
      'METADATA_ARSIP_AKTIF_DIPERBARUI',
      'BERKAS_DIPINDAHKAN_KE_INAKTIF',
      'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH',
      'BERKAS_DIMUSNAHKAN',
    ])
    expect(BERKAS_ACTIVITY_EVENT_LABELS.DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN)
      .toBe('Dokumen Persetujuan diklasifikasikan')
    expect(BERKAS_ACTIVITY_EVENT_LABELS.BERKAS_DIMUSNAHKAN).toBe('File berkas dibersihkan')
    expect(berkasArsipActivity.berkasId.name).toBe('berkas_id')
    expect(berkasArsipActivity.actorUserId.name).toBe('actor_user_id')
    expect(berkasArsipActivity.actorUserId.notNull).toBe(false)
    expect(berkasArsipActivity.workflowDocumentId.name).toBe('workflow_document_id')
    expect(berkasArsipActivity.manualDocumentId.name).toBe('manual_document_id')
    expect(berkasArsipActivity.createdAt.name).toBe('created_at')
    expect(berkasArsipActivity).not.toHaveProperty('logicalPath')
    expect(berkasArsipActivity).not.toHaveProperty('physicalPath')
    expect(berkasArsipActivity).not.toHaveProperty('token')
  })

  it('does not export legacy canonical archive schema objects', () => {
    const exportedKeys = Object.keys(arsipSchema)

    expect(exportedKeys).not.toContain('arsip')
    expect(exportedKeys).not.toContain(['arsip', 'Usul', 'Musnah'].join(''))
    expect(berkasArsipItem).not.toHaveProperty(['canonical', 'Arsip', 'Id'].join(''))
    expect(manualArsip).not.toHaveProperty(['canonical', 'Arsip', 'Id'].join(''))
    expect(exportedKeys.some((key) => key.includes(['lampiran', 'Snapshot'].join('')))).toBe(false)
  })

  it('allows only current source types for folder items', () => {
    expect(berkasItemSourceTypeSchema.parse('WORKFLOW')).toBe('WORKFLOW')
    expect(berkasItemSourceTypeSchema.parse('MANUAL')).toBe('MANUAL')
    expect(berkasItemSourceTypeSchema.safeParse('LEGACY').success).toBe(false)
  })

  it('validates close-folder metadata with a single Masa Simpan Minimal field (RP-01)', () => {
    const parsed = closeBerkasMetadataSchema.parse({
      nomor_spm: '  SPM-001/2026  ',
      retensi_aktif: '1 Tahun',
      closed_at: '2026-05-29',
    })

    expect(parsed).toEqual({
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      closed_at: '2026-05-29',
    })
  })

  it('rejects a payload that still sends retensi_inaktif (RP-01 .strict())', () => {
    expect(closeBerkasMetadataSchema.safeParse({
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
    }).success).toBe(false)
  })

  it('rejects incomplete close-folder metadata', () => {
    const parsed = closeBerkasMetadataSchema.safeParse({
      nomor_spm: '',
      retensi_aktif: '2 Tahun',
      closed_at: '2026-02-31',
    })

    expect(parsed.success).toBe(false)
  })

  it('validates open-folder request by classification id and tahun anggaran', () => {
    expect(openBerkasRequestSchema.parse({
      klasifikasi_id: '11111111-1111-4111-8111-111111111111',
      tahun_anggaran: 2026,
    })).toEqual({
      klasifikasi_id: '11111111-1111-4111-8111-111111111111',
      tahun_anggaran: 2026,
    })

    expect(openBerkasRequestSchema.safeParse({ klasifikasi_id: 'not-a-uuid', tahun_anggaran: 2026 }).success).toBe(false)
    expect(openBerkasRequestSchema.safeParse({ klasifikasi_id: '11111111-1111-4111-8111-111111111111' }).success).toBe(false)
  })

  it('validates source-specific add-item bodies strictly', () => {
    expect(addBerkasItemRequestSchema.parse({
      source_type: 'WORKFLOW',
      dokumen_id: '22222222-2222-4222-8222-222222222222',
    })).toEqual({
      source_type: 'WORKFLOW',
      dokumen_id: '22222222-2222-4222-8222-222222222222',
    })

    expect(addBerkasItemRequestSchema.parse({
      source_type: 'MANUAL',
      manual_arsip_id: '33333333-3333-4333-8333-333333333333',
    })).toEqual({
      source_type: 'MANUAL',
      manual_arsip_id: '33333333-3333-4333-8333-333333333333',
    })

    expect(addBerkasItemRequestSchema.safeParse({
      source_type: 'WORKFLOW',
      dokumen_id: '22222222-2222-4222-8222-222222222222',
      manual_arsip_id: '33333333-3333-4333-8333-333333333333',
    }).success).toBe(false)

    expect(addBerkasItemRequestSchema.safeParse({
      source_type: 'MANUAL',
      dokumen_id: '22222222-2222-4222-8222-222222222222',
    }).success).toBe(false)
  })
})
