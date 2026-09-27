import { describe, expect, it, vi } from 'vitest'
import { validateResubmitRequirements } from '#/lib/dokumen/resubmit-validation'
import { checkRequiredKelengkapan } from '#/lib/dokumen/local-submit-write-bridge'

const REQUIRED_ID = '88888888-8888-4888-8888-888888888888'

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

  it('returns the same missing-kelengkapan message as the SUBMIT path', async () => {
    const repository = fakeRepository()
    const submitResult = await checkRequiredKelengkapan(repository, materialDokumen, [])

    const result = await validateResubmitRequirements({
      dokumen: materialDokumen,
      lampiranUrls: [],
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

  it('skips nominal and checklist for Non-Material documents, like SUBMIT', async () => {
    const repository = fakeRepository()

    const result = await validateResubmitRequirements({
      dokumen: { ...materialDokumen, isNonMaterial: true, jenisPermintaanId: null },
      lampiranUrls: [],
      nominalRealisasi: null,
      repository,
    })

    expect(result).toEqual({ ok: true })
    expect(repository.getRequiredKelengkapan).not.toHaveBeenCalled()
  })
})
