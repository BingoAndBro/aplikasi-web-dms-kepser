import { describe, expect, it } from 'vitest'

import {
  mapManualArchiveToCompatibilityRow,
  mapWorkflowArchiveToCompatibilityRow,
  summarizeUnifiedArchiveBackfillRows,
  type ManualArchiveCompatibilityInput,
  type WorkflowArchiveCompatibilityInput,
} from '#/lib/archive/unified-compatibility'

const WORKFLOW_ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const KLASIFIKASI_ID = '44444444-4444-4444-8444-444444444444'
const MANUAL_ARCHIVE_ID = '55555555-5555-4555-8555-555555555555'

describe('unified archive compatibility mapper', () => {
  it('maps workflow archive rows with canonical fields into a clean compatibility DTO', () => {
    const row = mapWorkflowArchiveToCompatibilityRow(workflowInput())

    expect(row).toMatchObject({
      source_type: 'WORKFLOW',
      source_id: WORKFLOW_ARCHIVE_ID,
      canonical_archive_id: WORKFLOW_ARCHIVE_ID,
      dokumen_transaksi_id: DOKUMEN_ID,
      nama_arsip: 'Laporan Final',
      nomor_surat: 'B-123',
      klasifikasi_id: KLASIFIKASI_ID,
      klasifikasi_kode_snapshot: 'KA.01',
      klasifikasi_nama_snapshot: 'Keuangan',
      tanggal_diarsipkan: '2026-05-01T00:00:00.000Z',
      diarsipkan_oleh: USER_ID,
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      masa_aktif_berakhir: '2027-05-01',
      masa_inaktif_berakhir: '2030-05-01',
      nominal_realisasi: 100000,
      status_arsip: 'AKTIF',
      attachment_count: 2,
    })
    expect(row.missing_fields).toEqual([])
    expect(row.warnings).toEqual([])
    expectNoSensitiveCompatibilityLeak(row)
  })

  it('reports workflow rows missing nama_arsip when no reliable fallback exists', () => {
    const row = mapWorkflowArchiveToCompatibilityRow(workflowInput({
      namaArsip: null,
      documentTitle: null,
    }))

    expect(row.nama_arsip).toBeNull()
    expect(row.missing_fields).toContain('nama_arsip')
    expect(row.warnings).not.toContain('workflow_nama_arsip_derived_from_document_title')
    expectNoSensitiveCompatibilityLeak(row)
  })

  it('reports workflow rows with legacy klasifikasi text but no canonical classification id', () => {
    const row = mapWorkflowArchiveToCompatibilityRow(workflowInput({
      klasifikasiId: null,
      klasifikasiKodeSnapshot: null,
      klasifikasiNamaSnapshot: null,
      klasifikasi: 'Legacy Klasifikasi',
    }))

    expect(row.klasifikasi_id).toBeNull()
    expect(row.missing_fields).toContain('klasifikasi_id')
    expect(row.missing_fields).toContain('klasifikasi_kode_snapshot')
    expect(row.missing_fields).toContain('klasifikasi_nama_snapshot')
    expect(row.warnings).toContain('workflow_legacy_klasifikasi_text_requires_mapping')
    expectNoSensitiveCompatibilityLeak(row)
  })

  it('maps manual nama as transitional nama_arsip and preserves supplied attachment count', () => {
    const row = mapManualArchiveToCompatibilityRow(manualInput({
      attachmentCount: 3,
    }))

    expect(row).toMatchObject({
      source_type: 'MANUAL',
      source_id: MANUAL_ARCHIVE_ID,
      canonical_archive_id: null,
      dokumen_transaksi_id: null,
      nama_arsip: 'Arsip Manual',
      nomor_surat: null,
      tanggal_diarsipkan: '2026-05-10',
      diarsipkan_oleh: USER_ID,
      nominal_realisasi: 250000,
      status_arsip: 'AKTIF',
      attachment_count: 3,
    })
    expect(row.missing_fields).toContain('canonical_archive_id')
    expect(row.missing_fields).toContain('nomor_surat')
    expect(row.warnings).toContain('manual_canonical_parent_required')
    expectNoSensitiveCompatibilityLeak(row)
  })

  it('reports manual archive missing nomor_surat and classification id gaps', () => {
    const row = mapManualArchiveToCompatibilityRow(manualInput({
      klasifikasiId: null,
      klasifikasiKodeSnapshot: null,
      klasifikasiNamaSnapshot: null,
    }))

    expect(row.nomor_surat).toBeNull()
    expect(row.klasifikasi_id).toBeNull()
    expect(row.missing_fields).toContain('nomor_surat')
    expect(row.missing_fields).toContain('klasifikasi_id')
    expect(row.missing_fields).toContain('klasifikasi_kode_snapshot')
    expect(row.missing_fields).toContain('klasifikasi_nama_snapshot')
    expect(row.warnings).toContain('manual_nomor_surat_not_available_in_source')
    expectNoSensitiveCompatibilityLeak(row)
  })

  it('reports old manual rows with missing positive nominal as backfill candidates', () => {
    const row = mapManualArchiveToCompatibilityRow(manualInput({
      nominalRealisasi: null,
    }))

    expect(row.nominal_realisasi).toBeNull()
    expect(row.missing_fields).toContain('nominal_realisasi')
    expect(row.warnings).toContain('manual_nominal_realisasi_nullable_legacy_row')
    expectNoSensitiveCompatibilityLeak(row)
  })

  it('summarizes compatibility rows using controlled missing/warning labels only', () => {
    const workflowRow = mapWorkflowArchiveToCompatibilityRow(workflowInput())
    const manualRow = mapManualArchiveToCompatibilityRow(manualInput({
      klasifikasiId: null,
      nominalRealisasi: null,
    }))

    const summary = summarizeUnifiedArchiveBackfillRows([workflowRow, manualRow])

    expect(summary.total_rows).toBe(2)
    expect(summary.by_source_type).toEqual({
      WORKFLOW: 1,
      MANUAL: 1,
    })
    expect(summary.missing_field_counts.nomor_surat).toBe(1)
    expect(summary.missing_field_counts.nominal_realisasi).toBe(1)
    expect(summary.warning_counts.manual_canonical_parent_required).toBe(1)
    expectNoSensitiveCompatibilityLeak(summary)
  })
})

