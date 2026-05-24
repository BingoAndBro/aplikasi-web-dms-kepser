import { describe, expect, it } from 'vitest'

import {
  assertManualArchiveReadyForCanonicalWrite,
  buildManualArchiveCanonicalInsertValues,
  buildManualArchiveCanonicalUpdateValues,
  createManualArchiveCanonicalWritePlan,
  ManualArchiveCanonicalError,
  type ManualArchiveCanonicalSource,
} from '#/lib/archive/manual-archive-canonical'

const MANUAL_ARCHIVE_ID = '11111111-1111-4111-8111-111111111111'
const CANONICAL_ARCHIVE_ID = '22222222-2222-4222-8222-222222222222'
const CREATED_BY = '33333333-3333-4333-8333-333333333333'
const ARCHIVED_BY = '44444444-4444-4444-8444-444444444444'
const KLASIFIKASI_ID = '55555555-5555-4555-8555-555555555555'

describe('manual archive canonical write helper', () => {
  it('builds canonical MANUAL insert values from a complete source row', () => {
    const insertValues = buildManualArchiveCanonicalInsertValues(completeSource())

    expect(insertValues).toMatchObject({
      sourceType: 'MANUAL',
      dokumenId: null,
      namaArsip: 'Arsip Manual',
      nomorSurat: 'B-001/2026',
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: 'MA.01',
      klasifikasiNamaSnapshot: 'Manual Classification',
      retensiAktif: '1 Tahun',
      retensiInaktif: '3 Tahun',
      masaAktifBerakhir: '2027-05-24',
      masaInaktifBerakhir: '2030-05-24',
      archivedBy: ARCHIVED_BY,
      createdBy: CREATED_BY,
      nominalRealisasi: '250000.00',
      statusArsip: 'AKTIF',
      metadata: {},
    })
    expect(insertValues.archivedAt.toISOString()).toBe('2026-05-24T00:00:00.000Z')
  })

  it('builds canonical MANUAL update values without create-only fields', () => {
    const updateValues = buildManualArchiveCanonicalUpdateValues(completeSource({
      nama: 'Updated Manual Archive',
      nomorSurat: 'B-002/2026',
      tanggalDiarsipkan: '2026-06-01',
      retensiAktif: '5 Tahun',
      retensiInaktif: '10 Tahun',
      masaAktifBerakhir: '2031-06-01',
      masaInaktifBerakhir: '2041-06-01',
      nominalRealisasi: '500000.00',
    }))

    expect(updateValues).toMatchObject({
      namaArsip: 'Updated Manual Archive',
      nomorSurat: 'B-002/2026',
      klasifikasiId: KLASIFIKASI_ID,
      klasifikasiKodeSnapshot: 'MA.01',
      klasifikasiNamaSnapshot: 'Manual Classification',
      retensiAktif: '5 Tahun',
      retensiInaktif: '10 Tahun',
      masaAktifBerakhir: '2031-06-01',
      masaInaktifBerakhir: '2041-06-01',
      archivedBy: ARCHIVED_BY,
      createdBy: CREATED_BY,
      nominalRealisasi: '500000.00',
      statusArsip: 'AKTIF',
      metadata: {},
    })
    expect(updateValues.archivedAt.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(updateValues).not.toHaveProperty('sourceType')
    expect(updateValues).not.toHaveProperty('dokumenId')
  })

  it('fails missing required source fields with controlled error details', () => {
    expect(() => assertManualArchiveReadyForCanonicalWrite(completeSource({
      nomorSurat: '   ',
    }))).toThrow(ManualArchiveCanonicalError)

    try {
      assertManualArchiveReadyForCanonicalWrite(completeSource({
        nomorSurat: null,
      }))
    } catch (error) {
      expect(error).toBeInstanceOf(ManualArchiveCanonicalError)
      expect(error).toMatchObject({
        name: 'ManualArchiveCanonicalError',
        reason: 'missing_required_field',
        field: 'nomorSurat',
        message: 'Manual Archive canonical write blocked: missing_required_field:nomorSurat',
      })
    }
  })

  it('fails non-AKTIF lifecycle values for early alignment', () => {
    const plan = createManualArchiveCanonicalWritePlan(completeSource({
      statusArsip: 'INAKTIF',
    }))

    expect(plan).toEqual({
      action: 'error',
      reason: 'invalid_status',
      field: 'statusArsip',
      message: 'Manual Archive canonical write blocked: invalid_status:statusArsip',
    })
  })

  it('returns reuse when canonicalArsipId already exists and does not build insert values', () => {
    const plan = createManualArchiveCanonicalWritePlan(completeSource({
      canonicalArsipId: ` ${CANONICAL_ARCHIVE_ID} `,
      nama: null,
      statusArsip: 'DIMUSNAHKAN',
    }))

    expect(plan).toEqual({
      action: 'reuse',
      canonicalArsipId: CANONICAL_ARCHIVE_ID,
    })
  })

  it('returns a create plan for unlinked complete source rows', () => {
    const plan = createManualArchiveCanonicalWritePlan(completeSource())

    expect(plan.action).toBe('create')
    if (plan.action !== 'create') throw new Error('expected create plan')
    expect(plan.sourceId).toBe(MANUAL_ARCHIVE_ID)
    expect(plan.insertValues.sourceType).toBe('MANUAL')
    expect(plan.insertValues.dokumenId).toBeNull()
    expect(plan.insertValues.archivedAt.toISOString()).toBe('2026-05-24T00:00:00.000Z')
  })

  it('keeps canonical metadata free of file, token, SQL, env, and storage data', () => {
    const sourceWithHostileExtras = {
      ...completeSource(),
      logical_path: 'manual-arsip/user/source/secret.pdf',
      logicalPath: 'manual-arsip/user/source/secret.pdf',
      physicalPath: 'D:\\storage\\manual-arsip\\secret.pdf',
      storageRoot: 'D:\\storage',
      fileUrl: 'https://files.example.test/secret.pdf',
      signedUrl: 'https://files.example.test/secret.pdf?token=secret-token',
      token: 'secret-token',
      sql: 'select * from secret',
      env: 'DATABASE_URL',
      attachments: [{
        logical_path: 'manual-arsip/user/source/attachment.pdf',
        original_filename: 'attachment.pdf',
        signed_url_token: 'secret-token',
      }],
      metadata: {
        logical_path: 'manual-arsip/user/source/metadata.pdf',
        storage_root: 'D:\\storage',
        token: 'secret-token',
      },
    } as ManualArchiveCanonicalSource & Record<string, unknown>

    const insertValues = buildManualArchiveCanonicalInsertValues(sourceWithHostileExtras)
    const serialized = JSON.stringify(insertValues)

    expect(insertValues.metadata).toEqual({})
    expect(serialized).not.toContain('logical_path')
    expect(serialized).not.toContain('logicalPath')
    expect(serialized).not.toContain('physicalPath')
    expect(serialized).not.toContain('storageRoot')
    expect(serialized).not.toContain('storage_root')
    expect(serialized).not.toContain('manual-arsip')
    expect(serialized).not.toContain('D:\\')
    expect(serialized).not.toContain('https://')
    expect(serialized).not.toContain('fileUrl')
    expect(serialized).not.toContain('signedUrl')
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('select ')
    expect(serialized).not.toContain('DATABASE_URL')
    expect(serialized).not.toContain('attachment.pdf')
  })

  it('converts date-only archive dates deterministically to UTC midnight', () => {
    const first = buildManualArchiveCanonicalInsertValues(completeSource({
      tanggalDiarsipkan: '2026-01-02',
    }))
    const second = buildManualArchiveCanonicalInsertValues(completeSource({
      tanggalDiarsipkan: '2026-01-02',
    }))

    expect(first.archivedAt.toISOString()).toBe('2026-01-02T00:00:00.000Z')
    expect(second.archivedAt.toISOString()).toBe(first.archivedAt.toISOString())
  })

  it('rejects invalid date-only source values with controlled errors', () => {
    const plan = createManualArchiveCanonicalWritePlan(completeSource({
      tanggalDiarsipkan: '2026-02-31',
    }))

    expect(plan).toEqual({
      action: 'error',
      reason: 'invalid_date',
      field: 'tanggalDiarsipkan',
      message: 'Manual Archive canonical write blocked: invalid_date:tanggalDiarsipkan',
    })
  })

  it('does not require or read attachment metadata for canonical creation', () => {
    const insertValues = buildManualArchiveCanonicalInsertValues({
      ...completeSource(),
      attachments: null,
      attachmentCount: 99,
    } as ManualArchiveCanonicalSource & Record<string, unknown>)

    expect(insertValues.namaArsip).toBe('Arsip Manual')
    expect(JSON.stringify(insertValues)).not.toContain('attachment')
    expect(JSON.stringify(insertValues)).not.toContain('attachmentCount')
  })
})

function completeSource(
  overrides: Partial<ManualArchiveCanonicalSource> = {},
): ManualArchiveCanonicalSource {
  return {
    id: MANUAL_ARCHIVE_ID,
    canonicalArsipId: null,
    nama: 'Arsip Manual',
    nomorSurat: 'B-001/2026',
    tanggalDiarsipkan: '2026-05-24',
    klasifikasiId: KLASIFIKASI_ID,
    klasifikasiKodeSnapshot: 'MA.01',
    klasifikasiNamaSnapshot: 'Manual Classification',
    retensiAktif: '1 Tahun',
    retensiInaktif: '3 Tahun',
    masaAktifBerakhir: '2027-05-24',
    masaInaktifBerakhir: '2030-05-24',
    archivedBy: ARCHIVED_BY,
    createdBy: CREATED_BY,
    nominalRealisasi: '250000.00',
    statusArsip: 'AKTIF',
    ...overrides,
  }
}
