import { describe, expect, it, vi } from 'vitest'
import { validateResubmitRequirements } from '#/lib/dokumen/resubmit-validation'
import {
  checkLampiranNotEmpty,
  checkRequiredKelengkapan,
  EMPTY_ATTACHMENTS_MESSAGE,
} from '#/lib/dokumen/local-submit-write-bridge'

const REQUIRED_ID = '88888888-8888-4888-8888-888888888888'
const OTHER_ID = '99999999-9999-4999-9999-999999999999'

const materialDokumen = {
  isNonMaterial: false,
  kegiatanId: 'kegiatan',
  isKetuaTim: true,
  komponenId: 'komponen',
  jenisPermintaanId: 'jenis',
  kategoriPermintaanId: 'kategori',
  detailPermintaanId: null,
}

function lampiran(kelengkapanId: string) {
  return { kelengkapan_id: kelengkapanId, nama: 'Kuitansi', url: 'formal/a.pdf', uploaded_at: '2026-09-01T00:00:00.000Z' }
}

function fakeRepository() {
  return {
    getRequiredKelengkapan: vi.fn(async () => [
      { id: REQUIRED_ID, namaDokumen: 'Kuitansi', required: true },
    ]),
  }
}

describe('validateResubmitRequirements', () => {
  it('reads the checklist with the exact six-column key of the document', async () => {
    const repository = fakeRepository()

    const result = await validateResubmitRequirements({
      dokumen: materialDokumen,
      lampiranUrls: [lampiran(REQUIRED_ID)],
      nominalRealisasi: '1500000.00',
      repository,
    })

    expect(result).toEqual({ ok: true })
    expect(repository.getRequiredKelengkapan).toHaveBeenCalledWith({
      kegiatanId: 'kegiatan',
      isKetuaTim: true,
      komponenId: 'komponen',
      jenisPermintaanId: 'jenis',
      kategoriPermintaanId: 'kategori',
      detailPermintaanId: null,
    })
  })

  it.each([0, '0.00', null, -1])('rejects Material nominal %s (must be > 0)', async (nominal) => {
    const repository = fakeRepository()

    const result = await validateResubmitRequirements({
      dokumen: materialDokumen,
      lampiranUrls: [lampiran(REQUIRED_ID)],
      nominalRealisasi: nominal,
      repository,
    })

    expect(result).toEqual({ ok: false, error: 'Nominal_realisasi wajib untuk dokumen Material' })
    expect(repository.getRequiredKelengkapan).not.toHaveBeenCalled()
  })

  it.each([
    ['Material', materialDokumen],
    ['Non-Material', { ...materialDokumen, isNonMaterial: true, jenisPermintaanId: null }],
  ] as const)('rejects a %s resubmit with zero lampiran, like SUBMIT (checkLampiranNotEmpty)', async (_label, dokumen) => {
    const repository = fakeRepository()

    const result = await validateResubmitRequirements({
      dokumen,
      lampiranUrls: [],
      nominalRealisasi: dokumen.isNonMaterial ? null : 1500000,
      repository,
    })

    expect(result).toEqual({ ok: false, error: EMPTY_ATTACHMENTS_MESSAGE })
    expect(checkLampiranNotEmpty([]).ok).toBe(false)
    expect(repository.getRequiredKelengkapan).not.toHaveBeenCalled()
  })

  it('returns the same missing-kelengkapan message as the SUBMIT path', async () => {
    const repository = fakeRepository()
    // Non-empty but pointing at a different kelengkapan_id, so the required
    // one is still missing — this isolates the checklist rule from the
    // separate "at least one lampiran" rule.
    const unrelatedLampiran = [lampiran(OTHER_ID)]
    const submitResult = await checkRequiredKelengkapan(repository, materialDokumen, unrelatedLampiran)

    const result = await validateResubmitRequirements({
      dokumen: materialDokumen,
      lampiranUrls: unrelatedLampiran,
      nominalRealisasi: 1500000,
      repository,
    })

    expect(submitResult.ok).toBe(false)
    expect(result).toEqual({
      ok: false,
      error: 'Lampiran wajib belum lengkap: Kuitansi',
      missingRequiredNames: ['Kuitansi'],
    })
    if (!submitResult.ok) expect(result).toMatchObject({ error: submitResult.issue.message })
  })

  it('skips nominal and checklist for Non-Material documents, like SUBMIT (still requires a lampiran)', async () => {
    const repository = fakeRepository()

    const result = await validateResubmitRequirements({
      dokumen: { ...materialDokumen, isNonMaterial: true, jenisPermintaanId: null },
      lampiranUrls: [lampiran(OTHER_ID)],
      nominalRealisasi: null,
      repository,
    })

    expect(result).toEqual({ ok: true })
    expect(repository.getRequiredKelengkapan).not.toHaveBeenCalled()
  })

  // D-12 policy: the Ketua Tim value is locked at SUBMIT time and RESUBMIT
  // never re-verifies it against the current assignment roster, even when the
  // repository could answer that question. The type of `repository` only
  // exposes `getRequiredKelengkapan`, so this is enforced by the compiler as
  // well as at runtime.
  it('never re-verifies the Ketua Tim assignment on resubmit, even if it changed after submit', async () => {
    const repository = fakeRepository()
    // The document was submitted as Ketua Tim (isKetuaTim: true, locked in
    // `materialDokumen`). Assume the admin has since removed that assignment
    // — resubmit must still use the stored value and check the Ketua Tim
    // checklist, not silently fall back to the Anggota checklist.
    const hasKetuaTimAssignment = vi.fn(async () => false)

    const result = await validateResubmitRequirements({
      dokumen: materialDokumen,
      lampiranUrls: [lampiran(REQUIRED_ID)],
      nominalRealisasi: '1500000.00',
      repository: { ...repository, hasKetuaTimAssignment } as typeof repository,
    })

    expect(result).toEqual({ ok: true })
    expect(repository.getRequiredKelengkapan).toHaveBeenCalledWith(
      expect.objectContaining({ isKetuaTim: true }),
    )
    expect(hasKetuaTimAssignment).not.toHaveBeenCalled()
  })
})