function workflowInput(
  overrides: Partial<WorkflowArchiveCompatibilityInput> = {},
): WorkflowArchiveCompatibilityInput {
  return {
    id: WORKFLOW_ARCHIVE_ID,
    sourceType: 'WORKFLOW',
    dokumenId: DOKUMEN_ID,
    namaArsip: 'Laporan Final',
    documentTitle: 'Judul Dokumen',
    nomorSurat: 'B-123',
    klasifikasi: null,
    klasifikasiId: KLASIFIKASI_ID,
    klasifikasiKodeSnapshot: 'KA.01',
    klasifikasiNamaSnapshot: 'Keuangan',
    archivedAt: new Date('2026-05-01T00:00:00.000Z'),
    archivedBy: USER_ID,
    createdBy: USER_ID,
    retensiAktif: '1 Tahun',
    retensiInaktif: '3 Tahun',
    masaAktifBerakhir: '2027-05-01',
    masaInaktifBerakhir: '2030-05-01',
    nominalRealisasi: '100000.00',
    statusArsip: 'AKTIF',
    lampiranSnapshot: [
      { kelengkapan_id: 'a', nama: 'Lampiran A', url: 'redacted-by-test' },
      { kelengkapan_id: 'b', nama: 'Lampiran B', url: 'redacted-by-test' },
    ],
    ...overrides,
  }
}

function manualInput(
  overrides: Partial<ManualArchiveCompatibilityInput> = {},
): ManualArchiveCompatibilityInput {
  return {
    id: MANUAL_ARCHIVE_ID,
    nama: 'Arsip Manual',
    tanggal: '2026-05-10',
    createdAt: '2026-05-10T10:00:00.000Z',
    createdBy: USER_ID,
    klasifikasiId: KLASIFIKASI_ID,
    klasifikasiKodeSnapshot: 'MA.01',
    klasifikasiNamaSnapshot: 'Pemeliharaan',
    nominalRealisasi: '250000',
    statusArsip: 'AKTIF',
    attachmentCount: 0,
    ...overrides,
  }
}

function expectNoSensitiveCompatibilityLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
}
