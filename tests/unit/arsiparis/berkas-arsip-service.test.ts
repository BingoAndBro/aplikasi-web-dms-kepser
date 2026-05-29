import { describe, expect, it } from 'vitest'
import {
  addManualDocumentToOpenBerkas,
  addWorkflowDocumentToOpenBerkas,
  BerkasArsipServiceError,
  buildCloseBerkasPlan,
  closeBerkasArsip,
  getOrCreateOpenBerkasForKlasifikasi,
  type BerkasArsipRepository,
} from '#/lib/archive/berkas-arsip-service'

const ACTOR_ID = 'actor-user'
const KLASIFIKASI_ID = 'klasifikasi-belanja-barang'
const BERKAS_ID = 'berkas-belanja-barang-open'
const CLOSED_BERKAS_ID = 'berkas-belanja-barang-closed'
const DOKUMEN_ID = 'dokumen-workflow'
const MANUAL_ARSIP_ID = 'manual-dokumen'
const CANONICAL_ARSIP_ID = 'canonical-arsip'

describe('berkas arsip service foundation', () => {
  it('creates an OPEN berkas from active master classification snapshots', async () => {
    const repository = createFakeRepository()

    const created = await getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(created).toMatchObject({
      klasifikasi_id: KLASIFIKASI_ID,
      klasifikasi_kode_snapshot: 'BB',
      klasifikasi_nama_snapshot: 'Belanja Barang',
      status_berkas: 'OPEN',
      created_by: ACTOR_ID,
    })
    expect(repository.calls).toContainEqual(['findActiveKlasifikasi', KLASIFIKASI_ID])
    expect(repository.calls).toContainEqual(['insertOpenBerkas', KLASIFIKASI_ID, 'BB', 'Belanja Barang'])
  })

  it('recovers get-or-create when concurrent open-folder creation hits a unique conflict', async () => {
    const repository = createFakeRepository({
      insertOpenBerkasError: Object.assign(new Error('unique conflict'), { code: '23505' }),
      openAfterConflict: true,
    })

    const berkas = await getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(berkas.id).toBe(BERKAS_ID)
    expect(repository.calls.filter(([name]) => name === 'findOpenBerkasByKlasifikasiId')).toHaveLength(2)
  })

  it('rejects adding a workflow document to a CLOSED berkas', async () => {
    const repository = createFakeRepository()

    await expect(addWorkflowDocumentToOpenBerkas({
      berkasId: CLOSED_BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_CLOSED',
    })

    expect(repository.calls).not.toContainEqual(['insertBerkasItem'])
  })

  it('adds a manual document only to an OPEN matching berkas and keeps the canonical bridge id', async () => {
    const repository = createFakeRepository()

    const item = await addManualDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      manualArsipId: MANUAL_ARSIP_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(item).toMatchObject({
      source_type: 'MANUAL',
      manual_arsip_id: MANUAL_ARSIP_ID,
      dokumen_id: null,
      canonical_arsip_id: CANONICAL_ARSIP_ID,
      added_by: ACTOR_ID,
    })
  })

  it('rejects source items whose selected jenis pembayaran does not match the target berkas', async () => {
    const repository = createFakeRepository({
      workflowKlasifikasiId: 'klasifikasi-lain',
    })

    await expect(addWorkflowDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'SOURCE_KLASIFIKASI_MISMATCH',
    })

    expect(repository.calls).not.toContainEqual(['insertBerkasItem'])
  })

  it('rejects closing an empty berkas', async () => {
    const repository = createFakeRepository({ itemCount: 0 })

    await expect(closeBerkasArsip({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: validCloseMetadata(),
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_EMPTY',
    })
  })

  it('rejects closing an already CLOSED berkas', async () => {
    const repository = createFakeRepository()

    await expect(closeBerkasArsip({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: validCloseMetadata(),
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_NOT_OPEN',
    })
  })

  it('computes close-folder retention dates from closed_at', () => {
    const plan = buildCloseBerkasPlan({
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      closed_at: '2026-05-29',
    })

    expect(plan).toMatchObject({
      nomorSpm: 'SPM-001/2026',
      retensiAktif: '1 Tahun',
      retensiInaktif: '3 Tahun',
      closedAtDateOnly: '2026-05-29',
      masaAktifBerakhir: '2027-05-29',
      masaInaktifBerakhir: '2030-05-29',
    })
    expect(plan.closedAt.toISOString()).toBe('2026-05-29T00:00:00.000Z')
  })

  it('closes a non-empty OPEN berkas without source item or canonical archive mutation', async () => {
    const repository = createFakeRepository({ itemCount: 2 })

    const closed = await closeBerkasArsip({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: validCloseMetadata(),
    }, { repository })

    expect(closed).toMatchObject({
      status_berkas: 'CLOSED',
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      masa_aktif_berakhir: '2027-05-29',
      masa_inaktif_berakhir: '2030-05-29',
      closed_by: ACTOR_ID,
    })
    expect(repository.calls).toContainEqual(['closeOpenBerkas', BERKAS_ID, ACTOR_ID])
    expect(repository.calls.some(([name]) => name === 'insertBerkasItem')).toBe(false)
  })

  it('rejects invalid close-folder metadata', () => {
    expect(() => buildCloseBerkasPlan({
      nomor_spm: '',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
    })).toThrow(BerkasArsipServiceError)
  })
})

function validCloseMetadata() {
  return {
    nomor_spm: 'SPM-001/2026',
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    closed_at: '2026-05-29',
  }
}

function createFakeRepository(options: {
  itemCount?: number
  workflowKlasifikasiId?: string | null
  manualKlasifikasiId?: string | null
  insertOpenBerkasError?: unknown
  openAfterConflict?: boolean
} = {}): BerkasArsipRepository & { calls: unknown[][] } {
  const calls: unknown[][] = []
  let openLookupCount = 0

  return {
    calls,
    async findActiveKlasifikasi(id) {
      calls.push(['findActiveKlasifikasi', id])
      if (id !== KLASIFIKASI_ID) return null
      return {
        id,
        kode: 'BB',
        nama: 'Belanja Barang',
      }
    },
    async findOpenBerkasByKlasifikasiId(klasifikasiId) {
      calls.push(['findOpenBerkasByKlasifikasiId', klasifikasiId])
      openLookupCount += 1
      if (options.openAfterConflict && openLookupCount > 1) {
        return openBerkas()
      }
      return null
    },
    async insertOpenBerkas(input) {
      calls.push([
        'insertOpenBerkas',
        input.klasifikasi.id,
        input.klasifikasi.kode,
        input.klasifikasi.nama,
      ])
      if (options.insertOpenBerkasError) throw options.insertOpenBerkasError
      return openBerkas({
        id: 'berkas-created',
        createdBy: input.actorUserId,
        klasifikasiKodeSnapshot: input.klasifikasi.kode,
        klasifikasiNamaSnapshot: input.klasifikasi.nama,
      })
    },
    async findBerkasById(id) {
      calls.push(['findBerkasById', id])
      if (id === BERKAS_ID) return openBerkas()
      if (id === CLOSED_BERKAS_ID) return closedBerkas()
      return null
    },
    async findWorkflowSource(dokumenId) {
      calls.push(['findWorkflowSource', dokumenId])
      if (dokumenId !== DOKUMEN_ID) return null
      return {
        id: dokumenId,
        klasifikasiId: options.workflowKlasifikasiId ?? KLASIFIKASI_ID,
        canonicalArsipId: CANONICAL_ARSIP_ID,
      }
    },
    async findManualSource(manualArsipId) {
      calls.push(['findManualSource', manualArsipId])
      if (manualArsipId !== MANUAL_ARSIP_ID) return null
      return {
        id: manualArsipId,
        klasifikasiId: options.manualKlasifikasiId ?? KLASIFIKASI_ID,
        canonicalArsipId: CANONICAL_ARSIP_ID,
      }
    },
    async insertBerkasItem(input) {
      calls.push(['insertBerkasItem', input.berkasId, input.sourceType])
      return {
        id: 'berkas-item',
        berkasId: input.berkasId,
        sourceType: input.sourceType,
        dokumenId: input.dokumenId,
        manualArsipId: input.manualArsipId,
        canonicalArsipId: input.canonicalArsipId,
        addedBy: input.actorUserId,
      }
    },
    async countBerkasItems(berkasId) {
      calls.push(['countBerkasItems', berkasId])
      return options.itemCount ?? 1
    },
    async closeOpenBerkas(input) {
      calls.push(['closeOpenBerkas', input.berkasId, input.actorUserId])
      return {
        ...openBerkas(),
        statusBerkas: 'CLOSED',
        nomorSpm: input.plan.nomorSpm,
        retensiAktif: input.plan.retensiAktif,
        retensiInaktif: input.plan.retensiInaktif,
        masaAktifBerakhir: input.plan.masaAktifBerakhir,
        masaInaktifBerakhir: input.plan.masaInaktifBerakhir,
        closedAt: input.plan.closedAt,
        closedBy: input.actorUserId,
      }
    },
  }
}

function openBerkas(overrides: Partial<ReturnType<typeof baseBerkas>> = {}) {
  return {
    ...baseBerkas(),
    ...overrides,
  }
}

function closedBerkas() {
  return {
    ...baseBerkas(),
    id: CLOSED_BERKAS_ID,
    statusBerkas: 'CLOSED' as const,
    nomorSpm: 'SPM-CLOSED',
    retensiAktif: '1 Tahun',
    retensiInaktif: '3 Tahun',
    masaAktifBerakhir: '2027-05-29',
    masaInaktifBerakhir: '2030-05-29',
    closedAt: new Date('2026-05-29T00:00:00.000Z'),
    closedBy: ACTOR_ID,
  }
}

function baseBerkas() {
  return {
    id: BERKAS_ID,
    klasifikasiId: KLASIFIKASI_ID,
    klasifikasiKodeSnapshot: 'BB',
    klasifikasiNamaSnapshot: 'Belanja Barang',
    statusBerkas: 'OPEN' as const,
    nomorSpm: null,
    retensiAktif: null,
    retensiInaktif: null,
    masaAktifBerakhir: null,
    masaInaktifBerakhir: null,
    closedAt: null,
    closedBy: null,
    createdBy: ACTOR_ID,
  }
}
